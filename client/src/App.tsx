import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import {
CartesianGrid,
Line,
LineChart,
ReferenceLine,
ResponsiveContainer,
Tooltip,
XAxis,
YAxis,
} from "recharts";
import { api, type ApiResponse } from "./api";

type State = ApiResponse<typeof api, "getState">;
type Session = State["sessions"][number];
type Exercise = Session["exercises"][number];
type HealthEntry = State["health"][number];

const PHASE_LABEL: Record<string, string> = {
  ramp: "RAMP",
  build: "PHASE 1 · BUILD",
  reveal: "PHASE 2 · REVEAL",
  refine: "PHASE 3 · REFINE",
};

function todayStr(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "Date not recorded";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const dow = (d.getDay() + 6) % 7;
  return shiftDate(iso, -dow);
}

function demoUrl(exerciseName: string): string {
  const q = encodeURIComponent(`${exerciseName} form shorts`);
  return `https://www.youtube.com/results?search_query=${q}`;
}

function sessionProgress(s: Session): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const e of s.exercises) {
    for (const st of e.sets) {
      total++;
      if (st.done) done++;
    }
  }
  return { done, total };
}

function timeOfDayLabel(t: string | null): string {
  if (t === "morning") return "Morning";
  if (t === "afternoon") return "Afternoon";
  if (t === "evening") return "Evening";
  return "";
}

function buildLogText(s: Session): string {
  const lines: string[] = [];
  const tod = timeOfDayLabel(s.timeOfDay);
  lines.push(`${s.title} — ${PHASE_LABEL[s.phase] ?? s.phase} — ${fmtDate(s.date)}${tod ? ` (${tod})` : ""}`);
  lines.push(`Status: ${s.status}${s.rpe ? ` · Effort (RPE): ${s.rpe}/10` : ""}${s.location ? ` · ${s.location}` : ""}`);
  for (const e of s.exercises) {
    lines.push(`\n${e.name}:`);
    for (const st of e.sets) {
      const w = st.weight ? ` @ ${st.weight}` : "";
      const a = st.actualReps ? ` (actual: ${st.actualReps})` : "";
      lines.push(`  Set ${st.setNumber}: ${st.targetReps}${w}${a} — ${st.done ? "done" : "not done"}`);
    }
    if (e.note) lines.push(`  Note: ${e.note}`);
  }
  if (s.soreness) lines.push(`\nSoreness: ${s.soreness}`);
  if (s.modifications) lines.push(`Modifications: ${s.modifications}`);
  if (s.recoveryNotes) lines.push(`Recovery: ${s.recoveryNotes}`);
  if (s.notes) lines.push(`Notes: ${s.notes}`);
  return lines.join("\n");
}

/* ---------------- Templates for new sessions ---------------- */

type TemplateExercise = { name: string; formTip: string; sets: number; targetReps: string };
type Template = { id: string; title: string; phase: "ramp" | "build" | "reveal" | "refine"; blurb: string; exercises: TemplateExercise[] };

const TEMPLATES: Template[] = [
  {
    id: "ramp-a",
    title: "Ramp Session — P90X-Style Foundation",
    phase: "ramp",
    blurb: "Off-script P90X-style work: warm the body up, groove the form, leave gas in the tank.",
    exercises: [
      { name: "Treadmill Warm-Up", formTip: "Easy pace, build heat.", sets: 1, targetReps: "7 min" },
      { name: "Leg Press", formTip: "Light and smooth — form first, load later.", sets: 2, targetReps: "12" },
      { name: "Chest Press", formTip: "Shoulder blades pinched, controlled press.", sets: 2, targetReps: "12" },
      { name: "Lat Pulldown", formTip: "Chest tall, bar to upper chest.", sets: 2, targetReps: "10" },
      { name: "Chest-Supported DB Row", formTip: "Bench 30–45°, chest glued down, row to the ribs.", sets: 2, targetReps: "10" },
      { name: "Dead Bugs", formTip: "Low back pressed into the floor throughout.", sets: 2, targetReps: "6 / side" },
      { name: "Bird Dogs", formTip: "Hips level, reach long, pause 1 sec.", sets: 2, targetReps: "6 / side" },
      { name: "Treadmill Cool-Down", formTip: "Walk it out.", sets: 1, targetReps: "5 min" },
    ],
  },
  {
    id: "build-a",
    title: "BUILD A — Legs / Push / Back",
    phase: "build",
    blurb: "Full-body strength A. Moderate effort (~6/10), 60–90s rests, ~3 clean reps in reserve.",
    exercises: [
      { name: "Treadmill Warm-Up", formTip: "Easy pace, build heat.", sets: 1, targetReps: "7 min" },
      { name: "Leg Press", formTip: "Full foot on the plate, controlled lower, no hard lockout.", sets: 3, targetReps: "12" },
      { name: "Chest Press", formTip: "Pinch shoulder blades, press smooth. Push-up challenge days replace some of this volume.", sets: 3, targetReps: "12" },
      { name: "Chest-Supported DB Row", formTip: "Bench 30–45°, chest down, row to ribs — the back builder.", sets: 3, targetReps: "12" },
      { name: "Lat Pulldown", formTip: "Chest tall, squeeze the lats at the bottom.", sets: 2, targetReps: "10" },
      { name: "Triceps Rope Pushdowns", formTip: "Elbows pinned, split the rope at the bottom.", sets: 2, targetReps: "12" },
      { name: "Dead Bugs", formTip: "Low back glued down, exhale on the reach.", sets: 2, targetReps: "6 / side" },
      { name: "Treadmill Cool-Down", formTip: "Walk it out.", sets: 1, targetReps: "5 min" },
    ],
  },
  {
    id: "build-b",
    title: "BUILD B — Legs / Shoulders / Arms / Core",
    phase: "build",
    blurb: "Full-body strength B. Same rules: ~6/10 effort, clean reps, back stays supported.",
    exercises: [
      { name: "Treadmill Warm-Up", formTip: "Easy pace, build heat.", sets: 1, targetReps: "7 min" },
      { name: "Leg Press", formTip: "Full foot, controlled, no hard lockout.", sets: 3, targetReps: "12" },
      { name: "Seated DB Shoulder Press", formTip: "Back supported, no shrugging.", sets: 2, targetReps: "10" },
      { name: "Seated DB Lateral Raises", formTip: "Lead with elbows, stop at shoulder height.", sets: 2, targetReps: "12" },
      { name: "Chest-Supported DB Row", formTip: "Bench 30–45°, row to the ribs, squeeze.", sets: 3, targetReps: "10" },
      { name: "DB Biceps Curls", formTip: "Elbows pinned, slow lower.", sets: 2, targetReps: "12" },
      { name: "Bird Dogs", formTip: "Hips level, reach long, 1-sec pause.", sets: 2, targetReps: "6 / side" },
      { name: "Side Plank", formTip: "McGill Big 3: stack hips, hold 8–10 sec per rep, breathe.", sets: 2, targetReps: "8-10 sec holds" },
      { name: "Treadmill Cool-Down", formTip: "Walk it out.", sets: 1, targetReps: "5 min" },
    ],
  },
  {
    id: "core-pushup",
    title: "Core + Push-Up Challenge Day",
    phase: "build",
    blurb: "Mon/Fri structure: push-up challenge work plus the core track. Never to failure — leave ~2 reps in reserve.",
    exercises: [
      { name: "Floor Push-Ups", formTip: "Straight line head to heels, chest to a fist-height from the floor. Stop 2 reps before form breaks.", sets: 3, targetReps: "4" },
      { name: "Incline Push-Ups (counter height)", formTip: "Hands on a counter, body straight, full lockout at the top.", sets: 2, targetReps: "8-10" },
      { name: "Dead Bugs", formTip: "Low back pressed into the floor the whole set.", sets: 2, targetReps: "6 / side" },
      { name: "Bird Dogs", formTip: "Reach long, hips level, pause.", sets: 2, targetReps: "6 / side" },
      { name: "Modified Curl-Up", formTip: "McGill Big 3: hands under low back, lift head/shoulders slightly, hold 8–10 sec. No full sit-ups.", sets: 2, targetReps: "8-10 sec holds" },
      { name: "Side Plank", formTip: "McGill Big 3: hips stacked, short 8–10 sec holds, quality over duration.", sets: 2, targetReps: "8-10 sec holds" },
      { name: "Forearm Plank", formTip: "Only if comfortable: ribs down, glutes squeezed.", sets: 2, targetReps: "15-20 sec" },
    ],
  },
];

