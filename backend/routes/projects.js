const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDB, saveDB } = require('../db');
const { authenticate, requireProjectAccess } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const db = getDB();
  let projects;
  if (req.user.role === 'admin') {
    projects = db.projects;
  } else {
    const myProjectIds = db.project_members.filter(m => m.user_id === req.user.id).map(m => m.project_id);
    projects = db.projects.filter(p => myProjectIds.includes(p.id));
  }
  const result = projects.map(p => {
    const owner = db.users.find(u => u.id === p.owner_id);
    const task_count = db.tasks.filter(t => t.project_id === p.id).length;
    const member_count = db.project_members.filter(m => m.project_id === p.id).length;
    return { ...p, owner_name: owner?.name, task_count, member_count };
  });
  res.json(result);
});

router.post('/', authenticate, [
  body('name').trim().notEmpty(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { name, description } = req.body;
  const db = getDB();
  const id = uuidv4();
  const project = { id, name, description: description || '', owner_id: req.user.id, status: 'active', created_at: new Date().toISOString() };
  db.projects.push(project);
  db.project_members.push({ project_id: id, user_id: req.user.id, role: 'admin', joined_at: new Date().toISOString() });
  const owner = db.users.find(u => u.id === req.user.id);
  res.status(201).json({ ...project, owner_name: owner?.name });
});

router.get('/:id', authenticate, requireProjectAccess, (req, res) => {
  const db = getDB();
  const project = db.projects.find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const owner = db.users.find(u => u.id === project.owner_id);
  res.json({ ...project, owner_name: owner?.name });
});

router.put('/:id', authenticate, requireProjectAccess, (req, res) => {
  const db = getDB();
  const idx = db.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { name, description, status } = req.body;
  if (name) db.projects[idx].name = name;
  if (description) db.projects[idx].description = description;
  if (status) db.projects[idx].status = status;
  res.json({ message: 'Updated' });
});

router.delete('/:id', authenticate, (req, res) => {
  const db = getDB();
  const idx = db.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && db.projects[idx].owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  db.projects.splice(idx, 1);
  db.tasks = db.tasks.filter(t => t.project_id !== req.params.id);
  db.project_members = db.project_members.filter(m => m.project_id !== req.params.id);
  res.json({ message: 'Deleted' });
});

router.get('/:id/members', authenticate, requireProjectAccess, (req, res) => {
  const db = getDB();
  const members = db.project_members.filter(m => m.project_id === req.params.id).map(m => {
    const user = db.users.find(u => u.id === m.user_id);
    return { ...m, name: user?.name, email: user?.email, system_role: user?.role, project_role: m.role };
  });
  res.json(members);
});

router.post('/:id/members', authenticate, requireProjectAccess, (req, res) => {
  if (req.user.role !== 'admin' && req.projectRole !== 'admin') {
    return res.status(403).json({ error: 'Only admin can add members' });
  }
  const { email, role = 'member' } = req.body;
  const db = getDB();
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const exists = db.project_members.find(m => m.project_id === req.params.id && m.user_id === user.id);
  if (exists) return res.status(409).json({ error: 'Already a member' });
  db.project_members.push({ project_id: req.params.id, user_id: user.id, role, joined_at: new Date().toISOString() });
  res.status(201).json({ message: 'Member added' });
});

router.delete('/:id/members/:userId', authenticate, requireProjectAccess, (req, res) => {
  const db = getDB();
  db.project_members = db.project_members.filter(m => !(m.project_id === req.params.id && m.user_id === req.params.userId));
  res.json({ message: 'Removed' });
});

module.exports = router;