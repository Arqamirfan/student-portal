require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

initializeDatabase();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Student Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/quiz', require('./routes/quiz'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/fees', require('./routes/fees'));

// Admin Routes
app.use('/api/admin', require('./routes/admin'));

// Notifications
app.get('/api/notifications', require('./middleware/auth').authenticateToken, (req, res) => {
  const { db } = require('./database');
  const notifs = db.prepare('SELECT * FROM notifications WHERE student_id = ? ORDER BY created_at DESC LIMIT 20').all(req.student.id);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE student_id = ?').run(req.student.id);
  res.json({ success: true, notifications: notifs });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 SoftSkills Portal running at http://localhost:${PORT}`);
  console.log(`👤 Admin login: admin / admin123`);
});
