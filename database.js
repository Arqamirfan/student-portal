const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../softskills.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

function initializeDatabase() {
    // Add to initializeDatabase() function

  // ADMINS TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create default admin if not exists
  const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get();
  if (adminCount.c === 0) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`INSERT INTO admins (username, name, email, password) VALUES (?, ?, ?, ?)`)
      .run('admin', 'Super Admin', 'admin@softskills.com', hash);
    console.log('✅ Default admin created: admin / admin123');
  }
  // STUDENTS TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      phone TEXT,
      cnic TEXT,
      course_id INTEGER,
      status TEXT DEFAULT 'enrolled' CHECK(status IN ('enrolled','dropout','certified','suspended')),
      enrollment_date TEXT DEFAULT (date('now')),
      profile_pic TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id)
    );
  `);

  // COURSES TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      duration_months INTEGER DEFAULT 3,
      total_fee REAL NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ATTENDANCE TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'present' CHECK(status IN ('present','absent','leave','late')),
      remarks TEXT,
      marked_by TEXT DEFAULT 'system',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, date),
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
  `);

  // LEAVE APPLICATIONS TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS leave_applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      from_date TEXT NOT NULL,
      to_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
  `);

  // QUIZZES TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      total_marks INTEGER DEFAULT 100,
      quiz_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id)
    );
  `);

  // QUIZ RESULTS TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      quiz_id INTEGER NOT NULL,
      obtained_marks INTEGER DEFAULT 0,
      grade TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, quiz_id),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
    );
  `);

  // ASSIGNMENTS TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      total_marks INTEGER DEFAULT 100,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id)
    );
  `);

  // ASSIGNMENT SUBMISSIONS TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      assignment_id INTEGER NOT NULL,
      submission_text TEXT,
      file_path TEXT,
      obtained_marks INTEGER,
      status TEXT DEFAULT 'submitted' CHECK(status IN ('pending','submitted','graded','late')),
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, assignment_id),
      FOREIGN KEY (student_id) REFERENCES students(id),
      FOREIGN KEY (assignment_id) REFERENCES assignments(id)
    );
  `);

  // FEES TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      month TEXT NOT NULL,
      due_date TEXT,
      paid_date TEXT,
      status TEXT DEFAULT 'unpaid' CHECK(status IN ('paid','unpaid','partial','waived')),
      payment_method TEXT,
      transaction_id TEXT,
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
  `);

  // NOTIFICATIONS TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
  `);

  // Insert default courses from SoftSkills
  insertDefaultCourses();
  
  console.log('✅ Database initialized successfully');
}

function insertDefaultCourses() {
  const count = db.prepare('SELECT COUNT(*) as c FROM courses').get();
  if (count.c > 0) return;

  const courses = [
    // IT & Development
    ['Website Development', 'IT & Development', 3, 15000],
    ['Web Application Development', 'IT & Development', 4, 20000],
    ['Mobile App Development (Flutter)', 'IT & Development', 4, 25000],
    ['Python Development', 'IT & Development', 3, 18000],
    // AI & Emerging Technologies
    ['Artificial Intelligence', 'AI & Emerging Technologies', 6, 35000],
    ['Machine Learning', 'AI & Emerging Technologies', 6, 35000],
    ['Generative AI & Chatbot Development', 'AI & Emerging Technologies', 3, 20000],
    ['Workflow Automation', 'AI & Emerging Technologies', 2, 12000],
    // Marketing & Creative
    ['Digital Marketing', 'Marketing & Creative', 3, 12000],
    ['SEO Services', 'Marketing & Creative', 2, 10000],
    ['Graphic Designing', 'Marketing & Creative', 3, 12000],
    ['Video Editing', 'Marketing & Creative', 2, 10000],
    // Technical Skills
    ['Domestic Electrician', 'Technical Skills', 3, 15000],
    ['Industrial Electrician', 'Technical Skills', 4, 18000],
    ['Solar Technician', 'Technical Skills', 3, 15000],
    ['RAC Technician', 'Technical Skills', 3, 15000],
    ['CCTV Technician', 'Technical Skills', 2, 12000],
    // Health & Safety
    ['NEBOSH', 'Health & Safety', 6, 45000],
    ['OSHA', 'Health & Safety', 3, 25000],
    ['IOSH', 'Health & Safety', 3, 22000],
    ['ISO OHSAS (US)', 'Health & Safety', 2, 18000],
    ['ISO HSE (UK)', 'Health & Safety', 2, 18000],
    ['Level 2 Safety Certifications', 'Health & Safety', 2, 15000],
    // Forex
    ['Forex Trading & Financial Markets', 'Forex Trading', 3, 20000],
  ];

  const insert = db.prepare(
    'INSERT INTO courses (name, category, duration_months, total_fee) VALUES (?, ?, ?, ?)'
  );

  const insertMany = db.transaction((list) => {
    for (const c of list) insert.run(...c);
  });

  insertMany(courses);
  console.log('✅ Default courses inserted');
}

module.exports = { db, initializeDatabase };