/* ---------------- Small UI pieces ---------------- */

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-[family-name:var(--font-display)] text-lg font-black tracking-wide text-[var(--text)] uppercase">
      {children}
    </h2>
  );
}

function ProgressBar({ pct, color = "var(--accent)" }: { pct: number; color?: string }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface2)]" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

const inputCls =
  "w-full min-h-[48px] rounded-lg border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-base sm:py-2 sm:text-sm text-[var(--text)] placeholder:text-[var(--dim)]";
const labelCls = "block text-xs font-semibold tracking-wide text-[var(--dim)] uppercase mb-1";
const btnPrimary =
  "min-h-[48px] rounded-xl bg-[var(--accent)] px-4 py-3 sm:py-2.5 font-[family-name:var(--font-display)] text-base sm:text-sm font-bold text-[var(--accent-ink)] disabled:opacity-50";
const btnGhost =
  "min-h-[48px] rounded-xl border border-[var(--border)] px-4 py-3 sm:py-2.5 text-base sm:text-sm font-semibold text-[var(--text)] disabled:opacity-50";

/* ---------------- Workout session components ---------------- */

function SetRow({ set, onChange }: { set: Exercise["sets"][number]; onChange: (patch: { done?: boolean; weight?: string | null; actualReps?: string | null }) => void }) {
  const [weight, setWeight] = useState<string | null>(null);
  const [reps, setReps] = useState<string | null>(null);
  const wVal = weight ?? set.weight ?? "";
  const rVal = reps ?? set.actualReps ?? "";
  return (
    <div className="py-2">
      <div className="flex min-h-[48px] items-center gap-3">
        <input
          type="checkbox"
          aria-label={`Set ${set.setNumber} done`}
          checked={set.done}
          onChange={(e) => onChange({ done: e.target.checked })}
          className="h-8 w-8 shrink-0 accent-[#c8f31d]"
        />
        <span className="text-base sm:text-sm text-[var(--dim)]">
          Set {set.setNumber} · <span className="font-semibold text-[var(--text)]">{set.targetReps}</span>
          <span className="text-[var(--dim)]"> target</span>
        </span>
      </div>
      <div className="mt-1 ml-11 grid grid-cols-2 gap-2">
        <input
          aria-label={`Set ${set.setNumber} weight`}
          placeholder="lb / setting"
          inputMode="decimal"
          value={wVal}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={() => {
            if (weight !== null && weight !== (set.weight ?? "")) onChange({ weight: weight === "" ? null : weight });
            setWeight(null);
          }}
          className="min-h-[48px] min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-base sm:py-2 sm:text-sm"
        />
        <input
          aria-label={`Set ${set.setNumber} actual reps`}
          placeholder="actual reps"
          inputMode="numeric"
          value={rVal}
          onChange={(e) => setReps(e.target.value)}
          onBlur={() => {
            if (reps !== null && reps !== (set.actualReps ?? "")) onChange({ actualReps: reps === "" ? null : reps });
            setReps(null);
          }}
          className="min-h-[48px] min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface2)] px-3 py-3 text-base sm:py-2 sm:text-sm"
        />
      </div>
    </div>
  );
}

