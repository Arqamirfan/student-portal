const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { requireAdmin } = require('../middleware/admin');

// Apply admin middleware to all routes
router.use(requireAdmin);

// ===== DASHBOARD STATS =====
router.get('/stats', (req, res) => {
  const totalStudents = db.prepare('SELECT COUNT(*) as c FROM students').get().c;
  const enrolled = db.prepare("SELECT COUNT(*) as c FROM students WHERE status='enrolled'").get().c;
  const certified = db.prepare("SELECT COUNT(*) as c FROM students WHERE status='certified'").get().c;
  const dropout = db.prepare("SELECT COUNT(*) as c FROM students WHERE status='dropout'").get().c;

  const today = new Date().toISOString().substring(0, 10);
  const presentToday = db.prepare(`SELECT COUNT(*) as c FROM attendance WHERE date=? AND status='present'`).get(today).c;
  const absentToday = db.prepare(`SELECT COUNT(*) as c FROM attendance WHERE date=? AND status='absent'`).get(today).c;

  const totalFees = db.prepare('SELECT SUM(amount) as s FROM fees').get().s || 0;
  const paidFees = db.prepare("SELECT SUM(amount) as s FROM fees WHERE status='paid'").get().s || 0;
  const unpaidFees = totalFees - paidFees;
  const overdueFees = db.prepare(`SELECT COUNT(*) as c FROM fees WHERE status='unpaid' AND due_date < ?`).get(today).c;

  const totalCourses = db.prepare('SELECT COUNT(*) as c FROM courses').get().c;
  const pendingLeaves = db.prepare("SELECT COUNT(*) as c FROM leave_applications WHERE status='pending'").get().c;
  const pendingAssignments = db.prepare("SELECT COUNT(*) as c FROM assignment_submissions WHERE status='submitted'").get().c;

  // Recent enrollments
  const recentStudents = db.prepare(`
    SELECT s.*, c.name as course_name FROM students s
    LEFT JOIN courses c ON s.course_id = c.id
    ORDER BY s.created_at DESC LIMIT 5
  `).all();

  res.json({
    success: true,
    stats: {
      totalStudents, enrolled, certified, dropout,
      presentToday, absentToday,
      totalFees, paidFees, unpaidFees, overdueFees,
      totalCourses, pendingLeaves, pendingAssignments
    },
    recentStudents
  });
});

// ===== STUDENTS MANAGEMENT =====
router.get('/students', (req, res) => {
  const { search, status, course_id } = req.query;
  let query = `
    SELECT s.*, c.name as course_name, c.category
    FROM students s LEFT JOIN courses c ON s.course_id = c.id WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ` AND (s.name LIKE ? OR s.email LIKE ? OR s.student_id LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) { query += ` AND s.status = ?`; params.push(status); }
  if (course_id) { query += ` AND s.course_id = ?`; params.push(course_id); }

  query += ` ORDER BY s.created_at DESC`;
  const students = db.prepare(query).all(...params);
  res.json({ success: true, students });
});

router.get('/students/:id', (req, res) => {
  const student = db.prepare(`
    SELECT s.*, c.name as course_name, c.category, c.total_fee, c.duration_months
    FROM students s LEFT JOIN courses c ON s.course_id = c.id WHERE s.id = ?
  `).get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const attendance = db.prepare(`SELECT * FROM attendance WHERE student_id = ? ORDER BY date DESC LIMIT 30`).all(req.params.id);
  const fees = db.prepare(`SELECT * FROM fees WHERE student_id = ? ORDER BY month`).all(req.params.id);
  const quizzes = db.prepare(`SELECT qr.*, q.title, q.total_marks FROM quiz_results qr JOIN quizzes q ON qr.quiz_id = q.id WHERE qr.student_id = ?`).all(req.params.id);
  const assignments = db.prepare(`SELECT sub.*, a.title FROM assignment_submissions sub JOIN assignments a ON sub.assignment_id = a.id WHERE sub.student_id = ?`).all(req.params.id);

  res.json({ success: true, student, attendance, fees, quizzes, assignments });
});

