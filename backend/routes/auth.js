const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDB, saveDB } = require('../db');
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

router.post('/signup', [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { name, email, password } = req.body;
  const db = getDB();
  if (db.users.find(u => u.email === email)) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  const user = { id, name, email, password: hash, role: 'member', created_at: new Date().toISOString() };
  db.users.push(user);
  const token = jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({ token, user: { id, name, email, role: 'member' } });
});

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { email, password } = req.body;
  const db = getDB();
  const user = db.users.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;