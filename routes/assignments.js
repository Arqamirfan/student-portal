const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { authenticateToken } = require('../middleware/auth');

// GET assignments
router.get('/', authenticateToken, (req, res) => {
  const student = db.prepare('SELECT course_id FROM students WHERE id = ?').get(req.student.id);

  const assignments = db.prepare(`
    SELECT a.*,
      sub.status as submission_status,
      sub.submitted_at,
      sub.obtained_marks,
      sub.submission_text,
      CASE
        WHEN sub.id IS NOT NULL THEN 1
        WHEN a.due_date < date('now') THEN 2
        ELSE 0
      END as submission_flag
    FROM assignments a
    LEFT JOIN assignment_submissions sub
      ON sub.assignment_id = a.id AND sub.student_id = ?
    WHERE a.course_id = ?
    ORDER BY a.due_date ASC
  `).all(req.student.id, student.course_id);

  const stats = {
    total: assignments.length,
    submitted: assignments.filter(a => a.submission_status).length,
    pending: assignments.filter(a => !a.submission_status && a.submission_flag !== 2).length,
    overdue: assignments.filter(a => !a.submission_status && a.submission_flag === 2).length
  };

  res.json({ success: true, assignments, stats });
});

// SUBMIT ASSIGNMENT
router.post('/:assignmentId/submit', authenticateToken, (req, res) => {
  const { submission_text } = req.body;
  const { assignmentId } = req.params;

  const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(assignmentId);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

  const today = new Date().toISOString().substring(0, 10);
  const isLate = assignment.due_date && today > assignment.due_date;

  try {
    db.prepare(`
      INSERT INTO assignment_submissions (student_id, assignment_id, submission_text, status)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(student_id, assignment_id) DO UPDATE SET
        submission_text = excluded.submission_text,
        status = excluded.status,
        submitted_at = CURRENT_TIMESTAMP
    `).run(req.student.id, assignmentId, submission_text, isLate ? 'late' : 'submitted');

    res.json({
      success: true,
      message: isLate ? 'Assignment submitted (late).' : 'Assignment submitted successfully!',
      late: isLate
    });
  } catch (err) {
    res.status(500).json({ error: 'Submission failed.' });
  }
});

module.exports = router;