router.post('/students', async (req, res) => {
  try {
    const { name, email, password, phone, cnic, course_id, status } = req.body;
    if (!name || !email || !password || !course_id) {
      return res.status(400).json({ error: 'Required fields missing.' });
    }
    const exists = db.prepare('SELECT id FROM students WHERE email = ?').get(email);
    if (exists) return res.status(400).json({ error: 'Email already exists.' });

    const hash = await bcrypt.hash(password, 10);
    const count = db.prepare('SELECT COUNT(*) as c FROM students').get();
    const sid = `SS-${new Date().getFullYear()}-${String(count.c + 1).padStart(4, '0')}`;

    const r = db.prepare(`
      INSERT INTO students (student_id, name, email, password, phone, cnic, course_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sid, name, email, hash, phone, cnic, course_id, status || 'enrolled');

    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(course_id);
    if (course) {
      const monthly = course.total_fee / course.duration_months;
      const today = new Date();
      for (let i = 0; i < course.duration_months; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        db.prepare(`INSERT INTO fees (student_id, amount, month, due_date) VALUES (?, ?, ?, ?)`)
          .run(r.lastInsertRowid, Math.round(monthly),
            d.toISOString().substring(0, 7),
            new Date(d.getFullYear(), d.getMonth(), 10).toISOString().substring(0, 10));
      }
    }
    res.status(201).json({ success: true, student_id: sid, id: r.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create student.' });
  }
});

router.put('/students/:id', (req, res) => {
  const { name, phone, cnic, course_id, status } = req.body;
  db.prepare(`UPDATE students SET name=?, phone=?, cnic=?, course_id=?, status=? WHERE id=?`)
    .run(name, phone, cnic, course_id, status, req.params.id);
  res.json({ success: true, message: 'Student updated.' });
});

router.delete('/students/:id', (req, res) => {
  db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Student deleted.' });
});

// ===== ATTENDANCE MANAGEMENT =====
router.get('/attendance', (req, res) => {
  const { date, student_id, course_id } = req.query;
  const d = date || new Date().toISOString().substring(0, 10);

  let query = `
    SELECT a.*, s.name as student_name, s.student_id as sid, c.name as course_name
    FROM attendance a
    JOIN students s ON a.student_id = s.id
    LEFT JOIN courses c ON s.course_id = c.id
    WHERE a.date = ?
  `;
  const params = [d];

  if (student_id) { query += ' AND a.student_id = ?'; params.push(student_id); }
  if (course_id) { query += ' AND s.course_id = ?'; params.push(course_id); }

  const records = db.prepare(query).all(...params);

  // Students not yet marked today
  let unmarked = db.prepare(`
    SELECT s.id, s.name, s.student_id as sid, c.name as course_name
    FROM students s LEFT JOIN courses c ON s.course_id = c.id
    WHERE s.id NOT IN (SELECT student_id FROM attendance WHERE date = ?)
    AND s.status = 'enrolled'
  `).all(d);

  if (course_id) unmarked = unmarked.filter(u => {
    const st = db.prepare('SELECT course_id FROM students WHERE id = ?').get(u.id);
    return st && st.course_id == course_id;
  });

  res.json({ success: true, records, unmarked, date: d });
});

router.post('/attendance/mark', (req, res) => {
  const { student_id, date, status, remarks } = req.body;
  if (!student_id || !date || !status) {
    return res.status(400).json({ error: 'student_id, date, status required.' });
  }

  db.prepare(`
    INSERT INTO attendance (student_id, date, status, remarks, marked_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(student_id, date) DO UPDATE SET
      status = excluded.status,
      remarks = excluded.remarks,
      marked_by = excluded.marked_by
  `).run(student_id, date, status, remarks || '', req.admin.username);

  res.json({ success: true, message: 'Attendance marked.' });
});

router.post('/attendance/bulk', (req, res) => {
  const { records, date } = req.body; // [{student_id, status, remarks}]
  if (!records || !date) return res.status(400).json({ error: 'records and date required.' });

  const stmt = db.prepare(`
    INSERT INTO attendance (student_id, date, status, remarks, marked_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(student_id, date) DO UPDATE SET
      status = excluded.status, remarks = excluded.remarks, marked_by = excluded.marked_by
  `);

  const insertMany = db.transaction(recs => {
    for (const r of recs) stmt.run(r.student_id, date, r.status, r.remarks || '', req.admin.username);
  });

  insertMany(records);
  res.json({ success: true, message: `${records.length} attendance records saved.` });
});

// ===== QUIZ MANAGEMENT =====
router.get('/quizzes', (req, res) => {
  const quizzes = db.prepare(`
    SELECT q.*, c.name as course_name,
      (SELECT COUNT(*) FROM quiz_results WHERE quiz_id = q.id) as attempts,
      (SELECT AVG(obtained_marks * 100.0 / q.total_marks) FROM quiz_results WHERE quiz_id = q.id) as avg_score
    FROM quizzes q JOIN courses c ON q.course_id = c.id
    ORDER BY q.created_at DESC
  `).all();
  res.json({ success: true, quizzes });
});

router.post('/quizzes', (req, res) => {
  const { course_id, title, total_marks, quiz_date } = req.body;
  if (!course_id || !title) return res.status(400).json({ error: 'course_id and title required.' });

  const r = db.prepare(`INSERT INTO quizzes (course_id, title, total_marks, quiz_date) VALUES (?, ?, ?, ?)`)
    .run(course_id, title, total_marks || 100, quiz_date || null);

  res.status(201).json({ success: true, id: r.lastInsertRowid });
});

router.put('/quizzes/:id', (req, res) => {
  const { title, total_marks, quiz_date } = req.body;
  db.prepare(`UPDATE quizzes SET title=?, total_marks=?, quiz_date=? WHERE id=?`)
    .run(title, total_marks, quiz_date, req.params.id);
  res.json({ success: true });
});

router.delete('/quizzes/:id', (req, res) => {
  db.prepare('DELETE FROM quiz_results WHERE quiz_id = ?').run(req.params.id);
  db.prepare('DELETE FROM quizzes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Admin can set marks for a student
router.post('/quizzes/:quizId/grade', (req, res) => {
  const { student_id, obtained_marks } = req.body;
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });

  const pct = (obtained_marks / quiz.total_marks) * 100;
  const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F';

  db.prepare(`
    INSERT INTO quiz_results (student_id, quiz_id, obtained_marks, grade)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(student_id, quiz_id) DO UPDATE SET obtained_marks=excluded.obtained_marks, grade=excluded.grade
  `).run(student_id, req.params.quizId, obtained_marks, grade);

  res.json({ success: true, grade });
});

// ===== ASSIGNMENT MANAGEMENT =====
router.get('/assignments', (req, res) => {
  const assignments = db.prepare(`
    SELECT a.*, c.name as course_name,
      (SELECT COUNT(*) FROM assignment_submissions WHERE assignment_id = a.id) as submissions
    FROM assignments a JOIN courses c ON a.course_id = c.id
    ORDER BY a.created_at DESC
  `).all();
  res.json({ success: true, assignments });
});

router.post('/assignments', (req, res) => {
  const { course_id, title, description, due_date, total_marks } = req.body;
  if (!course_id || !title) return res.status(400).json({ error: 'course_id and title required.' });

  const r = db.prepare(`INSERT INTO assignments (course_id, title, description, due_date, total_marks) VALUES (?, ?, ?, ?, ?)`)
    .run(course_id, title, description || '', due_date || null, total_marks || 100);

  res.status(201).json({ success: true, id: r.lastInsertRowid });
});

router.put('/assignments/:id', (req, res) => {
  const { title, description, due_date, total_marks } = req.body;
  db.prepare(`UPDATE assignments SET title=?, description=?, due_date=?, total_marks=? WHERE id=?`)
    .run(title, description, due_date, total_marks, req.params.id);
  res.json({ success: true });
});

router.delete('/assignments/:id', (req, res) => {
  db.prepare('DELETE FROM assignment_submissions WHERE assignment_id = ?').run(req.params.id);
  db.prepare('DELETE FROM assignments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Grade a submission
router.patch('/assignments/submissions/:subId/grade', (req, res) => {
  const { obtained_marks } = req.body;
  db.prepare(`UPDATE assignment_submissions SET obtained_marks=?, status='graded' WHERE id=?`)
    .run(obtained_marks, req.params.subId);
  res.json({ success: true });
});

// Get submissions for an assignment
router.get('/assignments/:id/submissions', (req, res) => {
  const subs = db.prepare(`
    SELECT sub.*, s.name as student_name, s.student_id as sid
    FROM assignment_submissions sub
    JOIN students s ON sub.student_id = s.id
    WHERE sub.assignment_id = ?
  `).all(req.params.id);
  res.json({ success: true, submissions: subs });
});

// ===== FEE MANAGEMENT =====
router.get('/fees', (req, res) => {
  const { status, student_id } = req.query;
  let q = `SELECT f.*, s.name as student_name, s.student_id as sid FROM fees f JOIN students s ON f.student_id = s.id WHERE 1=1`;
  const p = [];
  if (status) { q += ' AND f.status = ?'; p.push(status); }
  if (student_id) { q += ' AND f.student_id = ?'; p.push(student_id); }
  q += ' ORDER BY f.due_date DESC';
  const fees = db.prepare(q).all(...p);
  res.json({ success: true, fees });
});

router.patch('/fees/:id', (req, res) => {
  const { status, payment_method, transaction_id, paid_date } = req.body;
  db.prepare(`
    UPDATE fees SET status=?, payment_method=?, transaction_id=?, paid_date=? WHERE id=?
  `).run(status, payment_method || 'Cash', transaction_id || 'N/A',
    status === 'paid' ? (paid_date || new Date().toISOString().substring(0, 10)) : null,
    req.params.id);
  res.json({ success: true });
});

// ===== LEAVE MANAGEMENT =====
router.get('/leaves', (req, res) => {
  const leaves = db.prepare(`
    SELECT la.*, s.name as student_name, s.student_id as sid
    FROM leave_applications la JOIN students s ON la.student_id = s.id
    ORDER BY la.applied_at DESC
  `).all();
  res.json({ success: true, leaves });
});

router.patch('/leaves/:id', (req, res) => {
  const { status } = req.body;
  db.prepare(`UPDATE leave_applications SET status=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(status, req.params.id);

  // If approved, mark attendance as leave for those dates
  if (status === 'approved') {
    const leave = db.prepare('SELECT * FROM leave_applications WHERE id = ?').get(req.params.id);
    const from = new Date(leave.from_date);
    const to = new Date(leave.to_date);
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().substring(0, 10);
      db.prepare(`
        INSERT INTO attendance (student_id, date, status, remarks, marked_by)
        VALUES (?, ?, 'leave', 'Approved leave', 'system')
        ON CONFLICT(student_id, date) DO UPDATE SET status='leave'
      `).run(leave.student_id, dateStr);
    }
  }

  res.json({ success: true });
});

// ===== NOTIFICATIONS =====
router.post('/notify', (req, res) => {
  const { student_ids, title, message, send_all } = req.body;

  if (send_all) {
    const students = db.prepare('SELECT id FROM students').all();
    const stmt = db.prepare('INSERT INTO notifications (student_id, title, message) VALUES (?, ?, ?)');
    const tx = db.transaction(list => { for (const s of list) stmt.run(s.id, title, message); });
    tx(students);
    return res.json({ success: true, sent: students.length });
  }

  if (student_ids && student_ids.length) {
    const stmt = db.prepare('INSERT INTO notifications (student_id, title, message) VALUES (?, ?, ?)');
    for (const id of student_ids) stmt.run(id, title, message);
    return res.json({ success: true, sent: student_ids.length });
  }

  res.status(400).json({ error: 'Provide student_ids or send_all=true' });
});

// ===== COURSES =====
router.get('/courses', (req, res) => {
  const courses = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM students WHERE course_id = c.id) as student_count
    FROM courses c ORDER BY category, name
  `).all();
  res.json({ success: true, courses });
});

router.post('/courses', (req, res) => {
  const { name, category, duration_months, total_fee, description } = req.body;
  const r = db.prepare(`INSERT INTO courses (name, category, duration_months, total_fee, description) VALUES (?, ?, ?, ?, ?)`)
    .run(name, category, duration_months, total_fee, description || '');
  res.status(201).json({ success: true, id: r.lastInsertRowid });
});

router.put('/courses/:id', (req, res) => {
  const { name, category, duration_months, total_fee, description } = req.body;
  db.prepare(`UPDATE courses SET name=?, category=?, duration_months=?, total_fee=?, description=? WHERE id=?`)
    .run(name, category, duration_months, total_fee, description, req.params.id);
  res.json({ success: true });
});

module.exports = router;
