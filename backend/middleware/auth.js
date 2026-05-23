const jwt = require('jsonwebtoken');
const { getDB } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'taskflow-secret-key-change-in-prod';

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = getDB();
    const result = db.exec(`SELECT id, name, email, role FROM users WHERE id = ?`, [payload.userId]);
    if (!result[0]?.values?.length) return res.status(401).json({ error: 'User not found' });
    const [id, name, email, role] = result[0].values[0];
    req.user = { id, name, email, role };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireProjectAccess(req, res, next) {
  const db = getDB();
  const projectId = req.params.projectId || req.body.project_id || req.params.id;
  if (!projectId) return next();
  if (req.user.role === 'admin') return next();
  const result = db.exec(
    `SELECT role FROM project_members WHERE project_id = ? AND user_id = ?`,
    [projectId, req.user.id]
  );
  if (!result[0]?.values?.length) {
    return res.status(403).json({ error: 'Not a member of this project' });
  }
  req.projectRole = result[0].values[0][0];
  next();
}

module.exports = { authenticate, requireAdmin, requireProjectAccess, JWT_SECRET };