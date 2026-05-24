const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Simple in-memory database
let data = {
  users: [],
  projects: [],
  project_members: [],
  tasks: []
};

function initDB() {
  const hash = bcrypt.hashSync('admin123', 10);
  data.users.push({
    id: uuidv4(), name: 'Admin User',
    email: 'admin@taskflow.com', password: hash,
    role: 'admin', created_at: new Date().toISOString()
  });
  console.log('Admin created: admin@taskflow.com / admin123');
  console.log('Database initialized');
  return Promise.resolve();
}

function getDB() { return data; }
function saveDB() {}

module.exports = { initDB, getDB, saveDB };