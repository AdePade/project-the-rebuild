import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { asc, desc, eq } from "drizzle-orm";
import * as schema from "./schema";

type Db = ReturnType<Ctx["db"]>;

const okResponse = z.object({ ok: z.literal(true) });

const setShape = z.object({
  id: z.number(),
  setNumber: z.number(),
  targetReps: z.string(),
  weight: z.string().nullable(),
  actualReps: z.string().nullable(),
  done: z.boolean(),
});
const exerciseShape = z.object({
  id: z.number(),
  name: z.string(),
  formTip: z.string(),
  note: z.string(),
  repStatus: z.string(),
  sets: z.array(setShape),
});
const sessionShape = z.object({
  id: z.number(),
  title: z.string(),
  phase: z.string(),
  date: z.string().nullable(),
  timeOfDay: z.string().nullable(),
  status: z.string(),
  location: z.string(),
  rpe: z.number().nullable(),
  soreness: z.string(),
  modifications: z.string(),
  recoveryNotes: z.string(),
  notes: z.string(),
  exercises: z.array(exerciseShape),
});

async function loadSessions(db: Db) {
  const sessionRows = await db
    .select()
    .from(schema.sessions)
    .orderBy(desc(schema.sessions.createdAt));
  const exerciseRows = await db
    .select()
    .from(schema.exercises)
    .orderBy(asc(schema.exercises.sortOrder));
  const setRows = await db.select().from(schema.sets).orderBy(asc(schema.sets.setNumber));
  return sessionRows.map((s) => ({
    id: s.id,
    title: s.title,
    phase: s.phase,
    date: s.date,
    timeOfDay: s.timeOfDay,
    status: s.status,
    location: s.location,
    rpe: s.rpe,
    soreness: s.soreness,
    modifications: s.modifications,
    recoveryNotes: s.recoveryNotes,
    notes: s.notes,
    exercises: exerciseRows
      .filter((e) => e.sessionId === s.id)
      .map((e) => ({
        id: e.id,
        name: e.name,
        formTip: e.formTip,
        note: e.note,
        repStatus: e.repStatus,
        sets: setRows
          .filter((st) => st.exerciseId === e.id)
          .map((st) => ({
            id: st.id,
            setNumber: st.setNumber,
            targetReps: st.targetReps,
            weight: st.weight,
            actualReps: st.actualReps,
            done: st.done === 1,
          })),
      })),
  }));
}

const stateResponse = z.object({
  seeded: z.boolean(),
  meta: z.record(z.string(), z.string()),
  sessions: z.array(sessionShape),
  health: z.array(
    z.object({
      id: z.number(),
      kind: z.string(),
      date: z.string(),
      value: z.number().nullable(),
      systolic: z.number().nullable(),
      diastolic: z.number().nullable(),
      note: z.string(),
    }),
  ),
  pushups: z.array(
    z.object({
      id: z.number(),
      date: z.string(),
      floorReps: z.number(),
      inclineReps: z.number(),
      maxConsecutive: z.number(),
      note: z.string(),
    }),
  ),
  checkins: z.array(
    z.object({
      id: z.number(),
      date: z.string(),
      soreness: z.number(),
      energy: z.number(),
      backFeel: z.string(),
      backScore: z.number().nullable(),
      note: z.string(),
    }),
  ),
});

type SeedExercise = {
  name: string;
  formTip: string;
  note?: string;
  repStatus: "confirmed" | "prescribed" | "planned";
  targets: string[];
  confirmedReps?: boolean; // actual reps equal target (verified)
  allDone: boolean;
};

