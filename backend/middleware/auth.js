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
    const user = db.users.find(u => u.id === payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
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
  const member = db.project_members.find(m => m.project_id === projectId && m.user_id === req.user.id);
  if (!member) {
    return res.status(403).json({ error: 'Not a member of this project' });
  }
  req.projectRole = member.role;
  next();
}

module.exports = { authenticate, requireAdmin, requireProjectAccess, JWT_SECRET };