const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDB, saveDB } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/dashboard', authenticate, (req, res) => {
  const db = getDB();
  let tasks;
  if (req.user.role === 'admin') {
    tasks = db.tasks;
  } else {
    const myProjectIds = db.project_members.filter(m => m.user_id === req.user.id).map(m => m.project_id);
    tasks = db.tasks.filter(t => myProjectIds.includes(t.project_id));
  }
  const stats = { todo: 0, 'in-progress': 0, done: 0 };
  tasks.forEach(t => { if (stats[t.status] !== undefined) stats[t.status]++; });
  const now = new Date();
  const overdueCount = tasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'done').length;
  const myOpenTasks = db.tasks.filter(t => t.assignee_id === req.user.id && t.status !== 'done').length;
  const projectCount = req.user.role === 'admin'
    ? db.projects.length
    : db.project_members.filter(m => m.user_id === req.user.id).length;
  res.json({ tasksByStatus: stats, overdueCount, myOpenTasks, projectCount });
});

router.get('/', authenticate, (req, res) => {
  const db = getDB();
  const { project_id, status, assignee_id, overdue } = req.query;
  let tasks = db.tasks;
  if (req.user.role !== 'admin') {
    const myProjectIds = db.project_members.filter(m => m.user_id === req.user.id).map(m => m.project_id);
    tasks = tasks.filter(t => myProjectIds.includes(t.project_id));
  }
  if (project_id) tasks = tasks.filter(t => t.project_id === project_id);
  if (status) tasks = tasks.filter(t => t.status === status);
  if (assignee_id) tasks = tasks.filter(t => t.assignee_id === assignee_id);
  if (overdue === 'true') {
    const now = new Date();
    tasks = tasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'done');
  }
  const result = tasks.map(t => {
    const assignee = db.users.find(u => u.id === t.assignee_id);
    const creator = db.users.find(u => u.id === t.created_by);
    const project = db.projects.find(p => p.id === t.project_id);
    return { ...t, assignee_name: assignee?.name, creator_name: creator?.name, project_name: project?.name };
  });
  res.json(result.reverse());
});

router.post('/', authenticate, [
  body('title').trim().notEmpty(),
  body('project_id').notEmpty(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const db = getDB();
  const { title, description, project_id, assignee_id, priority, due_date, status } = req.body;
  if (req.user.role !== 'admin') {
    const access = db.project_members.find(m => m.project_id === project_id && m.user_id === req.user.id);
    if (!access) return res.status(403).json({ error: 'No project access' });
  }
  const id = uuidv4();
  const task = {
    id, title, description: description || '', project_id,
    assignee_id: assignee_id || null, created_by: req.user.id,
    priority: priority || 'medium', due_date: due_date || null,
    status: status || 'todo', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  db.tasks.push(task);
  const assignee = db.users.find(u => u.id === task.assignee_id);
  const creator = db.users.find(u => u.id === task.created_by);
  const project = db.projects.find(p => p.id === task.project_id);
  res.status(201).json({ ...task, assignee_name: assignee?.name, creator_name: creator?.name, project_name: project?.name });
});

router.put('/:id', authenticate, (req, res) => {
  const db = getDB();
  const idx = db.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  const { title, description, assignee_id, status, priority, due_date } = req.body;
  if (title) db.tasks[idx].title = title;
  if (description !== undefined) db.tasks[idx].description = description;
  if (assignee_id !== undefined) db.tasks[idx].assignee_id = assignee_id;
  if (status) db.tasks[idx].status = status;
  if (priority) db.tasks[idx].priority = priority;
  if (due_date !== undefined) db.tasks[idx].due_date = due_date;
  db.tasks[idx].updated_at = new Date().toISOString();
  const t = db.tasks[idx];
  const assignee = db.users.find(u => u.id === t.assignee_id);
  const creator = db.users.find(u => u.id === t.created_by);
  const project = db.projects.find(p => p.id === t.project_id);
  res.json({ ...t, assignee_name: assignee?.name, creator_name: creator?.name, project_name: project?.name });
});

router.delete('/:id', authenticate, (req, res) => {
  const db = getDB();
  db.tasks = db.tasks.filter(t => t.id !== req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
