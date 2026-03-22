/**
 * workout-memory.ts
 *
 * Dedicated module for exercise resolution, workout session creation, and
 * session-exercise creation logic. All persistent object memory writes for
 * workouts live here.
 *
 * Phase 1 contract:
 *  - Exact-match only (canonical name → alias → provisional row)
 *  - Memory writes are best-effort: errors are logged but never bubble up to
 *    the client response.
 *  - Sessions are idempotent on (sourceType, sourceId).
 */

import { storage } from "./storage";
import type { WorkoutSessionRecord, WorkoutSessionExerciseRecord, ExerciseRecord, ExercisePerformanceHistoryRecord } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkoutSourceType = "workout_plan" | "daily_workout";

export interface CreateWorkoutSessionParams {
  userId: string;
  sourceType: WorkoutSourceType;
  sourceId: string;
  scheduledDate: string;
  generatedWorkoutJson: any;
}

// Internal representation of a single exercise entry extracted from the AI JSON
interface ExtractedExercise {
  name: string;
  blockType: "warmup" | "main" | "cooldown";
  sequenceOrder: number;
  prescribedSets: number | null;
  prescribedReps: number | null;
  prescribedRepRange: string | null;
  prescribedLoadText: string | null;
  prescribedDurationSeconds: number | null;
  restSeconds: number | null;
}

// ─── Function 1: normalizeExerciseName ───────────────────────────────────────

/**
 * Lowercase, trim, and collapse multiple spaces to a single space.
 * Used for both canonical name and alias matching.
 */
export function normalizeExerciseName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a reps string from AI output into prescribedReps (integer) or
 * prescribedRepRange (string), but not both.
 */
function parseReps(repsStr: string | null | undefined): {
  prescribedReps: number | null;
  prescribedRepRange: string | null;
} {
  if (!repsStr) return { prescribedReps: null, prescribedRepRange: null };
  const s = repsStr.trim();
  if (/^\d+$/.test(s)) {
    return { prescribedReps: parseInt(s, 10), prescribedRepRange: null };
  }
  // Range like "8-12" or "8–12" (en-dash)
  if (/^\d+[\-–]\d+$/.test(s)) {
    return { prescribedReps: null, prescribedRepRange: s };
  }
  // Any other string (e.g. "10 each side") → store as range text
  return { prescribedReps: null, prescribedRepRange: s };
}

/**
 * Parse a time string like "30 seconds", "5 minutes", "1:30" to seconds.
 * Returns null if the format is not recognized.
 */
function parseTimeToSeconds(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const lower = timeStr.toLowerCase().trim();

  const secMatch = lower.match(/^(\d+(?:\.\d+)?)\s*(?:sec(?:onds?)?|s)$/);
  if (secMatch) return Math.round(parseFloat(secMatch[1]));

  const minMatch = lower.match(/^(\d+(?:\.\d+)?)\s*(?:min(?:utes?)?|m)$/);
  if (minMatch) return Math.round(parseFloat(minMatch[1]) * 60);

  const colonMatch = lower.match(/^(\d+):(\d{2})$/);
  if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);

  return null;
}

/**
 * Extract all exercises from the AI-generated workout JSON, flattening warmup,
 * main, finisher, and cooldown blocks into a single ordered list.
 *
 * Accepts:
 *   - WorkoutSession  (daily workout planJson)
 *   - WorkoutPlanOutput  (wellness plan planJson — picks first workout day)
 *   - WorkoutDay  (single day from a wellness plan)
 */
