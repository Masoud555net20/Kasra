PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS login_logs;
DROP TABLE IF EXISTS missions;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'کارشناس',
  signature TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'فعال',
  description TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  row_no INTEGER,
  mission_date TEXT NOT NULL,
  day_name TEXT,
  project_id TEXT,
  project_title TEXT,
  location TEXT,
  address TEXT,
  start_time TEXT,
  end_time TEXT,
  outbound_vehicle TEXT,
  outbound_cost INTEGER NOT NULL DEFAULT 0,
  inbound_vehicle TEXT,
  inbound_cost INTEGER NOT NULL DEFAULT 0,
  total_cost INTEGER NOT NULL DEFAULT 0,
  outbound_receipt TEXT,
  inbound_receipt TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ثبت شده',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE login_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  ip_address TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_missions_user_id ON missions(user_id);
CREATE INDEX idx_missions_project_id ON missions(project_id);
CREATE INDEX idx_missions_date ON missions(mission_date);
CREATE INDEX idx_login_logs_user_id ON login_logs(user_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