function ExerciseBlock({ exercise, onSetChange }: { exercise: Exercise; onSetChange: (setId: number, patch: { done?: boolean; weight?: string | null; actualReps?: string | null }) => void }) {
  return (
    <div className="border-t border-[var(--border)] py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="font-[family-name:var(--font-condensed)] text-base font-bold tracking-wide">{exercise.name}</h4>
        {exercise.repStatus === "confirmed" && (
          <span className="rounded bg-[var(--accent)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--accent-ink)]">REPS CONFIRMED</span>
        )}
        {exercise.repStatus === "prescribed" && (
          <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--dim)]">PRESCRIBED</span>
        )}
        <a
          href={demoUrl(exercise.name)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Watch demo for ${exercise.name} on YouTube`}
          className="ml-auto inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--accent)] underline underline-offset-2"
        >
          ▶ Watch demo
        </a>
      </div>
      {exercise.formTip && <p className="mt-1 text-sm text-[var(--dim)]">{exercise.formTip}</p>}
      {exercise.note && <p className="mt-0.5 text-sm text-[var(--amber)]">{exercise.note}</p>}
      <div className="mt-1">
        {exercise.sets.map((st) => (
          <SetRow key={st.id} set={st} onChange={(patch) => onSetChange(st.id, patch)} />
        ))}
      </div>
    </div>
  );
}

function SessionCard({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(session.status === "planned");
  const [copied, setCopied] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [notes, setNotes] = useState<{ soreness: string; modifications: string; recoveryNotes: string } | null>(null);
  const [rpe, setRpe] = useState<string | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["state"] });

  const setMut = useMutation({
    mutationFn: (args: { setId: number; done?: boolean; weight?: string | null; actualReps?: string | null }) => api.updateSet(args),
    onSuccess: invalidate,
  });
  const sessionMut = useMutation({
    mutationFn: (args: Parameters<typeof api.updateSession>[0]) => api.updateSession(args),
    onSuccess: invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteSession({ sessionId: session.id }),
    onSuccess: invalidate,
  });

  const prog = sessionProgress(session);
  const pct = prog.total ? (prog.done / prog.total) * 100 : 0;
  const notesVal = notes ?? {
    soreness: session.soreness,
    modifications: session.modifications,
    recoveryNotes: session.recoveryNotes,
  };

  const copyLog = async () => {
    const text = buildLogText(session);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <article id={`session-${session.id}`} className="scroll-mt-24 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${session.title} details`}
        className="w-full text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${session.status === "completed" ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "border border-[var(--amber)] text-[var(--amber)]"}`}>
            {session.status === "completed" ? "DONE" : "PLANNED"}
          </span>
          <span className="text-[11px] font-bold tracking-wider text-[var(--dim)]">{PHASE_LABEL[session.phase]}</span>
          <span className="ml-auto text-sm text-[var(--dim)]">{fmtDate(session.date)}{session.timeOfDay ? ` · ${timeOfDayLabel(session.timeOfDay)}` : ""}</span>
        </div>
        <h3 className="mt-1.5 font-[family-name:var(--font-display)] text-lg leading-snug font-black">{session.title}</h3>
        <div className="mt-2 flex items-center gap-3">
          <ProgressBar pct={pct} />
          <span className="shrink-0 text-sm font-semibold text-[var(--dim)]">{prog.done}/{prog.total} sets</span>
        </div>
      </button>

      {open && (
        <div className="mt-2">
          {session.notes && <p className="py-2 text-sm text-[var(--dim)]">{session.notes}</p>}
          {session.exercises.map((e) => (
            <ExerciseBlock key={e.id} exercise={e} onSetChange={(setId, patch) => setMut.mutate({ setId, ...patch })} />
          ))}

          <div className="mt-3 grid gap-3 border-t border-[var(--border)] pt-4">
            <div>
              <label className={labelCls} htmlFor={`rpe-${session.id}`}>Session effort (RPE 1–10) — plan target ~6</label>
              <input
                id={`rpe-${session.id}`}
                type="number"
                min={1}
                max={10}
                inputMode="numeric"
                placeholder="—"
                value={rpe ?? (session.rpe?.toString() ?? "")}
                onChange={(e) => setRpe(e.target.value)}
                onBlur={() => {
                  if (rpe !== null) {
                    const v = rpe === "" ? null : Math.max(1, Math.min(10, Number(rpe)));
                    sessionMut.mutate({ sessionId: session.id, rpe: v });
                    setRpe(null);
                  }
                }}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor={`sore-${session.id}`}>Soreness</label>
              <textarea id={`sore-${session.id}`} rows={2} className={inputCls} value={notesVal.soreness}
                onChange={(e) => setNotes({ ...notesVal, soreness: e.target.value })} placeholder="How did the body feel after?" />
            </div>
            <div>
              <label className={labelCls} htmlFor={`mod-${session.id}`}>Modifications</label>
              <textarea id={`mod-${session.id}`} rows={2} className={inputCls} value={notesVal.modifications}
                onChange={(e) => setNotes({ ...notesVal, modifications: e.target.value })} placeholder="Anything swapped, skipped, or adjusted?" />
            </div>
            <div>
              <label className={labelCls} htmlFor={`rec-${session.id}`}>Recovery notes</label>
              <textarea id={`rec-${session.id}`} rows={2} className={inputCls} value={notesVal.recoveryNotes}
                onChange={(e) => setNotes({ ...notesVal, recoveryNotes: e.target.value })} placeholder="Sleep, food, back feel, energy…" />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {notes && (
              <button type="button" className={btnPrimary} disabled={sessionMut.isPending}
                onClick={() => { sessionMut.mutate({ sessionId: session.id, ...notesVal }); setNotes(null); }}>
                Save notes
              </button>
            )}
            {session.status === "planned" ? (
              <button type="button" className={btnPrimary} disabled={sessionMut.isPending}
                onClick={() => sessionMut.mutate({ sessionId: session.id, status: "completed", date: session.date ?? todayStr() })}>
                ✓ Mark workout complete
              </button>
            ) : (
              <button type="button" className={btnGhost}
                onClick={() => sessionMut.mutate({ sessionId: session.id, status: "planned" })}>
                Reopen workout
              </button>
            )}
            <button type="button" className={btnGhost} onClick={copyLog} aria-label={`Copy workout log for ${session.title}`}>
              {copied ? "Copied ✓ — paste it to your coaches" : "📋 Copy workout log"}
            </button>
            {confirmDel ? (
              <>
                <span className="self-center text-sm text-[var(--danger)]">Delete this workout for good?</span>
                <button type="button" className="rounded-xl bg-[var(--danger)] px-3 py-2.5 text-sm font-bold text-white"
                  aria-label={`Confirm delete ${session.title}`} onClick={() => deleteMut.mutate()}>
                  Yes, delete
                </button>
                <button type="button" className={btnGhost} onClick={() => setConfirmDel(false)}>Keep it</button>
              </>
            ) : (
              <button type="button" className="rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--danger)]"
                aria-label={`Delete ${session.title}`} onClick={() => setConfirmDel(true)}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

/* ---------------- Forms ---------------- */

function NewWorkoutForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState<string>("build-a");
  const [date, setDate] = useState(todayStr());
  const [location, setLocation] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [rows, setRows] = useState<{ name: string; sets: number; targetReps: string }[]>([
    { name: "", sets: 3, targetReps: "10" },
  ]);
  const mut = useMutation({
    mutationFn: (args: Parameters<typeof api.createSession>[0]) => api.createSession(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["state"] });
      onDone();
    },
  });
  const template = TEMPLATES.find((t) => t.id === templateId);

  const submit = () => {
    if (templateId === "custom") {
      const exercises = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), formTip: "", sets: r.sets, targetReps: r.targetReps || "10" }));
      if (!customTitle.trim() || exercises.length === 0) return;
      mut.mutate({ title: customTitle.trim(), phase: "build", date, location, exercises });
    } else if (template) {
      mut.mutate({
        title: template.title,
        phase: template.phase,
        date,
        location,
        exercises: template.exercises.map((e) => ({ name: e.name, formTip: e.formTip, sets: e.sets, targetReps: e.targetReps })),
      });
    }
  };

  return (
    <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div>
        <label className={labelCls} htmlFor="tpl">Workout template</label>
        <select id="tpl" className={inputCls} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
          <option value="custom">Custom workout…</option>
        </select>
        {template && <p className="mt-1 text-sm text-[var(--dim)]">{template.blurb}</p>}
      </div>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="nw-date">Date</label>
          <input id="nw-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="nw-loc">Where</label>
          <input id="nw-loc" className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Home gym / lunch gym" />
        </div>
      </div>
      {templateId === "custom" && (
        <div className="grid gap-3">
          <div>
            <label className={labelCls} htmlFor="nw-title">Workout name</label>
            <input id="nw-title" className={inputCls} value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="e.g. Lunch Gym Session" />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-[1fr_64px_76px] [&>*:first-child]:col-span-2 min-[480px]:[&>*:first-child]:col-span-1">
              <input aria-label={`Exercise ${i + 1} name`} className={inputCls} placeholder="Exercise name" value={r.name}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input aria-label={`Exercise ${i + 1} sets`} type="number" min={1} max={10} className={inputCls} value={r.sets}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, sets: Number(e.target.value) || 1 } : x)))} />
              <input aria-label={`Exercise ${i + 1} target reps`} className={inputCls} placeholder="reps" value={r.targetReps}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, targetReps: e.target.value } : x)))} />
            </div>
          ))}
          <button type="button" className={btnGhost} onClick={() => setRows([...rows, { name: "", sets: 3, targetReps: "10" }])}>
            + Add exercise
          </button>
        </div>
      )}
      <button type="button" className={btnPrimary} disabled={mut.isPending} onClick={submit}>
        {mut.isPending ? "Adding…" : "Add workout"}
      </button>
      {mut.isError && <p className="text-sm text-[var(--danger)]">Could not add the workout — check the fields and try again.</p>}
    </div>
  );
}

function HealthLogForm() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<"weight" | "waist" | "sleep" | "bp" | "rhr" | "protein">("weight");
  const [date, setDate] = useState(todayStr());
  const [value, setValue] = useState("");
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [note, setNote] = useState("");
  const mut = useMutation({
    mutationFn: (args: Parameters<typeof api.addHealthEntry>[0]) => api.addHealthEntry(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["state"] });
      setValue(""); setSys(""); setDia(""); setNote("");
    },
  });
  const unitLabel = kind === "weight" ? "Weight (lb)" : kind === "waist" ? "Waist (in)" : kind === "sleep" ? "Sleep (hours)" : kind === "protein" ? "Protein (g)" : "Resting heart rate (bpm)";
  return (
    <form
      className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (kind === "bp") {
          if (!sys || !dia) return;
          mut.mutate({ kind, date, value: null, systolic: Number(sys), diastolic: Number(dia), note });
        } else {
          if (!value) return;
          mut.mutate({ kind, date, value: Number(value), systolic: null, diastolic: null, note });
        }
      }}
    >
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="h-kind">Measure</label>
          <select id="h-kind" className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="weight">Weight</option>
            <option value="waist">Waist</option>
            <option value="sleep">Sleep</option>
            <option value="bp">Blood pressure</option>
            <option value="rhr">Resting heart rate</option>
            <option value="protein">Protein (daily total)</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="h-date">Date</label>
          <input id="h-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      {kind === "bp" ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="h-sys">Systolic</label>
            <input id="h-sys" type="number" inputMode="numeric" className={inputCls} value={sys} onChange={(e) => setSys(e.target.value)} placeholder="120" />
          </div>
          <div>
            <label className={labelCls} htmlFor="h-dia">Diastolic</label>
            <input id="h-dia" type="number" inputMode="numeric" className={inputCls} value={dia} onChange={(e) => setDia(e.target.value)} placeholder="80" />
          </div>
        </div>
      ) : (
        <div>
          <label className={labelCls} htmlFor="h-value">{unitLabel}</label>
          <input id="h-value" type="number" step="0.1" inputMode="decimal" className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} placeholder="—" />
        </div>
      )}
      {kind === "bp" && <p className="text-sm text-[var(--dim)]">Morning readings count most — take them first thing, before medication.</p>}
      <div>
        <label className={labelCls} htmlFor="h-note">Note (optional)</label>
        <input id="h-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering" />
      </div>
      <button type="submit" className={btnPrimary} disabled={mut.isPending}>Log it</button>
      {mut.isError && <p className="text-sm text-[var(--danger)]">Could not save — try again.</p>}
    </form>
  );
}

