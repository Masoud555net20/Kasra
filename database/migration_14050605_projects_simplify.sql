-- ============================================================
-- مایگریشن ۱۴۰۵/۰۶/۰۵ — ساده‌سازی جدول پروژه‌ها
-- حذف فیلدهای «کد پروژه» و «کارفرما» از جدول projects
-- (ستون code دارای قید UNIQUE است؛ بنابراین جدول بازسازی می‌شود)
-- ============================================================

PRAGMA foreign_keys = OFF;

CREATE TABLE projects_new (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'فعال',
  description TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO projects_new (id, title, address, status, description, created_by, created_at, updated_at)
SELECT id, title, address, status, description, created_by, created_at, updated_at
FROM projects;

DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

DROP INDEX IF EXISTS idx_projects_code;

PRAGMA foreign_keys = ON;
