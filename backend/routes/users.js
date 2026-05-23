const express = require('express');
const { getDB, saveDB } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function rowsToObjects(result) {
  if (!result[0]) return [];
  const cols = result[0].columns;
  return result[0].values.map(row =>
    Object.fromEntries(cols.map((c, i) => [c, row[i]]))
  );
}

router.get('/', authenticate, (req, res) => {
  const db = getDB();
  const result = db.exec(`SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC`);
  res.json(rowsToObjects(result));
});

router.get('/search', authenticate, (req, res) => {
  const db = getDB();
  const { email, name } = req.query;
  let result;
  if (email) {
    result = db.exec(`SELECT id, name, email, role FROM users WHERE email LIKE ? LIMIT 10`, [`%${email}%`]);
  } else if (name) {
    result = db.exec(`SELECT id, name, email, role FROM users WHERE name LIKE ? LIMIT 10`, [`%${name}%`]);
  } else {
    result = db.exec(`SELECT id, name, email, role FROM users LIMIT 20`);
  }
  res.json(rowsToObjects(result));
});

router.put('/:id/role', authenticate, requireAdmin, (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const db = getDB();
  db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, req.params.id]);
  saveDB();
  res.json({ message: 'Role updated' });
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  const db = getDB();
  db.run(`DELETE FROM project_members WHERE user_id = ?`, [req.params.id]);
  db.run(`UPDATE tasks SET assignee_id = NULL WHERE assignee_id = ?`, [req.params.id]);
  db.run(`DELETE FROM users WHERE id = ?`, [req.params.id]);
  saveDB();
  res.json({ message: 'User deleted' });
});

module.exports = router;