function CheckinForm() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [soreness, setSoreness] = useState(3);
  const [energy, setEnergy] = useState(6);
  const [backScore, setBackScore] = useState(6);
  const [backFeel, setBackFeel] = useState("");
  const [note, setNote] = useState("");
  const mut = useMutation({
    mutationFn: (args: Parameters<typeof api.addCheckin>[0]) => api.addCheckin(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["state"] });
      setBackFeel(""); setNote("");
    },
  });
  return (
    <form
      className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
      onSubmit={(e) => { e.preventDefault(); mut.mutate({ date, soreness, energy, backScore, backFeel, note }); }}
    >
      <div>
        <label className={labelCls} htmlFor="c-date">Date</label>
        <input id="c-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        <label className={labelCls} htmlFor="c-sore">Soreness — {soreness}/10</label>
        <input id="c-sore" type="range" min={0} max={10} value={soreness} onChange={(e) => setSoreness(Number(e.target.value))} className="w-full accent-[#c8f31d]" />
      </div>
      <div>
        <label className={labelCls} htmlFor="c-energy">Energy — {energy}/10</label>
        <input id="c-energy" type="range" min={0} max={10} value={energy} onChange={(e) => setEnergy(Number(e.target.value))} className="w-full accent-[#c8f31d]" />
      </div>
      <div>
        <label className={labelCls} htmlFor="c-back">Back function — {backScore}/10 (10 = moves free, no complaints)</label>
        <input id="c-back" type="range" min={0} max={10} value={backScore} onChange={(e) => setBackScore(Number(e.target.value))} className="w-full accent-[#c8f31d]" />
      </div>
      <div>
        <label className={labelCls} htmlFor="c-backfeel">Back notes</label>
        <input id="c-backfeel" className={inputCls} value={backFeel} onChange={(e) => setBackFeel(e.target.value)} placeholder="Tight? Loose? Any spasms?" />
      </div>
      <div>
        <label className={labelCls} htmlFor="c-note">Recovery note</label>
        <input id="c-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sleep, CPAP, food, mood…" />
      </div>
      <button type="submit" className={btnPrimary} disabled={mut.isPending}>Save check-in</button>
    </form>
  );
}

