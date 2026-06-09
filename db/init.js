const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'building_profile.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS buildings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      region TEXT NOT NULL,
      province TEXT,
      city TEXT,
      district TEXT,
      asset_type TEXT NOT NULL DEFAULT '租赁职场',
      headcount INTEGER,
      scale_tier TEXT,
      building_age INTEGER,
      area_sqm REAL,
      floors INTEGER,
      access_gates INTEGER,
      business_lines TEXT,
      supplier TEXT,
      day1_date TEXT,
      energy_cost_budget REAL,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS dimensions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      poc TEXT,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS indicators (
      id TEXT PRIMARY KEY,
      dimension_id TEXT NOT NULL REFERENCES dimensions(id),
      seq INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '运营',
      definition TEXT,
      target_value TEXT,
      target_type TEXT NOT NULL DEFAULT 'lower',
      unit TEXT,
      data_source TEXT,
      cycle TEXT,
      industry_benchmark TEXT
    );

    CREATE TABLE IF NOT EXISTS indicator_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      building_id INTEGER NOT NULL REFERENCES buildings(id),
      indicator_id TEXT NOT NULL REFERENCES indicators(id),
      period TEXT NOT NULL DEFAULT 'H1_2026',
      actual_value REAL,
      is_applicable INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      updated_by TEXT,
      updated_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(building_id, indicator_id, period)
    );

    CREATE TABLE IF NOT EXISTS measures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      building_id INTEGER NOT NULL REFERENCES buildings(id),
      name TEXT,
      status TEXT NOT NULL DEFAULT '未开始',
      dimension_ids TEXT,
      indicator_ids TEXT,
      description TEXT,
      completion_phase TEXT,
      planned_end_date TEXT,
      actual_end_date TEXT,
      budget REAL,
      expected_effect TEXT,
      effect_validation TEXT,
      initiator TEXT DEFAULT '字节',
      assignee TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_iv_building ON indicator_values(building_id);
    CREATE INDEX IF NOT EXISTS idx_iv_indicator ON indicator_values(indicator_id);
    CREATE INDEX IF NOT EXISTS idx_iv_period ON indicator_values(period);
    CREATE INDEX IF NOT EXISTS idx_measures_building ON measures(building_id);

		CREATE TABLE IF NOT EXISTS users (
	  id INTEGER PRIMARY KEY AUTOINCREMENT,
	  username TEXT NOT NULL UNIQUE,
	  password TEXT NOT NULL,
	  display_name TEXT,
	  role TEXT NOT NULL DEFAULT 'visitor',
	  created_at TEXT DEFAULT (datetime('now','localtime'))
	);

		CREATE TABLE IF NOT EXISTS user_scopes (
	  id INTEGER PRIMARY KEY AUTOINCREMENT,
	  user_id INTEGER REFERENCES users(id),
	  scope_type TEXT NOT NULL,
	  scope_value TEXT NOT NULL
	);
  `);
}

module.exports = { getDb, initSchema, DB_PATH };