async function insertSession(
  db: Db,
  s: {
    title: string;
    phase: "ramp" | "build" | "reveal" | "refine";
    date: string | null;
    timeOfDay?: "morning" | "afternoon" | "evening" | null;
    status: "planned" | "completed";
    location?: string;
    soreness?: string;
    notes?: string;
    exercises: SeedExercise[];
  },
) {
  const [session] = await db
    .insert(schema.sessions)
    .values({
      title: s.title,
      phase: s.phase,
      date: s.date,
      timeOfDay: s.timeOfDay ?? null,
      status: s.status,
      location: s.location ?? "",
      soreness: s.soreness ?? "",
      notes: s.notes ?? "",
    })
    .returning({ id: schema.sessions.id });
  if (!session) throw new Error("insertSession failed");
  for (let i = 0; i < s.exercises.length; i++) {
    const ex = s.exercises[i];
    if (!ex) continue;
    const [row] = await db
      .insert(schema.exercises)
      .values({
        sessionId: session.id,
        name: ex.name,
        formTip: ex.formTip,
        note: ex.note ?? "",
        repStatus: ex.repStatus,
        sortOrder: i,
      })
      .returning({ id: schema.exercises.id });
    if (!row) continue;
    for (let j = 0; j < ex.targets.length; j++) {
      const target = ex.targets[j];
      if (target === undefined) continue;
      await db.insert(schema.sets).values({
        exerciseId: row.id,
        setNumber: j + 1,
        targetReps: target,
        weight: null,
        actualReps: ex.confirmedReps ? target : null,
        done: ex.allDone ? 1 : 0,
      });
    }
  }
  return session.id;
}