function PushupLogForm() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayStr());
  const [floor, setFloor] = useState("");
  const [incline, setIncline] = useState("");
  const [maxConsec, setMaxConsec] = useState("");
  const [note, setNote] = useState("");
  const mut = useMutation({
    mutationFn: (args: Parameters<typeof api.addPushupLog>[0]) => api.addPushupLog(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["state"] });
      setFloor(""); setIncline(""); setMaxConsec(""); setNote("");
    },
  });
  return (
    <form
      className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate({
          date,
          floorReps: Number(floor) || 0,
          inclineReps: Number(incline) || 0,
          maxConsecutive: Number(maxConsec) || 0,
          note,
        });
      }}
    >
      <div>
        <label className={labelCls} htmlFor="p-date">Date</label>
        <input id="p-date" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-3 min-[480px]:gap-2">
        <div>
          <label className={labelCls} htmlFor="p-floor">Floor reps (total)</label>
          <input id="p-floor" type="number" min={0} inputMode="numeric" className={inputCls} value={floor} onChange={(e) => setFloor(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className={labelCls} htmlFor="p-incline">Incline reps</label>
          <input id="p-incline" type="number" min={0} inputMode="numeric" className={inputCls} value={incline} onChange={(e) => setIncline(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className={labelCls} htmlFor="p-max">Best set in a row</label>
          <input id="p-max" type="number" min={0} inputMode="numeric" className={inputCls} value={maxConsec} onChange={(e) => setMaxConsec(e.target.value)} placeholder="0" />
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="p-note">Note (optional)</label>
        <input id="p-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Structured session, grease-the-groove sets, test day…" />
      </div>
      <button type="submit" className={btnPrimary} disabled={mut.isPending}>Log push-ups</button>
      {mut.isError && <p className="text-sm text-[var(--danger)]">Could not save — try again.</p>}
    </form>
  );
}

/* ---------------- Main App ---------------- */

type Tab = "train" | "health" | "challenge" | "roadmap";

export function App() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("train");
  const [showNew, setShowNew] = useState(false);
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null);
  const seedTried = useRef(false);

  const state = useQuery({ queryKey: ["state"], queryFn: () => api.getState({}) });
  const seedMut = useMutation({
    mutationFn: () => api.seedInitialData({}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["state"] }),
  });
  const metaMut = useMutation({
    mutationFn: (args: { key: string; value: string }) => api.updateMeta(args),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["state"] }),
  });
  const deleteHealthMut = useMutation({
    mutationFn: (id: number) => api.deleteHealthEntry({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["state"] }),
  });
  const deletePushupMut = useMutation({
    mutationFn: (id: number) => api.deletePushupLog({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["state"] }),
  });
  const quickStartMut = useMutation({
    mutationFn: (args: Parameters<typeof api.createSession>[0]) => api.createSession(args),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["state"] });
      if (res && typeof res === "object" && "id" in res && typeof res.id === "number") {
        setPendingScrollId(res.id);
      }
    },
  });

  const data = state.data;
  useEffect(() => {
    if (data && (!data.seeded || data.meta["seedV2"] !== "1") && !seedTried.current) {
      seedTried.current = true;
      seedMut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.seeded, data?.meta["seedV2"]]);

  useEffect(() => {
    if (pendingScrollId === null) return;
    const el = document.getElementById(`session-${pendingScrollId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingScrollId(null);
    }
  }, [data?.sessions, pendingScrollId, tab]);

  const derived = useMemo(() => {
    if (!data) return null;
    const meta = data.meta;
    const num = (k: string, d: number) => {
      const v = Number(meta[k]);
      return Number.isFinite(v) && meta[k] ? v : d;
    };
    const buildTotal = num("buildSessionsTotal", 36);
    const goalWeight = num("goalWeight", 220);
    const completed = data.sessions.filter((s) => s.status === "completed");
    const buildDone = completed.length;
    // Training days = distinct calendar dates with a completed session —
    // two workouts on two different days count as two days, never one.
    const trainingDays = new Set(completed.map((s) => s.date).filter(Boolean)).size;

    // --- streak with freezes ---
    let freezeDates: string[] = [];
    try {
      const parsed: unknown = JSON.parse(meta["freezeDates"] ?? "[]");
      if (Array.isArray(parsed)) freezeDates = parsed.filter((x): x is string => typeof x === "string");
    } catch { freezeDates = []; }
    const activity = new Set<string>();
    for (const s of completed) if (s.date) activity.add(s.date);
    for (const p of data.pushups) activity.add(p.date);
    for (const f of freezeDates) activity.add(f);
    const today = todayStr();
    let cursor = activity.has(today) ? today : shiftDate(today, -1);
    let streak = 0;
    while (activity.has(cursor)) {
      streak++;
      cursor = shiftDate(cursor, -1);
    }
    const gapDay = cursor; // first inactive day behind the streak
    const monthPrefix = today.slice(0, 7);
    const freezesUsed = freezeDates.filter((d) => d.startsWith(monthPrefix)).length;
    const freezesLeft = Math.max(0, 2 - freezesUsed);
    const repairable =
      streak > 0 && freezesLeft > 0 && gapDay >= shiftDate(today, -7) ? gapDay : null;

    // --- weekly consistency (process): count distinct training days ---
    const weekStart = mondayOf(today);
    const weekEnd = shiftDate(weekStart, 6);
    const inWeek = (d: string | null) => d !== null && d >= weekStart && d <= weekEnd;
    const gymThisWeek = new Set(
      completed.filter((s) => inWeek(s.date)).map((s) => s.date),
    ).size;
    const pushDaysThisWeek = new Set(data.pushups.filter((p) => inWeek(p.date)).map((p) => p.date)).size;
    const consistency = Math.min(100, Math.round(((gymThisWeek + pushDaysThisWeek) / 5) * 100));

    // --- weight: 7-day average is the headline ---
    const weights = data.health.filter((h) => h.kind === "weight" && h.value !== null);
    const avg7 = (anchor: string) => {
      const window = weights.filter((w) => w.date <= anchor && w.date >= shiftDate(anchor, -6));
      if (window.length === 0) return null;
      return window.reduce((a, w) => a + (w.value ?? 0), 0) / window.length;
    };
    const latestWeight = weights.length ? weights[weights.length - 1] : undefined;
    const currentAvg = latestWeight ? avg7(latestWeight.date) : null;
    const chartData = weights.map((w) => ({
      date: new Date(`${w.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weight: w.value,
      avg: avg7(w.date),
    }));

    // --- PRs / volume per exercise ---
    const prMap = new Map<string, { maxWeight: number; volume: number }>();
    for (const s of data.sessions) {
      for (const e of s.exercises) {
        for (const st of e.sets) {
          const w = Number(st.weight);
          const repsSrc = st.actualReps ?? st.targetReps;
          const reps = Number(repsSrc);
          if (!Number.isFinite(w) || w <= 0 || !st.done) continue;
          const cur = prMap.get(e.name) ?? { maxWeight: 0, volume: 0 };
          cur.maxWeight = Math.max(cur.maxWeight, w);
          if (Number.isFinite(reps) && reps > 0) cur.volume += w * reps;
          prMap.set(e.name, cur);
        }
      }
    }
    const prs = [...prMap.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.maxWeight - a.maxWeight);

    const pushBest = data.pushups.reduce((a, p) => Math.max(a, p.maxConsecutive), 0);
    const pushTotal = data.pushups.reduce((a, p) => a + p.floorReps + p.inclineReps, 0);
    const rhr = data.health.filter((h) => h.kind === "rhr" && h.value !== null);
    const sleeps = data.health.filter((h) => h.kind === "sleep" && h.value !== null);
    const lastWaist = data.health.filter((h) => h.kind === "waist").slice(-1)[0];
    const waistDue = !lastWaist || lastWaist.date <= shiftDate(today, -14);
    const lastBack = data.checkins.find((c) => c.backScore !== null);

    return {
      meta, buildTotal, goalWeight, completed, buildDone, trainingDays, streak, freezesLeft, freezesUsed, freezeDates,
      repairable, gymThisWeek, pushDaysThisWeek, consistency, weights, latestWeight, currentAvg, chartData,
      prs, pushBest, pushTotal, rhr, sleeps, lastWaist, waistDue, lastBack, today,
    };
  }, [data]);

  if (state.isError) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <main className="px-4 py-16 text-center">
          <p className="text-lg font-bold">Couldn't load your data.</p>
          <button type="button" className={`${btnPrimary} mt-4`} onClick={() => state.refetch()}>Try again</button>
        </main>
      </div>
    );
  }
  if (state.isPending || !data || !derived) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <SafeAreaTopScrim backgroundColor="var(--bg)" />
        <main className="px-4 py-16 text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl font-black tracking-wide">PROJECT THE REBUILD</p>
          <p className="mt-2 text-sm text-[var(--dim)]">Loading your training base…</p>
        </main>
      </div>
    );
  }

  const ringPct = Math.min(100, (derived.buildDone / derived.buildTotal) * 100);
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const planned = data.sessions.filter((s) => s.status === "planned");
  const doneList = data.sessions.filter((s) => s.status === "completed");
  const avg7Val = derived.currentAvg;
  const toGoal = avg7Val !== null ? Math.max(0, avg7Val - derived.goalWeight) : null;

  const applyFreeze = (day: string) => {
    const next = [...derived.freezeDates, day];
    metaMut.mutate({ key: "freezeDates", value: JSON.stringify(next) });
  };

  // Next prescribed session in the BUILD full-body rotation.
  // Workouts #1 (Ramp) and #2 are already banked, so the next served is
  // Workout #3, then the A/B rotation keeps alternating from there.
  const nextTemplate =
    TEMPLATES.find((t) => t.id === (derived.buildDone % 2 === 0 ? "build-a" : "build-b")) ??
    TEMPLATES.find((t) => t.id === "build-a")!;
  const nextWorkoutNumber = data.sessions.length + 1;
  const nextWorkoutTitle = `Workout #${nextWorkoutNumber} — ${nextTemplate.title}`;
  const todaysPlanned = planned.find((s) => s.date === derived.today) ?? planned[0];

  const handleNewWorkout = () => {
    setTab("train");
    setShowNew(false);
    if (todaysPlanned) {
      setPendingScrollId(todaysPlanned.id);
      // Fallback if the element is already mounted
      requestAnimationFrame(() => {
        document.getElementById(`session-${todaysPlanned.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    quickStartMut.mutate({
      title: nextWorkoutTitle,
      phase: nextTemplate.phase,
      date: derived.today,
      location: "",
      exercises: nextTemplate.exercises.map((e) => ({
        name: e.name,
        formTip: e.formTip,
        sets: e.sets,
        targetReps: e.targetReps,
      })),
    });
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--bg)] pb-28">
      <SafeAreaTopScrim backgroundColor="var(--bg)" />
      <main className="mx-auto w-full max-w-3xl px-3 pt-3 sm:px-4 sm:pt-4">
        {/* TOP — NEW WORKOUT (one tap starts today's session) */}
        <div className="mb-4">
          <button
            type="button"
            aria-label={todaysPlanned ? `New Workout — open today's workout: ${todaysPlanned.title}` : `New Workout — start ${nextWorkoutTitle} for today`}
            onClick={handleNewWorkout}
            disabled={quickStartMut.isPending}
            className="min-h-[76px] w-full rounded-2xl bg-[var(--accent)] px-5 py-4 text-left text-[var(--accent-ink)] shadow-[0_6px_24px_rgba(200,243,29,0.25)] transition active:scale-[0.99] disabled:opacity-60"
          >
            <span className="block font-[family-name:var(--font-display)] text-2xl leading-none font-black tracking-tight">
              {quickStartMut.isPending ? "Starting…" : "＋ New Workout"}
            </span>
            <span className="mt-1.5 block text-sm leading-snug font-semibold break-words">
              {todaysPlanned
                ? `Today: ${todaysPlanned.title} — tap to open it and log your sets`
                : `Today: ${nextWorkoutTitle} · tap to load the full workout and log as you go`}
            </span>
          </button>
          {quickStartMut.isError && (
            <p className="mt-2 text-sm text-[var(--danger)]">Couldn&apos;t start the workout — tap New Workout to try again.</p>
          )}
        </div>

        {/* HERO */}
        <section aria-label="Progress overview">
          <p className="font-[family-name:var(--font-condensed)] text-sm font-bold tracking-[0.18em] sm:tracking-[0.25em] text-[var(--accent)]">PHASE 1 · BUILD — ACTIVE</p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl sm:text-4xl leading-none font-black tracking-tight">
            PROJECT<br />THE REBUILD
          </h1>
          <div className="mt-4 flex flex-col items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 min-[560px]:flex-row min-[560px]:items-center min-[560px]:gap-5">
            <div className="relative shrink-0" role="img" aria-label={`${derived.buildDone} of ${derived.buildTotal} BUILD sessions done`}>
              <svg width="118" height="118" viewBox="0 0 128 128" className="h-[118px] w-[118px] sm:h-[128px] sm:w-[128px]">
                <circle cx="64" cy="64" r={R} fill="none" stroke="var(--surface2)" strokeWidth="11" />
                <circle cx="64" cy="64" r={R} fill="none" stroke="var(--accent)" strokeWidth="11" strokeLinecap="round"
                  strokeDasharray={CIRC} strokeDashoffset={CIRC - (CIRC * ringPct) / 100} transform="rotate(-90 64 64)" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-[family-name:var(--font-display)] text-3xl font-black">{derived.buildDone}</span>
                <span className="text-[11px] font-bold tracking-wider text-[var(--dim)]">OF ~{derived.buildTotal}</span>
              </div>
            </div>
            <div className="min-w-0 w-full text-center min-[560px]:text-left">
              <p className="font-[family-name:var(--font-condensed)] text-lg leading-tight font-bold">BUILD sessions in the bank</p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--accent)]">{derived.trainingDays} training day{derived.trainingDays === 1 ? "" : "s"} so far</p>
              <p className="mt-1 text-sm text-[var(--dim)]">Ramp first two weeks, then 3 full-body sessions a week. Walking + mobility on recovery days.</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="font-[family-name:var(--font-display)] text-2xl font-black text-[var(--accent)]">{derived.streak}<span className="text-sm text-[var(--dim)]"> day</span></p>
                  <p className="text-[11px] font-bold tracking-wider text-[var(--dim)]">ACTIVE STREAK</p>
                </div>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-2xl font-black text-[var(--accent)]">{derived.consistency}<span className="text-sm text-[var(--dim)]">%</span></p>
                  <p className="text-[11px] font-bold tracking-wider text-[var(--dim)]">WEEKLY CONSISTENCY</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-[var(--dim)]">
                Streak freezes: {derived.freezesLeft} of 2 left this month. A missed day costs a freeze, not the whole streak.
              </p>
              {derived.repairable && (
                <button type="button" className="mt-2 rounded-lg bg-[var(--amber)] px-3 py-2 text-sm font-bold text-black"
                  onClick={() => applyFreeze(derived.repairable ?? derived.today)}>
                  Repair streak — use a freeze for {fmtDate(derived.repairable)}
                </button>
              )}
            </div>
          </div>

          {/* TODAY'S SESSION */}
          {(() => {
            const todays = planned.find((s) => s.date === derived.today) ?? planned[0];
            return (
              <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-[11px] font-bold tracking-[0.2em] text-[var(--accent)]">TODAY'S SESSION</p>
                {todays ? (
                  <>
                    <p className="mt-1 font-[family-name:var(--font-display)] text-xl leading-tight font-black">{todays.title}</p>
                    <p className="mt-1 text-sm text-[var(--dim)]">{fmtDate(todays.date)} · {PHASE_LABEL[todays.phase]} · open it in the workout list below and check sets off as you go.</p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 font-[family-name:var(--font-display)] text-xl leading-tight font-black">Nothing on the books today</p>
                    <p className="mt-1 text-sm text-[var(--dim)]">Tap <strong className="text-[var(--text)]">New Workout</strong> at the very top — it loads today&apos;s workout for you. Showing up is the whole game.</p>
                  </>
                )}
              </div>
            );
          })()}

          {/* PROCESS goals above OUTCOME goals */}
          <div className="mt-3 rounded-2xl border border-[var(--accent)] bg-[var(--surface)] p-4">
            <p className="text-[11px] font-bold tracking-[0.2em] text-[var(--accent)]">THIS WEEK — THE PROCESS (WHAT YOU CONTROL)</p>
            <div className="mt-3 grid gap-3">
              <div>
                <div className="flex justify-between text-sm"><span>Gym sessions</span><span className="font-bold">{derived.gymThisWeek} / 3</span></div>
                <ProgressBar pct={(derived.gymThisWeek / 3) * 100} />
              </div>
              <div>
                <div className="flex justify-between text-sm"><span>Push-up challenge days</span><span className="font-bold">{derived.pushDaysThisWeek} / 2</span></div>
                <ProgressBar pct={(derived.pushDaysThisWeek / 2) * 100} />
              </div>
              <div>
                <div className="flex justify-between text-sm"><span>Core track (with push-ups Mon/Fri, stability Wed)</span><span className="font-bold">{derived.pushDaysThisWeek > 0 ? "in rotation" : "up next"}</span></div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="font-[family-name:var(--font-display)] text-xl font-black">{derived.lastWaist?.value ?? "—"}{derived.lastWaist ? <span className="text-sm text-[var(--dim)]"> in</span> : ""}</p>
              <p className="text-[11px] font-bold tracking-wider text-[var(--dim)]">WAIST — THE GUT METER</p>
              <p className="mt-1 text-xs text-[var(--dim)]">{derived.lastWaist ? `Last measured ${fmtDate(derived.lastWaist.date)}` : "Log your first measurement"}</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="font-[family-name:var(--font-display)] text-xl font-black">{derived.pushBest || "8–9"}</p>
              <p className="text-[11px] font-bold tracking-wider text-[var(--dim)]">PUSH-UP BEST SET</p>
              <p className="mt-1 text-xs text-[var(--dim)]">Goal 20 · stretch 30</p>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="font-[family-name:var(--font-display)] text-xl font-black">{derived.lastBack?.backScore ?? "—"}{derived.lastBack ? <span className="text-sm text-[var(--dim)]">/10</span> : ""}</p>
              <p className="text-[11px] font-bold tracking-wider text-[var(--dim)]">BACK FUNCTION</p>
              <p className="mt-1 text-xs text-[var(--dim)]">{derived.lastBack ? fmtDate(derived.lastBack.date) : "Log a check-in"}</p>
            </div>
          </div>

          {/* WAIST / GUT MODULE — body composition, not weight loss */}
          {(() => {
            const waists = data.health.filter((h) => h.kind === "waist" && h.value !== null);
            const first = waists[0];
            const last = waists[waists.length - 1];
            const delta = first && last && waists.length > 1 ? (last.value ?? 0) - (first.value ?? 0) : null;
            return (
              <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[11px] font-bold tracking-[0.2em] text-[var(--accent)]">THE GUT PROJECT — WAIST TREND</p>
                  <button type="button" className="text-sm font-semibold text-[var(--accent)] underline underline-offset-2" onClick={() => setTab("health")}>
                    {last ? "Log a measurement" : "Measure now"}
                  </button>
                </div>
                {last ? (
                  <p className="mt-2 text-sm text-[var(--dim)]">
                    Waist now <strong className="text-[var(--text)]">{last.value} in</strong>
                    {delta !== null ? <> — <strong className={delta < 0 ? "text-[var(--accent)]" : "text-[var(--text)]"}>{delta > 0 ? "+" : ""}{delta.toFixed(1)} in</strong> since your first measurement. The tape moving down while the lifts move up is the whole rebuild in one sentence.</> : <> — first reading banked. Measure every 2 weeks, same spot (navel), relaxed. A mirror or photo check alongside it is optional, never required.</>}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-[var(--dim)]">
                    This is the scoreboard for the gut — not the scale. Grab a tape, measure at the navel, relaxed, and log it in Health. Every 2 weeks after that. As the core work and body-fat trend do their job, this number is the one that proves it.
                  </p>
                )}
              </div>
            );
          })()}

          {/* STRENGTH STRIP */}
          <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-[11px] font-bold tracking-[0.2em] text-[var(--accent)]">STRENGTH PROGRESSION</p>
            <p className="mt-1.5 text-sm text-[var(--dim)]">
              {derived.prs.length > 0
                ? <>Top lift right now: <strong className="text-[var(--text)]">{derived.prs[0]?.name} — {derived.prs[0]?.maxWeight}</strong> · {derived.prs.length} lift{derived.prs.length > 1 ? "s" : ""} tracked. Full PR board is under the workouts.</>
                : <>No weights on the board yet — the first two workouts were logged without them. The first weight you enter on any set becomes a PR, and this strip becomes your proof of getting stronger.</>}
            </p>
          </div>

          <p className="mt-3 px-1 text-xs text-[var(--dim)]">
            Weight, secondary: 7-day average {avg7Val !== null ? <strong className="text-[var(--text)]">{avg7Val.toFixed(1)} lb</strong> : "—"} (baseline 240{toGoal !== null ? `, ${toGoal.toFixed(1)} lb above the long-term 200 marker` : ""}). It matters — it just doesn't run the show. Full trend in Health.
          </p>
        </section>

        {/* TABS */}
        <nav aria-label="Sections" className="sticky top-0 z-10 mt-5 flex gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1 pt-safe">
          {([
            ["train", "Train"],
            ["health", "Health"],
            ["challenge", "Challenge"],
            ["roadmap", "Roadmap"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key}
              className={`min-h-[48px] flex-1 rounded-xl px-1 py-3 font-[family-name:var(--font-display)] text-[13px] sm:px-2 sm:text-sm font-bold ${tab === key ? "bg-[var(--accent)] text-[var(--accent-ink)]" : "text-[var(--dim)]"}`}>
              {label}
            </button>
          ))}
        </nav>

        {tab === "train" && (
          <section className="mt-5 grid gap-4" aria-label="Training">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionTitle>Workouts</SectionTitle>
              <button type="button" className={btnPrimary} onClick={() => setShowNew(!showNew)} aria-expanded={showNew}>
                {showNew ? "Close" : "+ New workout"}
              </button>
            </div>
            {showNew && <NewWorkoutForm onDone={() => setShowNew(false)} />}
            {planned.length > 0 && (
              <>
                <p className="text-xs font-bold tracking-wider text-[var(--amber)]">UP NEXT</p>
                {planned.map((s) => <SessionCard key={s.id} session={s} />)}
              </>
            )}
            <p className="text-xs font-bold tracking-wider text-[var(--dim)]">COMPLETED — {doneList.length} IN THE BANK</p>
            {doneList.map((s) => <SessionCard key={s.id} session={s} />)}
            {data.sessions.length === 0 && <p className="text-sm text-[var(--dim)]">No workouts yet — add your first one above.</p>}

            <SectionTitle>Strength progression</SectionTitle>
            {derived.prs.length === 0 ? (
              <p className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--dim)]">
                No weights were recorded for the first two workouts, so there are no PRs yet. The first weight you log on any set becomes the number to beat — top weight and total volume per exercise will stack up here.
              </p>
            ) : (
              <div className="grid gap-2">
                {derived.prs.map((p) => (
                  <div key={p.name} className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between">
                    <span className="font-[family-name:var(--font-condensed)] font-bold">{p.name}</span>
                    <span className="text-sm text-[var(--dim)]">top <strong className="text-[var(--accent)]">{p.maxWeight}</strong> · volume {Math.round(p.volume).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "health" && (
          <section className="mt-5 grid gap-4" aria-label="Health tracking">
            <SectionTitle>Weight trend — 7-day average leads</SectionTitle>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--dim)]">
                Daily weight swings 2–6 lb on water and glycogen alone, so the headline number is your 7-day average
                {avg7Val !== null ? <> — currently <strong className="text-[var(--text)]">{avg7Val.toFixed(1)} lb</strong></> : ""}.
                Latest single reading: {derived.latestWeight?.value ?? "—"} lb ({derived.latestWeight ? fmtDate(derived.latestWeight.date) : "—"}).
                First goal: 230 lb. Long-term target: 200 lb. (demo profile)
              </p>
              {derived.chartData.length > 0 ? (
                <div className="mt-3 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={derived.chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fill: "var(--dim)", fontSize: 12 }} />
                      <YAxis domain={["dataMin - 6", "dataMax + 4"]} tick={{ fill: "var(--dim)", fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                      <ReferenceLine y={255} stroke="var(--dim)" strokeDasharray="4 4" label={{ value: "255 ✓", fill: "var(--dim)", fontSize: 11 }} />
                      <ReferenceLine y={220} stroke="var(--amber)" strokeDasharray="4 4" label={{ value: "GOAL 220", fill: "var(--amber)", fontSize: 11 }} />
                      <Line type="monotone" dataKey="weight" name="Reading" stroke="var(--dim)" strokeWidth={1.5} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="avg" name="7-day avg" stroke="var(--accent)" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="mt-2 text-sm text-[var(--dim)]">Log a weight below and the trend chart starts.</p>
              )}
            </div>

            {derived.waistDue && (
              <div className="rounded-2xl border border-[var(--amber)] bg-[var(--surface)] p-4">
                <p className="font-bold text-[var(--amber)]">Waist check is due</p>
                <p className="mt-1 text-sm text-[var(--dim)]">
                  {derived.lastWaist ? `Last waist measurement: ${derived.lastWaist.value} in on ${fmtDate(derived.lastWaist.date)}.` : "No waist measurement logged yet."}{" "}
                  The tape tells the gut story the scale can't — measure at the navel, relaxed, every 2 weeks.
                </p>
              </div>
            )}

            <SectionTitle>Log a measurement</SectionTitle>
            <HealthLogForm />

            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-[11px] font-bold tracking-wider text-[var(--dim)]">RESTING HEART RATE</p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-black">
                  {derived.rhr.length ? `${derived.rhr[derived.rhr.length - 1]?.value} bpm` : "—"}
                </p>
                <p className="text-xs text-[var(--dim)]">{derived.rhr.length ? `Latest ${fmtDate(derived.rhr[derived.rhr.length - 1]?.date ?? "")} · trending down = conditioning up` : "Log it in the morning for the cleanest read."}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-[11px] font-bold tracking-wider text-[var(--dim)]">SLEEP</p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-black">
                  {derived.sleeps.length ? `${(derived.sleeps.reduce((a, s) => a + (s.value ?? 0), 0) / derived.sleeps.length).toFixed(1)} h` : "—"}
                </p>
                <p className="text-xs text-[var(--dim)]">{derived.sleeps.length ? `Average of ${derived.sleeps.length} logged nights` : "Log hours slept — recovery is built at night."}</p>
              </div>
            </div>

            <SectionTitle>Daily check-in</SectionTitle>
            <CheckinForm />
            {data.checkins.length > 0 && (
              <div className="grid gap-2">
                {data.checkins.slice(0, 5).map((c) => (
                  <div key={c.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
                    <span className="font-bold">{fmtDate(c.date)}</span>
                    <span className="text-[var(--dim)]"> · soreness {c.soreness}/10 · energy {c.energy}/10{c.backScore !== null ? ` · back ${c.backScore}/10` : ""}</span>
                    {(c.backFeel || c.note) && <p className="mt-1 text-[var(--dim)]">{[c.backFeel, c.note].filter(Boolean).join(" — ")}</p>}
                  </div>
                ))}
              </div>
            )}

            <SectionTitle>Recent entries</SectionTitle>
            <div className="grid gap-2">
              {[...data.health].reverse().slice(0, 12).map((h: HealthEntry) => (
                <div key={h.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm">
                  <span className="font-bold capitalize">{h.kind === "bp" ? "Blood pressure" : h.kind === "rhr" ? "Resting HR" : h.kind}</span>
                  <span className="text-[var(--dim)]">{fmtDate(h.date)}</span>
                  <span className="ml-auto font-semibold">
                    {h.kind === "bp" ? `${h.systolic}/${h.diastolic}` : `${h.value}${h.kind === "weight" ? " lb" : h.kind === "waist" ? " in" : h.kind === "sleep" ? " h" : h.kind === "protein" ? " g protein" : " bpm"}`}
                  </span>
                  <button type="button" aria-label={`Delete ${h.kind} entry from ${h.date}`} className="px-1 text-base text-[var(--danger)]"
                    onClick={() => deleteHealthMut.mutate(h.id)}>✕</button>
                </div>
              ))}
              {data.health.length === 0 && <p className="text-sm text-[var(--dim)]">Nothing logged yet.</p>}
            </div>

            <SectionTitle>Fuel & recovery</SectionTitle>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-relaxed text-[var(--dim)]">
              <p><strong className="text-[var(--text)]">Protein: 180–200 g/day</strong> — your target range. <strong className="text-[var(--text)]">160 g is the floor</strong> on rough days: clear the floor and the day still counts. Calories are an awareness note only (~2,500/day, tentative) — no calorie counting in here. You're being conscious of food now; the full nutrition dial-in comes later, on your word.</p>
              <p className="mt-2"><strong className="text-[var(--text)]">Front-load the protein.</strong> Get the bulk of it in earlier in the day — late heavy meals are a reflux trigger for you, and protein banked by dinner means a lighter evening.</p>
              <div className="mt-3">
                <p className="text-[11px] font-bold tracking-wider text-[var(--dim)]">PROTEIN HITS — LAST 7 DAYS LOGGED</p>
                {(() => {
                  const proteinDays = data.health.filter((h) => h.kind === "protein" && h.value !== null).slice(-7);
                  if (proteinDays.length === 0)
                    return <p className="mt-1">No protein days logged yet — log your daily total above (Measure → Protein) and each day scores itself: <span className="text-[var(--accent)]">● hit 180+</span> · <span className="text-[var(--amber)]">● floor 160+</span> · <span>● under</span>.</p>;
                  return (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {proteinDays.map((h) => {
                        const v = h.value ?? 0;
                        const cls = v >= 180 ? "bg-[var(--accent)] text-[var(--accent-ink)]" : v >= 160 ? "bg-[var(--amber)] text-black" : "border border-[var(--border)] text-[var(--dim)]";
                        const tag = v >= 180 ? "HIT" : v >= 160 ? "FLOOR" : "UNDER";
                        return (
                          <span key={h.id} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${cls}`}>
                            {fmtDate(h.date)} · {v}g · {tag}
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <p className="mt-2"><strong className="text-[var(--text)]">Steps:</strong> ~5,700/day baseline (Sept 2026). Walking on non-lifting days is the recovery engine — nudge the average up gradually.</p>
              <p className="mt-2"><strong className="text-[var(--text)]">Your notes:</strong> reflux flares with late meals, spicy food, sometimes garlic — keep dinners earlier and milder on training days. No pork except bacon/pepperoni.</p>
              <p className="mt-2"><strong className="text-[var(--text)]">Sleep:</strong> severe sleep apnea is in the picture and CPAP adherence is a work in progress — every night on the mask is recovery in the bank. Steady, no pressure: consistency beats perfection here too.</p>
            </div>
          </section>
        )}

        {tab === "challenge" && (
          <section className="mt-5 grid gap-4" aria-label="Push-up challenge and core track">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-[11px] font-bold tracking-[0.2em] text-[var(--accent)]">ROAD TO 30 · PUSH-UP CHALLENGE</p>
              <div className="mt-2 grid grid-cols-3 gap-3 min-[480px]:flex min-[480px]:items-end min-[480px]:gap-6">
                <div>
                  <p className="font-[family-name:var(--font-display)] text-4xl font-black">{derived.pushBest || "—"}</p>
                  <p className="text-[11px] font-bold tracking-wider text-[var(--dim)]">BEST CLEAN SET (FLOOR)</p>
                </div>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-4xl font-black">{derived.pushTotal}</p>
                  <p className="text-[11px] font-bold tracking-wider text-[var(--dim)]">TOTAL REPS LOGGED</p>
                </div>
                <div>
                  <p className="font-[family-name:var(--font-display)] text-4xl font-black">{data.pushups.length}</p>
                  <p className="text-[11px] font-bold tracking-wider text-[var(--dim)]">SESSIONS LOGGED</p>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-sm"><span>Baseline 8–9 → Goal 20 clean</span><span className="font-bold">{Math.min(100, Math.round(((derived.pushBest || 8) / 20) * 100))}%</span></div>
                <ProgressBar pct={((derived.pushBest || 8) / 20) * 100} />
                <p className="mt-1 text-xs text-[var(--dim)]">Stretch goal after 20: 30 in a row. Form-capped max test every 2–4 weeks only — daily work is never to failure.</p>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-[var(--dim)]">
                <p><strong className="text-[var(--text)]">Monday:</strong> 3×4 floor + 2×8–10 incline · <strong className="text-[var(--text)]">Friday:</strong> 2×4 floor + 2×10–12 incline · ~2 min rests between floor sets, ~2 reps in reserve. Add +1 rep when every set is controlled.</p>
                <p><strong className="text-[var(--text)]">Grease the groove:</strong> on non-gym days, sprinkle small easy sets (3–5 reps, perfect form) through the day. Volume without fatigue — that's how the number climbs.</p>
                <p><strong className="text-[var(--text)]">Heads-up:</strong> push-up days replace overlapping chest-press volume in the gym so pressing work isn't doubled.</p>
              </div>
            </div>

            <SectionTitle>Log today's push-ups</SectionTitle>
            <PushupLogForm />
            {data.pushups.length > 0 && (
              <div className="grid gap-2">
                {data.pushups.slice(0, 6).map((p) => (
                  <div key={p.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
                    <span className="font-bold">{fmtDate(p.date)}</span>
                    <span className="text-[var(--dim)]"> · floor {p.floorReps} · incline {p.inclineReps} · best set {p.maxConsecutive}</span>
                    <button type="button" aria-label={`Delete push-up log from ${p.date}`} className="float-right px-1 text-base text-[var(--danger)]"
                      onClick={() => deletePushupMut.mutate(p.id)}>✕</button>
                    {p.note && <p className="mt-1 text-[var(--dim)]">{p.note}</p>}
                  </div>
                ))}
              </div>
            )}

            <SectionTitle>Core track — gut + back, same work</SectionTitle>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm text-[var(--dim)]">A stronger core braces the back and holds everything in — these two goals are literally the same training. Visible abs come from body-fat coming down plus this work; there's no spot reduction, and that's fine, because this track is also the back medicine.</p>
              <ul className="mt-3 grid gap-2 text-sm">
                <li><strong>Dead Bugs</strong> — 2×6/side · low back glued to the floor</li>
                <li><strong>Bird Dogs</strong> — 2×6/side · reach long, pause (McGill Big 3)</li>
                <li><strong>Side Plank</strong> — short 8–10 sec holds (McGill Big 3)</li>
                <li><strong>Modified Curl-Up</strong> — 8–10 sec holds, hands under low back (McGill Big 3)</li>
                <li><strong>Forearm Plank</strong> — 2×15–20 sec, only if comfortable</li>
              </ul>
              <p className="mt-3 text-sm text-[var(--dim)]">Runs Mon/Fri with push-ups; Wednesday is core stability. Back-history rules: no aggressive twisting, no high-rep sit-ups, no Ab Ripper X early.</p>
            </div>
          </section>
        )}

        {tab === "roadmap" && (
          <section className="mt-5 grid gap-4" aria-label="Program roadmap">
            <SectionTitle>The arc</SectionTitle>
            <div className="grid gap-3">
              {[
                { tag: "NOW · WEEKS 1–2", title: "RAMP", body: "P90X-style, off-script. Warm the body back up, groove the formation, build the habit before the load. Workout #1 lives here.", active: false },
                { tag: "ACTIVE · ~12 WEEKS · ~36 SESSIONS", title: "PHASE 1 — BUILD", body: "3 full-body strength sessions a week, P90X-inspired original gym programming — not the videos stacked on gym work. Your full setup: multi-station machine (leg press, chest press, lat pulldown, pec fly, triceps rope), adjustable bench, dumbbells, treadmill, elliptical, pull-up bar, balls, BOSU. No seated cable row — back rows are chest-supported dumbbell rows at 30–45°.", active: true },
                { tag: "1 WEEK", title: "DELOAD", body: "After BUILD: a lighter week. Same movements, half the volume, let the joints and back consolidate the gains.", active: false },
                { tag: "LATER · 6–8 WEEKS", title: "PHASE 2 — REVEAL", body: "Insanity-inspired conditioning, LOW-IMPACT progression — at higher body weight with a back history, impact is the highest-cost way to buy conditioning you can get without it. Strength stays in 2×/week so the muscle built in Phase 1 stays on while the fat comes off.", active: false },
                { tag: "1 WEEK", title: "DELOAD", body: "After REVEAL: recover, retest (push-up max test lands well here), then load the next phase fresh.", active: false },
                { tag: "LATER", title: "PHASE 3 — REFINE", body: "Alpha Shred-inspired bodybuilding and physique work to top it off — the detail phase on top of the base and the shred.", active: false },
              ].map((p) => (
                <div key={p.title} className={`rounded-2xl border p-4 ${p.active ? "border-[var(--accent)] bg-[var(--surface)]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
                  <p className={`text-[11px] font-bold tracking-[0.2em] ${p.active ? "text-[var(--accent)]" : "text-[var(--dim)]"}`}>{p.tag}</p>
                  <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl font-black">{p.title}</h3>
                  <p className="mt-1 text-sm text-[var(--dim)]">{p.body}</p>
                </div>
              ))}
            </div>

            <SectionTitle>Training principles</SectionTitle>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-relaxed text-[var(--dim)]">
              <ul className="grid list-disc gap-1.5 pl-5">
                <li>Moderate intensity, ~6/10 effort. Rests 60–90 seconds. Leave ~3 clean reps in reserve — progress comes from stacking weeks, not from one heroic session.</li>
                <li>Back first: supported exercises, controlled ranges, no forced lumbar rounding, no heavy unsupported hinges.</li>
                <li>Gym sessions count the same at home, at the work gym, or at lunch — one streak, one counter.</li>
                <li>Sessions run 3×/week, often early morning, sometimes with a training partner — partner sessions count double for morale, same for the log.</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-[var(--amber)] bg-[var(--surface)] p-4">
              <p className="font-bold text-[var(--amber)]">Back safety — read once, remember always</p>
              <p className="mt-1 text-sm text-[var(--dim)]">
                Stop and get evaluated if you feel sharp or radiating pain, new weakness, or numbness. Ordinary muscle soreness and effort are fine; warning signs are not a toughness test. This app tracks your training — it doesn't diagnose anything.
              </p>
            </div>

            <SectionTitle>Your profile</SectionTitle>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--dim)]">
              <p>Demo profile — male, 35 · 6'0" · baseline 240 lb. Emphasis: body composition, stronger chest / shoulders / back / arms / legs, better conditioning. Everything shown is demo data; the live app holds the real log.</p>
            </div>
          </section>
        )}
      </main>

      <footer className="mx-auto w-full max-w-3xl px-3 sm:px-4 pt-8 pb-4 text-center text-xs text-[var(--dim)]">
        One session at a time. The streak bends — it doesn't break.
      </footer>
    </div>
  );
}
