# Project The Rebuild — Fitness Tracker

A personal fitness tracking app built around one idea: **you're building a body, not running a weight-loss program.** The scoreboard leads with training consistency, strength progression, and waist trend — the scale sits underneath as a supporting stat.

Designed for a phased recomposition program (Ramp → Build → Reveal → Refine) with back-safe programming, and built to be logged mid-workout, one thumb, in under five seconds per set.

## Features

- **One-tap New Workout** — a single button at the top starts today's session and serves the next workout in the rotation, fully loaded with exercises, sets, form tips, and YouTube Shorts demo links for every movement
- **Per-set logging** — checkboxes, weight, and actual reps per set; mark the session done and it feeds streaks, consistency, and progression automatically
- **Forgiving streaks** — 2 streak freezes per month plus streak repair, and a weekly consistency % shown at equal weight to the streak (a missed day should never read as total failure)
- **Push-up challenge tracker** — a structured progression (grease-the-groove on off days, never to failure, form-capped tests every few weeks)
- **Core & back track** — McGill Big 3 pattern (modified curl-up, side plank, bird dog) plus dead bugs
- **Health panel** — 7-day-average weight trend (never the noisy daily number), waist check-ins every two weeks, sleep, morning blood pressure, resting heart rate, and a protein target tracker (180–200 g/day, 160 g floor)
- **Copy Workout Log** — one tap exports the session as clean text for sharing with a coach
- **Responsive** — single-column, big tap targets, no horizontal scroll on phones (360–430px); multi-column on tablet/desktop

## Design notes (evidence-based behavior design)

The adherence mechanics are deliberate, drawn from published mHealth and habit research:

- **Process goals over outcome goals** — sessions completed are the headline metric; outcome goals (weight) are far weaker adherence drivers
- **Self-monitoring + a goal** is the active ingredient in fitness apps; everything else is support structure
- **Streak freezes & repair** protect against the "what-the-hell effect," where one miss collapses the whole habit
- **7-day-average weight only** — day-to-day swings of 1–3 kg are water and glycogen, not fat

## Tech stack

- React 19 + TypeScript, Tailwind CSS, Recharts
- Bun runtime, Drizzle ORM over SQLite
- Full-stack hosted app: the server layer exposes typed actions (`getState`, `createSession`, `updateSet`, `addHealthEntry`, streak/consistency logic in `server/src/actions.ts`)
- Mobile-first responsive layout with safe-area handling

## Repository contents

- `client/` — React app (single-page, tabbed: Home / Workouts / Challenge / Health / Roadmap)
- `server/` — action handlers and schema
- `drizzle/` — SQL migrations

Seed data in this repo is **demo data** (sample profile and two sample workouts) so the app can be explored without anyone's real health log.

## Why I built it

Off-the-shelf trackers optimize for weight loss and punish missed days. I wanted a tracker that matches how sustainable training actually works: show up consistently, protect your back, eat enough protein, let the composition change follow. So I built it.

---

Built by Edward Cobbs — IT operations & support engineer moving into cloud and AI. More projects: [github.com/AdePade](https://github.com/AdePade)
