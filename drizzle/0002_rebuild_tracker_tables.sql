CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'build',
  date TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  location TEXT NOT NULL DEFAULT '',
  rpe INTEGER,
  soreness TEXT NOT NULL DEFAULT '',
  modifications TEXT NOT NULL DEFAULT '',
  recovery_notes TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  name TEXT NOT NULL,
  form_tip TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  rep_status TEXT NOT NULL DEFAULT 'planned',
  sort_order INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  set_number INTEGER NOT NULL,
  target_reps TEXT NOT NULL DEFAULT '',
  weight TEXT,
  actual_reps TEXT,
  done INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE health_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  date TEXT NOT NULL,
  value REAL,
  systolic INTEGER,
  diastolic INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE pushup_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  floor_reps INTEGER NOT NULL DEFAULT 0,
  incline_reps INTEGER NOT NULL DEFAULT 0,
  max_consecutive INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  soreness INTEGER NOT NULL DEFAULT 0,
  energy INTEGER NOT NULL DEFAULT 0,
  back_feel TEXT NOT NULL DEFAULT '',
  back_score INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
