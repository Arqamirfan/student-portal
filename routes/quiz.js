const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { authenticateToken } = require('../middleware/auth');

// GET quizzes for student's course
router.get('/', authenticateToken, (req, res) => {
  const student = db.prepare('SELECT course_id FROM students WHERE id = ?').get(req.student.id);

  const quizzes = db.prepare(`
    SELECT q.*,
      qr.obtained_marks,
      qr.grade,
      qr.submitted_at,
      CASE WHEN qr.id IS NOT NULL THEN 1 ELSE 0 END as attempted
    FROM quizzes q
    LEFT JOIN quiz_results qr ON qr.quiz_id = q.id AND qr.student_id = ?
    WHERE q.course_id = ?
    ORDER BY q.quiz_date DESC
  `).all(req.student.id, student.course_id);

  // Stats
  const stats = {
    total: quizzes.length,
    attempted: quizzes.filter(q => q.attempted).length,
    average: 0
  };

  const attempted = quizzes.filter(q => q.attempted && q.obtained_marks !== null);
  if (attempted.length > 0) {
    const totalPct = attempted.reduce((sum, q) => sum + (q.obtained_marks / q.total_marks * 100), 0);
    stats.average = Math.round(totalPct / attempted.length);
  }

  res.json({ success: true, quizzes, stats });
});

// SUBMIT QUIZ RESULT (self-assessment)
router.post('/:quizId/submit', authenticateToken, (req, res) => {
  const { obtained_marks } = req.body;
  const { quizId } = req.params;

  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });

  // Calculate grade
  const pct = (obtained_marks / quiz.total_marks) * 100;
  let grade = 'F';
  if (pct >= 90) grade = 'A+';
  else if (pct >= 80) grade = 'A';
  else if (pct >= 70) grade = 'B';
  else if (pct >= 60) grade = 'C';
  else if (pct >= 50) grade = 'D';

  try {
    db.prepare(`
      INSERT INTO quiz_results (student_id, quiz_id, obtained_marks, grade)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(student_id, quiz_id) DO UPDATE SET
        obtained_marks = excluded.obtained_marks,
        grade = excluded.grade,
        submitted_at = CURRENT_TIMESTAMP
    `).run(req.student.id, quizId, obtained_marks, grade);

    res.json({ success: true, grade, percentage: Math.round(pct) });
  } catch (err) {
    res.status(500).json({ error: 'Submission failed.' });
  }
});

module.exports = router;
