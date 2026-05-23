const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDB, saveDB } = require('../db');
const { authenticate, requireProjectAccess } = require('../middleware/auth');

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
  let result;
  if (req.user.role === 'admin') {
    result = db.exec(`SELECT p.*, u.name as owner_name,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
      (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count
      FROM projects p JOIN users u ON p.owner_id = u.id ORDER BY p.created_at DESC`);
  } else {
    result = db.exec(`SELECT p.*, u.name as owner_name,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as task_count,
      (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id = p.id) as member_count,
      pm.role as my_role
      FROM projects p JOIN users u ON p.owner_id = u.id
      JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
      ORDER BY p.created_at DESC`, [req.user.id]);
  }
  res.json(rowsToObjects(result));
});

router.post('/', authenticate, [
  body('name').trim().notEmpty().withMessage('Project name required'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { name, description } = req.body;
  const db = getDB();
  const id = uuidv4();
  db.run(`INSERT INTO projects (id, name, description, owner_id) VALUES (?, ?, ?, ?)`,
    [id, name, description || '', req.user.id]);
  db.run(`INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, 'admin')`,
    [id, req.user.id]);
  saveDB();
  const result = db.exec(`SELECT p.*, u.name as owner_name FROM projects p JOIN users u ON p.owner_id = u.id WHERE p.id = ?`, [id]);
  res.status(201).json(rowsToObjects(result)[0]);
});

router.get('/:id', authenticate, requireProjectAccess, (req, res) => {
  const db = getDB();
  const result = db.exec(`SELECT p.*, u.name as owner_name FROM projects p
    JOIN users u ON p.owner_id = u.id WHERE p.id = ?`, [req.params.id]);
  if (!result[0]?.values?.length) return res.status(404).json({ error: 'Project not found' });
  res.json(rowsToObjects(result)[0]);
});

router.put('/:id', authenticate, requireProjectAccess, (req, res) => {
  const db = getDB();
  const { name, description, status } = req.body;
  db.run(`UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description), status = COALESCE(?, status) WHERE id = ?`,
    [name, description, status, req.params.id]);
  saveDB();
  res.json({ message: 'Updated' });
});

router.delete('/:id', authenticate, (req, res) => {
  const db = getDB();
  const proj = db.exec(`SELECT owner_id FROM projects WHERE id = ?`, [req.params.id]);
  if (!proj[0]?.values?.length) return res.status(404).json({ error: 'Project not found' });
  const ownerId = proj[0].values[0][0];
  if (req.user.role !== 'admin' && ownerId !== req.user.id) {
    return res.status(403).json({ error: 'Only owner or admin can delete' });
  }
  db.run(`DELETE FROM tasks WHERE project_id = ?`, [req.params.id]);
  db.run(`DELETE FROM project_members WHERE project_id = ?`, [req.params.id]);
  db.run(`DELETE FROM projects WHERE id = ?`, [req.params.id]);
  saveDB();
  res.json({ message: 'Deleted' });
});

router.get('/:id/members', authenticate, requireProjectAccess, (req, res) => {
  const db = getDB();
  const result = db.exec(`SELECT u.id, u.name, u.email, u.role as system_role, pm.role as project_role, pm.joined_at
    FROM project_members pm JOIN users u ON pm.user_id = u.id WHERE pm.project_id = ?`, [req.params.id]);
  res.json(rowsToObjects(result));
});

router.post('/:id/members', authenticate, requireProjectAccess, (req, res) => {
  if (req.user.role !== 'admin' && req.projectRole !== 'admin') {
    return res.status(403).json({ error: 'Only admin can add members' });
  }
  const { email, role = 'member' } = req.body;
  const db = getDB();
  const userResult = db.exec(`SELECT id FROM users WHERE email = ?`, [email]);
  if (!userResult[0]?.values?.length) return res.status(404).json({ error: 'User not found' });
  const userId = userResult[0].values[0][0];
  const existing = db.exec(`SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?`,
    [req.params.id, userId]);
  if (existing[0]?.values?.length) return res.status(409).json({ error: 'Already a member' });
  db.run(`INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)`,
    [req.params.id, userId, role]);
  saveDB();
  res.status(201).json({ message: 'Member added' });
});

router.delete('/:id/members/:userId', authenticate, requireProjectAccess, (req, res) => {
  const db = getDB();
  db.run(`DELETE FROM project_members WHERE project_id = ? AND user_id = ?`,
    [req.params.id, req.params.userId]);
  saveDB();
  res.json({ message: 'Removed' });
});

module.exports = router;