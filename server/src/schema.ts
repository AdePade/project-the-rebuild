import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const meta = sqliteTable("meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  phase: text("phase", { enum: ["ramp", "build", "reveal", "refine"] })
    .notNull()
    .default("build"),
  date: text("date"), // ISO yyyy-mm-dd, null when the real date is unknown
  timeOfDay: text("time_of_day", { enum: ["morning", "afternoon", "evening"] }),
  status: text("status", { enum: ["planned", "completed"] })
    .notNull()
    .default("planned"),
  location: text("location").notNull().default(""),
  rpe: integer("rpe"), // session effort 1-10, null = not recorded
  soreness: text("soreness").notNull().default(""),
  modifications: text("modifications").notNull().default(""),
  recoveryNotes: text("recovery_notes").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const exercises = sqliteTable("exercises", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id),
  name: text("name").notNull(),
  formTip: text("form_tip").notNull().default(""),
  note: text("note").notNull().default(""),
  // confirmed = reps verified, prescribed = planned/reported, reps unverified
  repStatus: text("rep_status", { enum: ["confirmed", "prescribed", "planned"] })
    .notNull()
    .default("planned"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const sets = sqliteTable("sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  exerciseId: integer("exercise_id")
    .notNull()
    .references(() => exercises.id),
  setNumber: integer("set_number").notNull(),
  targetReps: text("target_reps").notNull().default(""),
  weight: text("weight"), // free text (lb / machine setting), null = never recorded
  actualReps: text("actual_reps"),
  done: integer("done").notNull().default(0),
});

export const healthEntries = sqliteTable("health_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["weight", "waist", "sleep", "bp", "rhr", "protein"] }).notNull(),
  date: text("date").notNull(), // yyyy-mm-dd
  value: real("value"), // weight lb, waist in, sleep hours
  systolic: integer("systolic"),
  diastolic: integer("diastolic"),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const pushupLogs = sqliteTable("pushup_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  floorReps: integer("floor_reps").notNull().default(0),
  inclineReps: integer("incline_reps").notNull().default(0),
  maxConsecutive: integer("max_consecutive").notNull().default(0),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  soreness: integer("soreness").notNull().default(0), // 0-10
  energy: integer("energy").notNull().default(0), // 0-10
  backFeel: text("back_feel").notNull().default(""),
  backScore: integer("back_score"), // 0-10 function score, higher = back feels/works better
  note: text("note").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
