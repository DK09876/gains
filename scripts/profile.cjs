#!/usr/bin/env node
/**
 * Manage Gains profiles, like MTG Tracker's scripts/profile.cjs.
 *
 *   node scripts/profile.cjs list
 *   node scripts/profile.cjs add <id> "<display name>"
 *   node scripts/profile.cjs rename <id> "<display name>"
 *
 * A profile is only a name that workouts belong to - there is no password.
 * Uses the app's own database (data/gains.db next to this folder) unless
 * GAINS_DB_PATH says otherwise. Stop the `gains` service first: two
 * processes writing the WASM SQLite file at once is unsafe.
 */

const { mkdirSync } = require('fs');
const { dirname, join } = require('path');
const { Database } = require('node-sqlite3-wasm');

// Relative to the app, not the current directory, so running it from
// anywhere else cannot create an empty database of its own.
const DB_PATH = process.env.GAINS_DB_PATH || join(__dirname, '..', 'data', 'gains.db');
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

db.run(`CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL)`);
const has = (table) => !!db.get("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]);

const [command, id, name] = process.argv.slice(2);

if (command === 'list') {
  const rows = db.all('SELECT id, name FROM profiles ORDER BY createdAt');
  if (!rows.length) console.log('No profiles. Add one with: node scripts/profile.cjs add <id> "<name>"');
  for (const row of rows) {
    const workouts = has('workouts') ? db.get('SELECT count(*) AS c FROM workouts WHERE profileId = ?', [row.id]).c : 0;
    const sessions = has('sessions') ? db.get('SELECT count(*) AS c FROM sessions WHERE profileId = ? AND finishedAt IS NOT NULL', [row.id]).c : 0;
    console.log(`${row.id.padEnd(10)} ${String(row.name).padEnd(16)} workouts: ${String(workouts).padEnd(4)} done: ${sessions}`);
  }
} else if (command === 'add') {
  if (!/^[a-z0-9-]+$/.test(id ?? '') || !name) {
    console.error('usage: add <id> "<display name>"   (id: lowercase letters, digits, dashes)');
    process.exit(1);
  }
  db.run('INSERT INTO profiles (id, name, createdAt) VALUES (?, ?, ?)', [id, name, new Date().toISOString()]);
  console.log(`created ${id} (${name})`);
} else if (command === 'rename') {
  if (!id || !name) { console.error('usage: rename <id> "<display name>"'); process.exit(1); }
  db.run('UPDATE profiles SET name = ? WHERE id = ?', [name, id]);
  console.log(`renamed ${id} to ${name}`);
} else {
  console.error('usage: list | add <id> "<name>" | rename <id> "<name>"');
  process.exit(1);
}
db.close();
