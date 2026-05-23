const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDB, saveDB } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function rowsToObjects(result) {
  if (!result[0]) return [];
  const cols = result[0].columns;
  return result[0].values.map(row =>
    Object.fromEntries(cols.map((c, i) => [c, row[i]]))
  );
}

router.get('/dashboard', authenticate, (req, res) => {
  const db = getDB();
  let projectFilter = '';
  let params = [];
  if (req.user.role !== 'admin') {
    projectFilter = `AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?)`;
    params.push(req.user.id);
  }
  const statusResult = db.exec(`SELECT status, COUNT(*) as count FROM tasks t WHERE 1=1 ${projectFilter} GROUP BY status`, params);
  const overdueResult = db.exec(`SELECT COUNT(*) as count FROM tasks t WHERE t.due_date < datetime('now') AND t.status != 'done' ${projectFilter}`, params);
  const myTasksResult = db.exec(`SELECT COUNT(*) as count FROM tasks WHERE assignee_id = ? AND status != 'done'`, [req.user.id]);
  const projectCountResult = db.exec(
    req.user.role === 'admin'
      ? `SELECT COUNT(*) as count FROM projects`
      : `SELECT COUNT(*) as count FROM project_members WHERE user_id = ?`,
    req.user.role === 'admin' ? [] : [req.user.id]
  );
  const statusCounts = rowsToObjects(statusResult);
  const stats = { todo: 0, 'in-progress': 0, done: 0 };
  statusCounts.forEach(r => { stats[r.status] = r.count; });
  res.json({
    tasksByStatus: stats,
    overdueCount: overdueResult[0]?.values[0][0] || 0,
    myOpenTasks: myTasksResult[0]?.values[0][0] || 0,
    projectCount: projectCountResult[0]?.values[0][0] || 0,
  });
});

router.get('/', authenticate, (req, res) => {
  const db = getDB();
  const { project_id, status, assignee_id, overdue } = req.query;
  let where = [];
  let params = [];
  if (project_id) { where.push('t.project_id = ?'); params.push(project_id); }
  if (status) { where.push('t.status = ?'); params.push(status); }
  if (assignee_id) { where.push('t.assignee_id = ?'); params.push(assignee_id); }
  if (overdue === 'true') { where.push(`t.due_date < datetime('now') AND t.status != 'done'`); }
  if (req.user.role !== 'admin') {
    where.push(`t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?)`);
    params.push(req.user.id);
  }
  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const result = db.exec(`SELECT t.*, u1.name as assignee_name, u2.name as creator_name, p.name as project_name
    FROM tasks t LEFT JOIN users u1 ON t.assignee_id = u1.id
    LEFT JOIN users u2 ON t.created_by = u2.id
    LEFT JOIN projects p ON t.project_id = p.id
    ${whereStr} ORDER BY t.created_at DESC`, params);
  res.json(rowsToObjects(result));
});

router.post('/', authenticate, [
  body('title').trim().notEmpty().withMessage('Title required'),
  body('project_id').notEmpty().withMessage('Project ID required'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const db = getDB();
  const { title, description, project_id, assignee_id, priority, due_date, status } = req.body;
  if (req.user.role !== 'admin') {
    const access = db.exec(`SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?`,
      [project_id, req.user.id]);
    if (!access[0]?.values?.length) return res.status(403).json({ error: 'No project access' });
  }
  const id = uuidv4();
  db.run(`INSERT INTO tasks (id, title, description, project_id, assignee_id, created_by, priority, due_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, title, description || '', project_id, assignee_id || null, req.user.id,
     priority || 'medium', due_date || null, status || 'todo']);
  saveDB();
  const result = db.exec(`SELECT t.*, u1.name as assignee_name, u2.name as creator_name, p.name as project_name
    FROM tasks t LEFT JOIN users u1 ON t.assignee_id = u1.id
    LEFT JOIN users u2 ON t.created_by = u2.id
    LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = ?`, [id]);
  res.status(201).json(rowsToObjects(result)[0]);
});

router.put('/:id', authenticate, (req, res) => {
  const db = getDB();
  const { title, description, assignee_id, status, priority, due_date } = req.body;
  db.run(`UPDATE tasks SET
    title = COALESCE(?, title),
    description = COALESCE(?, description),
    assignee_id = COALESCE(?, assignee_id),
    status = COALESCE(?, status),
    priority = COALESCE(?, priority),
    due_date = COALESCE(?, due_date),
    updated_at = datetime('now')
    WHERE id = ?`,
    [title, description, assignee_id, status, priority, due_date, req.params.id]);
  saveDB();
  const updated = db.exec(`SELECT t.*, u1.name as assignee_name, u2.name as creator_name, p.name as project_name
    FROM tasks t LEFT JOIN users u1 ON t.assignee_id = u1.id
    LEFT JOIN users u2 ON t.created_by = u2.id
    LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = ?`, [req.params.id]);
  res.json(rowsToObjects(updated)[0]);
});

router.delete('/:id', authenticate, (req, res) => {
  const db = getDB();
  db.run(`DELETE FROM tasks WHERE id = ?`, [req.params.id]);
  saveDB();
  res.json({ message: 'Deleted' });
});

module.exports = router;
