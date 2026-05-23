const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data', 'taskflow.db');
let db;

async function initDB() {
  const SQL = await initSqlJs();
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'member', created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, owner_id TEXT NOT NULL, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (owner_id) REFERENCES users(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS project_members (project_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT DEFAULT 'member', joined_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (project_id, user_id))`);
  db.run(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, project_id TEXT NOT NULL, assignee_id TEXT, created_by TEXT NOT NULL, status TEXT DEFAULT 'todo', priority TEXT DEFAULT 'medium', due_date TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);

  const result = db.exec(`SELECT COUNT(*) as cnt FROM users`);
  const count = result[0]?.values[0][0];
  if (count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    const { v4: uuidv4 } = require('uuid');
    db.run(`INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), 'Admin User', 'admin@taskflow.com', hash, 'admin']);
    saveDB();
    console.log('Admin created: admin@taskflow.com / admin123');
  }
  console.log('Database initialized');
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function getDB() { return db; }

setInterval(saveDB, 10000);
process.on('exit', saveDB);
process.on('SIGINT', () => { saveDB(); process.exit(); });
process.on('SIGTERM', () => { saveDB(); process.exit(); });

module.exports = { initDB, getDB, saveDB };