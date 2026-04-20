const jwt = require('jsonwebtoken');
const { SECRET } = require('./auth');

function requireAdmin(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Admin access required.' });

  try {
    const decoded = jwt.verify(token, SECRET);
    if (!decoded.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
    req.admin = decoded;
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = { requireAdmin };