function extractExercises(generatedWorkoutJson: any): {
  sessionTitle: string | null;
  trainingMode: string | null;
  plannedDurationMinutes: number | null;
  exercises: ExtractedExercise[];
} {
  let session: any = null;
  let sessionTitle: string | null = null;

  // WorkoutPlanOutput: has a `days` array
  if (Array.isArray(generatedWorkoutJson?.days)) {
    const plan = generatedWorkoutJson;
    sessionTitle = plan.title ?? null;
    const firstWorkoutDay = plan.days.find(
      (d: any) => d.isWorkoutDay && d.session != null,
    );
    session = firstWorkoutDay?.session ?? null;
    if (!session && plan.days.length > 0) {
      // Fallback: first day even if not a workout day
      session = plan.days[0]?.session ?? null;
    }
  }
  // WorkoutDay: has a `session` field (not a `days` array)
  else if (generatedWorkoutJson?.session !== undefined) {
    session = generatedWorkoutJson.session;
    sessionTitle = generatedWorkoutJson.dayName ?? null;
  }
  // WorkoutSession directly: has `main` array
  else if (Array.isArray(generatedWorkoutJson?.main)) {
    session = generatedWorkoutJson;
  }

  if (!session) {
    return { sessionTitle, trainingMode: null, plannedDurationMinutes: null, exercises: [] };
  }

  const trainingMode: string | null = session.mode ?? null;
  const plannedDurationMinutes: number | null =
    session.durationMinutes ?? session.totalEstimatedMinutes ?? null;

  if (!sessionTitle) {
    sessionTitle = session.focus ?? session.title ?? null;
  }

  const extracted: ExtractedExercise[] = [];
  let seq = 0;

  // Warmup — string array
  if (Array.isArray(session.warmup)) {
    for (const item of session.warmup) {
      if (typeof item === "string" && item.trim()) {
        extracted.push({
          name: item.trim(),
          blockType: "warmup",
          sequenceOrder: seq++,
          prescribedSets: null,
          prescribedReps: null,
          prescribedRepRange: null,
          prescribedLoadText: null,
          prescribedDurationSeconds: null,
          restSeconds: null,
        });
      }
    }
  }

  // Main — WorkoutExercise array (objects with name, sets, reps, time, etc.)
  if (Array.isArray(session.main)) {
    for (const ex of session.main) {
      if (!ex?.name) continue;
      const { prescribedReps, prescribedRepRange } = parseReps(ex.reps);
      extracted.push({
        name: String(ex.name).trim(),
        blockType: "main",
        sequenceOrder: seq++,
        prescribedSets: ex.sets != null ? Number(ex.sets) || null : null,
        prescribedReps,
        prescribedRepRange,
        prescribedLoadText: ex.load ?? ex.loadText ?? null,
        prescribedDurationSeconds: parseTimeToSeconds(ex.time),
        restSeconds: ex.restSeconds != null ? Number(ex.restSeconds) || null : null,
      });
    }
  }

  // Finisher — optional string array, treated as main block
  if (Array.isArray(session.finisher)) {
    for (const item of session.finisher) {
      if (typeof item === "string" && item.trim()) {
        extracted.push({
          name: item.trim(),
          blockType: "main",
          sequenceOrder: seq++,
          prescribedSets: null,
          prescribedReps: null,
          prescribedRepRange: null,
          prescribedLoadText: null,
          prescribedDurationSeconds: null,
          restSeconds: null,
        });
      }
    }
  }

  // Cooldown — string array
  if (Array.isArray(session.cooldown)) {
    for (const item of session.cooldown) {
      if (typeof item === "string" && item.trim()) {
        extracted.push({
          name: item.trim(),
          blockType: "cooldown",
          sequenceOrder: seq++,
          prescribedSets: null,
          prescribedReps: null,
          prescribedRepRange: null,
          prescribedLoadText: null,
          prescribedDurationSeconds: null,
          restSeconds: null,
        });
      }
    }
  }

  return { sessionTitle, trainingMode, plannedDurationMinutes, exercises: extracted };
}

// ─── Function 2: resolveExercise ─────────────────────────────────────────────

/**
 * Resolve an AI-provided exercise name to a canonical Exercise record.
 *
 * Step 1: exact match on exercises.normalizedCanonicalName
 * Step 2: exact match on exercise_aliases.normalizedAliasText → canonical exercise
 * Step 3: create a provisional exercise row (reviewStatus: 'provisional',
 *         createdBySource: 'ai_proposed')
 *
 * A false positive match is worse than a provisional row — exact match only.
 */