export const Actions = {
  getState: defineAction({
    request: z.object({}),
    response: stateResponse,
    handler: async (ctx): Promise<z.infer<typeof stateResponse>> => {
      const db = ctx.db<typeof schema>();
      const metaRows = await db.select().from(schema.meta);
      const meta: Record<string, string> = {};
      for (const r of metaRows) meta[r.key] = r.value;
      const health = await db
        .select()
        .from(schema.healthEntries)
        .orderBy(asc(schema.healthEntries.date));
      const pushups = await db
        .select()
        .from(schema.pushupLogs)
        .orderBy(desc(schema.pushupLogs.date));
      const checkins = await db
        .select()
        .from(schema.checkins)
        .orderBy(desc(schema.checkins.date));
      return {
        seeded: meta["seeded"] === "1",
        meta,
        sessions: await loadSessions(db),
        health: health.map((h) => ({
          id: h.id,
          kind: h.kind,
          date: h.date,
          value: h.value,
          systolic: h.systolic,
          diastolic: h.diastolic,
          note: h.note,
        })),
        pushups: pushups.map((p) => ({
          id: p.id,
          date: p.date,
          floorReps: p.floorReps,
          inclineReps: p.inclineReps,
          maxConsecutive: p.maxConsecutive,
          note: p.note,
        })),
        checkins: checkins.map((c) => ({
          id: c.id,
          date: c.date,
          soreness: c.soreness,
          energy: c.energy,
          backFeel: c.backFeel,
          backScore: c.backScore,
          note: c.note,
        })),
      };
    },
  }),

  // One-time import of the exact plan data the user handed off: profile
  // demo baseline (240 lb) and two sample completed workouts,
  // with confirmed vs prescribed reps preserved. Idempotent.
  // The two workouts happened on two separate days, confirmed by the user:
  // Sample Workout #1 (morning) and Workout #2 (evening) on consecutive days
  // (evening). The seedV2 pass repairs installs seeded before that was known.
  seedInitialData: defineAction({
    request: z.object({}),
    response: okResponse,
    handler: async (ctx): Promise<z.infer<typeof okResponse>> => {
      const db = ctx.db<typeof schema>();
      const existing = await db
        .select()
        .from(schema.meta)
        .where(eq(schema.meta.key, "seeded"));
      if (existing.length > 0) {
        const v2 = await db
          .select()
          .from(schema.meta)
          .where(eq(schema.meta.key, "seedV2"));
        if (v2.length === 0) {
          await db
            .update(schema.sessions)
            .set({ date: "2026-09-14", timeOfDay: "morning" })
            .where(eq(schema.sessions.title, "Workout #1 — Full Body Ignition"));
          await db
            .update(schema.sessions)
            .set({ date: "2026-09-15", timeOfDay: "evening" })
            .where(
              eq(
                schema.sessions.title,
                "Workout #2 — Legs / Back / Shoulders / Biceps / Core",
              ),
            );
          await db
            .insert(schema.meta)
            .values({ key: "seedV2", value: "1" })
            .onConflictDoNothing({ target: schema.meta.key });
          ctx.invalidateQueries();
        }
        return { ok: true as const };
      }

      const profile: Record<string, string> = {
        baselineWeight: "240",
        firstGoalWeight: "230",
        goalWeight: "200",
        heightIn: "72",
        age: "35",
        buildSessionsTotal: "36",
        pushupBaseline: "8-9",
        pushupGoal: "20",
        pushupStretch: "30",
        kcalTarget: "2500",
        proteinTarget: "180-200",
        proteinFloor: "160",
        stepsBaseline: "5700",
        seeded: "1",
        seedV2: "1",
      };
      for (const [key, value] of Object.entries(profile)) {
        await db
          .insert(schema.meta)
          .values({ key, value })
          .onConflictDoNothing({ target: schema.meta.key });
      }

      // A concurrent first load may have already imported the history;
      // never duplicate it.
      const existingSessions = await db
        .select({ id: schema.sessions.id })
        .from(schema.sessions)
        .limit(1);
      if (existingSessions.length > 0) {
        ctx.invalidateQueries();
        return { ok: true as const };
      }

      await db.insert(schema.healthEntries).values({
        kind: "weight",
        date: "2026-09-15",
        value: 240,
        note: "Demo baseline entry",
      });

      await insertSession(db, {
        title: "Workout #1 — Full Body Ignition",
        phase: "ramp",
        date: "2026-09-14",
        timeOfDay: "morning",
        status: "completed",
        soreness: "Mild soreness — manageable. (demo entry)",
        notes:
          "Demo log entry. Pec fly substituted for the unavailable cable row.",
        exercises: [
          { name: "Treadmill Warm-Up", formTip: "Easy pace, build heat for 7 minutes before touching a weight.", repStatus: "prescribed", targets: ["7 min"], allDone: true },
          { name: "Leg Press", formTip: "Feet shoulder-width, full foot on the plate. Lower with control, don't lock the knees hard at the top.", repStatus: "confirmed", targets: ["15", "15", "15"], confirmedReps: true, allDone: true },
          { name: "Chest Press", formTip: "Shoulder blades pinched into the pad, press smooth — no bouncing off the chest.", repStatus: "confirmed", targets: ["15", "15", "15"], confirmedReps: true, allDone: true },
          { name: "Lat Pulldown", formTip: "Chest tall, pull the bar to your upper chest and squeeze the lats. No swinging.", note: "Reps prescribed, not confirmed.", repStatus: "prescribed", targets: ["10", "10", "10"], allDone: true },
          { name: "Butterfly / Pec Fly", formTip: "Soft bend in the elbows, hug the pads together and pause at the squeeze.", note: "Substituted for unavailable cable row.", repStatus: "confirmed", targets: ["15", "15"], confirmedReps: true, allDone: true },
          { name: "Seated DB Shoulder Press", formTip: "Back supported, press up without shrugging to your ears.", note: "Reps prescribed, not confirmed.", repStatus: "prescribed", targets: ["10", "10"], allDone: true },
          { name: "DB Biceps Curls", formTip: "Elbows pinned at your sides, full squeeze at the top, slow lower.", note: "Reps prescribed, not confirmed.", repStatus: "prescribed", targets: ["12", "12"], allDone: true },
          { name: "Triceps Rope Pushdowns", formTip: "Elbows locked to your ribs, split the rope apart at the bottom.", note: "Completed with rest-pauses; exact reps unconfirmed.", repStatus: "prescribed", targets: ["set 1", "set 2"], allDone: true },
          { name: "Treadmill Cool-Down", formTip: "Walk it out 5 minutes, let the heart rate come down.", note: "Planned.", repStatus: "planned", targets: ["5 min"], allDone: false },
        ],
      });

      await insertSession(db, {
        title: "Workout #2 — Legs / Back / Shoulders / Biceps / Core",
        phase: "build",
        date: "2026-09-15",
        timeOfDay: "evening",
        status: "completed",
        notes: "Demo log entry.",
        exercises: [
          { name: "Treadmill Warm-Up", formTip: "Easy pace, build heat for 7 minutes.", repStatus: "prescribed", targets: ["7 min"], allDone: true },
          { name: "Leg Press", formTip: "Full foot on the plate, controlled lower, no hard knee lockout.", repStatus: "prescribed", targets: ["12", "12", "12"], allDone: true },
          { name: "Chest-Supported DB Row", formTip: "Bench at 30–45°, chest glued down, row the dumbbells to your ribs. This is the back builder — no seated cable row needed.", repStatus: "prescribed", targets: ["12", "12", "12"], allDone: true },
          { name: "Lat Pulldown", formTip: "Chest tall, bar to upper chest, squeeze the lats hard.", repStatus: "prescribed", targets: ["10", "10"], allDone: true },
          { name: "Seated DB Lateral Raises", formTip: "Small bend in the elbow, lift to shoulder height, lead with the elbows not the hands.", repStatus: "prescribed", targets: ["12", "12"], allDone: true },
          { name: "DB Biceps Curls", formTip: "Elbows pinned, squeeze at the top, 2-second lower.", repStatus: "prescribed", targets: ["12", "12"], allDone: true },
          { name: "Dead Bugs", formTip: "Low back pressed into the floor the whole time. Exhale as the opposite arm and leg reach away.", repStatus: "prescribed", targets: ["6 / side", "6 / side"], allDone: true },
          { name: "Bird Dogs", formTip: "Hips level, reach long not high. Pause 1 second at full extension.", repStatus: "prescribed", targets: ["6 / side", "6 / side"], allDone: true },
          { name: "Treadmill Cool-Down", formTip: "Walk it out 5 minutes.", repStatus: "prescribed", targets: ["5 min"], allDone: true },
        ],
      });

      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  createSession: defineAction({
    request: z.object({
      title: z.string().min(1).max(200),
      phase: z.enum(["ramp", "build", "reveal", "refine"]),
      date: z.string().max(10).nullable(),
      location: z.string().max(120).default(""),
      exercises: z
        .array(
          z.object({
            name: z.string().min(1).max(120),
            formTip: z.string().max(500).default(""),
            sets: z.number().int().min(1).max(10),
            targetReps: z.string().max(30).default("10"),
          }),
        )
        .min(1)
        .max(20),
    }),
    response: z.object({ id: z.number() }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const id = await insertSession(db, {
        title: args.title,
        phase: args.phase,
        date: args.date,
        status: "planned",
        location: args.location,
        exercises: args.exercises.map((e) => ({
          name: e.name,
          formTip: e.formTip,
          repStatus: "planned" as const,
          targets: Array.from({ length: e.sets }, () => e.targetReps),
          allDone: false,
        })),
      });
      ctx.invalidateQueries();
      return { id };
    },
  }),

  updateSet: defineAction({
    request: z.object({
      setId: z.number().int().positive(),
      done: z.boolean().optional(),
      weight: z.string().max(30).nullable().optional(),
      actualReps: z.string().max(30).nullable().optional(),
    }),
    response: okResponse,
    handler: async (ctx, args): Promise<z.infer<typeof okResponse>> => {
      const db = ctx.db<typeof schema>();
      const patch: Partial<{ done: number; weight: string | null; actualReps: string | null }> = {};
      if (args.done !== undefined) patch.done = args.done ? 1 : 0;
      if (args.weight !== undefined) patch.weight = args.weight;
      if (args.actualReps !== undefined) patch.actualReps = args.actualReps;
      await db.update(schema.sets).set(patch).where(eq(schema.sets.id, args.setId));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  updateSession: defineAction({
    request: z.object({
      sessionId: z.number().int().positive(),
      status: z.enum(["planned", "completed"]).optional(),
      rpe: z.number().int().min(1).max(10).nullable().optional(),
      soreness: z.string().max(1000).optional(),
      modifications: z.string().max(1000).optional(),
      recoveryNotes: z.string().max(1000).optional(),
      location: z.string().max(120).optional(),
      date: z.string().max(10).nullable().optional(),
      timeOfDay: z.enum(["morning", "afternoon", "evening"]).nullable().optional(),
    }),
    response: okResponse,
    handler: async (ctx, args): Promise<z.infer<typeof okResponse>> => {
      const db = ctx.db<typeof schema>();
      const { sessionId, ...patch } = args;
      await db
        .update(schema.sessions)
        .set(patch)
        .where(eq(schema.sessions.id, sessionId));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  deleteSession: defineAction({
    request: z.object({ sessionId: z.number().int().positive() }),
    response: okResponse,
    handler: async (ctx, args): Promise<z.infer<typeof okResponse>> => {
      const db = ctx.db<typeof schema>();
      const exRows = await db
        .select({ id: schema.exercises.id })
        .from(schema.exercises)
        .where(eq(schema.exercises.sessionId, args.sessionId));
      for (const e of exRows) {
        await db.delete(schema.sets).where(eq(schema.sets.exerciseId, e.id));
      }
      await db
        .delete(schema.exercises)
        .where(eq(schema.exercises.sessionId, args.sessionId));
      await db.delete(schema.sessions).where(eq(schema.sessions.id, args.sessionId));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  addHealthEntry: defineAction({
    request: z.object({
      kind: z.enum(["weight", "waist", "sleep", "bp", "rhr", "protein"]),
      date: z.string().min(10).max(10),
      value: z.number().positive().max(2000).nullable().default(null),
      systolic: z.number().int().min(40).max(300).nullable().default(null),
      diastolic: z.number().int().min(20).max(200).nullable().default(null),
      note: z.string().max(500).default(""),
    }),
    response: z.object({ id: z.number() }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .insert(schema.healthEntries)
        .values({
          kind: args.kind,
          date: args.date,
          value: args.value,
          systolic: args.systolic,
          diastolic: args.diastolic,
          note: args.note,
        })
        .returning({ id: schema.healthEntries.id });
      if (!row) throw new Error("addHealthEntry failed");
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  deleteHealthEntry: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: okResponse,
    handler: async (ctx, args): Promise<z.infer<typeof okResponse>> => {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.healthEntries).where(eq(schema.healthEntries.id, args.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  addPushupLog: defineAction({
    request: z.object({
      date: z.string().min(10).max(10),
      floorReps: z.number().int().min(0).max(10000),
      inclineReps: z.number().int().min(0).max(10000),
      maxConsecutive: z.number().int().min(0).max(1000),
      note: z.string().max(500).default(""),
    }),
    response: z.object({ id: z.number() }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .insert(schema.pushupLogs)
        .values(args)
        .returning({ id: schema.pushupLogs.id });
      if (!row) throw new Error("addPushupLog failed");
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  deletePushupLog: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: okResponse,
    handler: async (ctx, args): Promise<z.infer<typeof okResponse>> => {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.pushupLogs).where(eq(schema.pushupLogs.id, args.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  addCheckin: defineAction({
    request: z.object({
      date: z.string().min(10).max(10),
      soreness: z.number().int().min(0).max(10),
      energy: z.number().int().min(0).max(10),
      backFeel: z.string().max(200).default(""),
      backScore: z.number().int().min(0).max(10).nullable().default(null),
      note: z.string().max(1000).default(""),
    }),
    response: z.object({ id: z.number() }),
    handler: async (ctx, args) => {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .insert(schema.checkins)
        .values(args)
        .returning({ id: schema.checkins.id });
      if (!row) throw new Error("addCheckin failed");
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  deleteCheckin: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: okResponse,
    handler: async (ctx, args): Promise<z.infer<typeof okResponse>> => {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.checkins).where(eq(schema.checkins.id, args.id));
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),

  updateMeta: defineAction({
    request: z.object({ key: z.string().min(1).max(60), value: z.string().max(60) }),
    response: okResponse,
    handler: async (ctx, args): Promise<z.infer<typeof okResponse>> => {
      const db = ctx.db<typeof schema>();
      await db
        .insert(schema.meta)
        .values({ key: args.key, value: args.value })
        .onConflictDoUpdate({
          target: schema.meta.key,
          set: { value: args.value },
        });
      ctx.invalidateQueries();
      return { ok: true as const };
    },
  }),
} satisfies ActionsModule;
