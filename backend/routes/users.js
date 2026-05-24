const express = require('express');
const { getDB, saveDB } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const db = getDB();
  const users = db.users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at }));
  res.json(users);
});

router.get('/search', authenticate, (req, res) => {
  const db = getDB();
  const { email, name } = req.query;
  let users = db.users;
  if (email) users = users.filter(u => u.email.includes(email));
  else if (name) users = users.filter(u => u.name.includes(name));
  res.json(users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })));
});

router.put('/:id/role', authenticate, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const db = getDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.role = role;
  res.json({ message: 'Role updated' });
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  const db = getDB();
  db.users = db.users.filter(u => u.id !== req.params.id);
  db.project_members = db.project_members.filter(m => m.user_id !== req.params.id);
  db.tasks = db.tasks.map(t => t.assignee_id === req.params.id ? { ...t, assignee_id: null } : t);
  res.json({ message: 'User deleted' });
});

module.exports = router;