export async function resolveExercise(exerciseName: string): Promise<ExerciseRecord> {
  const normalized = normalizeExerciseName(exerciseName);

  // Step 1 — canonical name exact match
  const byCanonical = await storage.getExerciseByNormalizedName(normalized);
  if (byCanonical) return byCanonical;

  // Step 2 — alias exact match
  const byAlias = await storage.getExerciseByAliasNormalizedText(normalized);
  if (byAlias) return byAlias;

  // Step 3 — create provisional exercise row
  try {
    return await storage.createExercise({
      canonicalName: exerciseName,
      displayName: exerciseName,
      normalizedCanonicalName: normalized,
      category: "strength",
      reviewStatus: "provisional",
      createdBySource: "ai_proposed",
      primaryMuscleGroups: [],
      secondaryMuscleGroups: [],
      trainingModes: [],
      isBilateral: false,
      isUnilateral: false,
      repTrackingMode: "reps",
    });
  } catch (insertErr: any) {
    // Race condition: another concurrent request already inserted this exercise.
    // Re-query to return the existing row.
    const retried = await storage.getExerciseByNormalizedName(normalized);
    if (retried) return retried;
    throw insertErr;
  }
}

// ─── Function 3: createWorkoutSessionFromGeneration ──────────────────────────

/**
 * Create a workout_sessions row and its child workout_session_exercises rows
 * from an AI-generated workout JSON payload.
 *
 * Idempotent: if a session already exists for (sourceType, sourceId) it is
 * returned immediately without any additional writes.
 *
 * Only call AFTER the source record has reached status 'ready'.
 */
export async function createWorkoutSessionFromGeneration(
  params: CreateWorkoutSessionParams,
): Promise<WorkoutSessionRecord> {
  const { userId, sourceType, sourceId, scheduledDate, generatedWorkoutJson } = params;

  // ── 1. Idempotency check ──────────────────────────────────────────────────
  const existing = await storage.getWorkoutSessionBySource(sourceType, sourceId);
  if (existing) {
    return existing;
  }

  // ── 2. Parse the generated JSON ───────────────────────────────────────────
  const { sessionTitle, trainingMode, plannedDurationMinutes, exercises } =
    extractExercises(generatedWorkoutJson);

  // ── 3. Create the workout_sessions row ────────────────────────────────────
  const session = await storage.createWorkoutSession({
    userId,
    sourceType,
    sourceId,
    scheduledDate,
    sessionTitle,
    trainingMode,
    plannedDurationMinutes,
    status: "planned",
  });

  // ── 4. Resolve each exercise and create workout_session_exercises rows ────
  for (const ex of exercises) {
    let exerciseRecord: ExerciseRecord;
    try {
      exerciseRecord = await resolveExercise(ex.name);
    } catch (resolveErr) {
      console.error(
        `[workout-memory] resolveExercise failed for "${ex.name}":`,
        resolveErr,
      );
      continue; // Skip this exercise but continue with the rest
    }

    try {
      await storage.createWorkoutSessionExercise({
        workoutSessionId: session.id,
        exerciseId: exerciseRecord.id,
        exerciseAliasUsed: ex.name,
        sequenceOrder: ex.sequenceOrder,
        blockType: ex.blockType,
        prescribedSets: ex.prescribedSets,
        prescribedReps: ex.prescribedReps,
        prescribedRepRange: ex.prescribedRepRange,
        prescribedLoadText: ex.prescribedLoadText,
        prescribedDurationSeconds: ex.prescribedDurationSeconds,
        restSeconds: ex.restSeconds,
        completionStatus: null,
      });
    } catch (exerciseWriteErr) {
      console.error(
        `[workout-memory] createWorkoutSessionExercise failed for exercise "${ex.name}" (seq ${ex.sequenceOrder}):`,
        exerciseWriteErr,
      );
      // Continue — partial session data is better than no session data
    }
  }

  return session;
}

// ─── Function 4: getRecentExerciseHistory ────────────────────────────────────

/**
 * Retrieve the most recent performance history records for a given user and
 * exercise. Ordered by performedDate DESC.
 *
 * Infrastructure for Phase 1.5 — not yet consumed by AI generation.
 */
export async function getRecentExerciseHistory(
  userId: string,
  exerciseId: string,
  limit: number,
): Promise<ExercisePerformanceHistoryRecord[]> {
  return storage.getRecentExerciseHistory(userId, exerciseId, limit);
}
