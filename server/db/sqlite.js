const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')

const dataDir = path.resolve(__dirname, '../data')
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = path.join(dataDir, 'iot_cache.db')
const db = new Database(dbPath)

// 提升并发读写能力：WAL 模式
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS sensor_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    temperature REAL,
    humidity REAL,
    soil_moisture REAL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS device_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL UNIQUE,
    online INTEGER DEFAULT 0,
    last_report_time DATETIME
  );
`)

module.exports = db

