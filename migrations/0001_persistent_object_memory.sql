-- Migration: 0001_persistent_object_memory
-- Phase 1 Persistent Object Memory Tables
-- All new tables. No existing tables modified.

-- ── TABLE 1: exercises ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "exercises" (
  "id"                       varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "canonical_name"           text NOT NULL,
  "display_name"             text NOT NULL,
  "normalized_canonical_name" text NOT NULL,
  "category"                 text NOT NULL,
  "movement_pattern"         text,
  "primary_muscle_groups"    jsonb NOT NULL DEFAULT '[]',
  "secondary_muscle_groups"  jsonb NOT NULL DEFAULT '[]',
  "equipment_type"           text,
  "training_modes"           jsonb NOT NULL DEFAULT '[]',
  "is_bilateral"             boolean NOT NULL DEFAULT false,
  "is_unilateral"            boolean NOT NULL DEFAULT false,
  "rep_tracking_mode"        text NOT NULL DEFAULT 'reps',
  "difficulty_level"         text,
  "instructions_short"       text,
  "created_by_source"        text NOT NULL DEFAULT 'curated',
  "review_status"            text NOT NULL DEFAULT 'approved',
  "created_at"               timestamp NOT NULL DEFAULT now(),
  "updated_at"               timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "exercises_normalized_canonical_name_idx"
  ON "exercises" ("normalized_canonical_name");
CREATE INDEX IF NOT EXISTS "exercises_category_idx"
  ON "exercises" ("category");
CREATE INDEX IF NOT EXISTS "exercises_movement_pattern_idx"
  ON "exercises" ("movement_pattern");
CREATE INDEX IF NOT EXISTS "exercises_equipment_type_idx"
  ON "exercises" ("equipment_type");
CREATE INDEX IF NOT EXISTS "exercises_review_status_idx"
  ON "exercises" ("review_status");

-- ── TABLE 2: exercise_aliases ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "exercise_aliases" (
  "id"                    varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exercise_id"           varchar NOT NULL,
  "alias_text"            text NOT NULL,
  "normalized_alias_text" text NOT NULL,
  "source"                text NOT NULL DEFAULT 'curated',
  "confidence"            real,
  "is_preferred"          boolean NOT NULL DEFAULT false,
  "created_at"            timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "exercise_aliases_exercise_id_fk"
    FOREIGN KEY ("exercise_id") REFERENCES "exercises" ("id")
);

-- No unique constraint on normalized_alias_text — duplicates allowed in Phase 1
CREATE INDEX IF NOT EXISTS "exercise_aliases_exercise_id_idx"
  ON "exercise_aliases" ("exercise_id");
CREATE INDEX IF NOT EXISTS "exercise_aliases_normalized_alias_text_idx"
  ON "exercise_aliases" ("normalized_alias_text");
CREATE INDEX IF NOT EXISTS "exercise_aliases_source_idx"
  ON "exercise_aliases" ("source");

-- ── TABLE 3: workout_sessions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "workout_sessions" (
  "id"                       varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"                  varchar NOT NULL,
  "source_type"              text NOT NULL,
  "source_id"                text,
  "scheduled_date"           varchar(10) NOT NULL,
  "started_at"               timestamp,
  "completed_at"             timestamp,
  "status"                   text NOT NULL DEFAULT 'planned',
  "session_title"            text,
  "training_mode"            text,
  "focus_areas"              jsonb NOT NULL DEFAULT '[]',
  "planned_duration_minutes" integer,
  "actual_duration_minutes"  integer,
  "notes"                    text,
  "plan_context_snapshot"    jsonb,
  "created_at"               timestamp NOT NULL DEFAULT now(),
  "updated_at"               timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workout_sessions_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
);

CREATE INDEX IF NOT EXISTS "workout_sessions_user_date_idx"
  ON "workout_sessions" ("user_id", "scheduled_date");
CREATE INDEX IF NOT EXISTS "workout_sessions_user_status_idx"
  ON "workout_sessions" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "workout_sessions_source_idx"
  ON "workout_sessions" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "workout_sessions_scheduled_date_idx"
  ON "workout_sessions" ("scheduled_date");

-- ── TABLE 4: workout_session_exercises ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "workout_session_exercises" (
  "id"                          varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workout_session_id"          varchar NOT NULL,
  "exercise_id"                 varchar NOT NULL,
  "exercise_alias_used"         text,
  "sequence_order"              integer NOT NULL,
  "block_type"                  text,
  "prescribed_sets"             integer,
  "prescribed_reps"             integer,
  "prescribed_rep_range"        text,
  "prescribed_load_text"        text,
  "prescribed_duration_seconds" integer,
  "prescribed_distance"         real,
  "rest_seconds"                integer,
  "tempo_text"                  text,
  "rpe_target"                  real,
  "performed_sets"              jsonb,
  "completion_status"           text,
  "notes"                       text,
  "created_at"                  timestamp NOT NULL DEFAULT now(),
  "updated_at"                  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "workout_session_exercises_session_id_fk"
    FOREIGN KEY ("workout_session_id") REFERENCES "workout_sessions" ("id"),
  CONSTRAINT "workout_session_exercises_exercise_id_fk"
    FOREIGN KEY ("exercise_id") REFERENCES "exercises" ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workout_session_exercises_session_order_idx"
  ON "workout_session_exercises" ("workout_session_id", "sequence_order");
CREATE INDEX IF NOT EXISTS "workout_session_exercises_session_id_idx"
  ON "workout_session_exercises" ("workout_session_id");
CREATE INDEX IF NOT EXISTS "workout_session_exercises_exercise_id_idx"
  ON "workout_session_exercises" ("exercise_id");
CREATE INDEX IF NOT EXISTS "workout_session_exercises_exercise_created_idx"
  ON "workout_session_exercises" ("exercise_id", "created_at");

-- ── TABLE 5: exercise_performance_history ─────────────────────────────────────
-- Append-only derived table. No unique constraints.
CREATE TABLE IF NOT EXISTS "exercise_performance_history" (
  "id"                          varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"                     varchar NOT NULL,
  "exercise_id"                 varchar NOT NULL,
  "workout_session_id"          varchar,
  "workout_session_exercise_id" varchar,
  "performed_date"              varchar(10) NOT NULL,
  "set_count"                   integer,
  "rep_summary"                 text,
  "best_weight"                 real,
  "total_volume"                real,
  "best_duration_seconds"       integer,
  "best_distance"               real,
  "rpe_observed"                real,
  "performance_notes"           text,
  "progression_signal"          text,
  "created_at"                  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "exercise_perf_history_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id"),
  CONSTRAINT "exercise_perf_history_exercise_id_fk"
    FOREIGN KEY ("exercise_id") REFERENCES "exercises" ("id"),
  CONSTRAINT "exercise_perf_history_session_id_fk"
    FOREIGN KEY ("workout_session_id") REFERENCES "workout_sessions" ("id"),
  CONSTRAINT "exercise_perf_history_session_exercise_id_fk"
    FOREIGN KEY ("workout_session_exercise_id") REFERENCES "workout_session_exercises" ("id")
);

-- No unique constraints — append-only history table
CREATE INDEX IF NOT EXISTS "exercise_perf_history_user_exercise_date_idx"
  ON "exercise_performance_history" ("user_id", "exercise_id", "performed_date" DESC);
CREATE INDEX IF NOT EXISTS "exercise_perf_history_session_exercise_id_idx"
  ON "exercise_performance_history" ("workout_session_exercise_id");
CREATE INDEX IF NOT EXISTS "exercise_perf_history_progression_signal_idx"
  ON "exercise_performance_history" ("progression_signal");

-- ── TABLE 6: meals ────────────────────────────────────────────────────────────
-- Table name is exactly "meals" — not "canonical_meals" or any other variation.
CREATE TABLE IF NOT EXISTS "meals" (
  "id"                      varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "canonical_name"          text NOT NULL,
  "display_name"            text NOT NULL,
  "normalized_canonical_name" text NOT NULL,
  "meal_type"               text,
  "cuisine_type"            text,
  "diet_styles"             jsonb NOT NULL DEFAULT '[]',
  "protein_grams"           real,
  "carbs_grams"             real,
  "fat_grams"               real,
  "calories"                real,
  "ingredient_fingerprint"  text,
  "ingredient_summary"      jsonb NOT NULL DEFAULT '[]',
  "prep_style"              text,
  "estimated_prep_minutes"  integer,
  "spice_level"             text,
  "budget_mode"             text,
  "created_by_source"       text NOT NULL DEFAULT 'ai_generated',
  "review_status"           text NOT NULL DEFAULT 'provisional',
  "created_at"              timestamp NOT NULL DEFAULT now(),
  "updated_at"              timestamp NOT NULL DEFAULT now()
);

-- No unique constraint on normalized_canonical_name in Phase 1
CREATE INDEX IF NOT EXISTS "meals_meal_type_idx"
  ON "meals" ("meal_type");
CREATE INDEX IF NOT EXISTS "meals_cuisine_type_idx"
  ON "meals" ("cuisine_type");
CREATE INDEX IF NOT EXISTS "meals_review_status_idx"
  ON "meals" ("review_status");
CREATE INDEX IF NOT EXISTS "meals_ingredient_fingerprint_idx"
  ON "meals" ("ingredient_fingerprint");

-- ── TABLE 7: meal_aliases ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "meal_aliases" (
  "id"                    varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "meal_id"               varchar NOT NULL,
  "alias_text"            text NOT NULL,
  "normalized_alias_text" text NOT NULL,
  "source"                text NOT NULL DEFAULT 'ai_inferred',
  "confidence"            real,
  "created_at"            timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "meal_aliases_meal_id_fk"
    FOREIGN KEY ("meal_id") REFERENCES "meals" ("id")
);

-- No unique constraint on normalized_alias_text — duplicates allowed in Phase 1
CREATE INDEX IF NOT EXISTS "meal_aliases_meal_id_idx"
  ON "meal_aliases" ("meal_id");
CREATE INDEX IF NOT EXISTS "meal_aliases_normalized_alias_text_idx"
  ON "meal_aliases" ("normalized_alias_text");

-- ── TABLE 8: meal_instances ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "meal_instances" (
  "id"                   varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"              varchar NOT NULL,
  "meal_id"              varchar NOT NULL,
  "source_type"          text NOT NULL,
  "source_id"            text,
  "scheduled_date"       varchar(10) NOT NULL,
  "meal_slot"            text,
  "status"               text NOT NULL DEFAULT 'planned',
  "display_name_at_time" text,
  "macro_snapshot"       jsonb,
  "ingredient_snapshot"  jsonb,
  "notes"                text,
  "created_at"           timestamp NOT NULL DEFAULT now(),
  "updated_at"           timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "meal_instances_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id"),
  CONSTRAINT "meal_instances_meal_id_fk"
    FOREIGN KEY ("meal_id") REFERENCES "meals" ("id")
);

CREATE INDEX IF NOT EXISTS "meal_instances_user_date_idx"
  ON "meal_instances" ("user_id", "scheduled_date");
CREATE INDEX IF NOT EXISTS "meal_instances_user_meal_date_idx"
  ON "meal_instances" ("user_id", "meal_id", "scheduled_date" DESC);
CREATE INDEX IF NOT EXISTS "meal_instances_source_idx"
  ON "meal_instances" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "meal_instances_meal_slot_idx"
  ON "meal_instances" ("meal_slot");

-- ── TABLE 9: meal_history ─────────────────────────────────────────────────────
-- Append-only event table. No unique constraints.
CREATE TABLE IF NOT EXISTS "meal_history" (
  "id"               varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"          varchar NOT NULL,
  "meal_id"          varchar NOT NULL,
  "meal_instance_id" varchar,
  "used_date"        varchar(10) NOT NULL,
  "interaction_type" text NOT NULL,
  "feedback_score"   real,
  "notes"            text,
  "created_at"       timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "meal_history_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id"),
  CONSTRAINT "meal_history_meal_id_fk"
    FOREIGN KEY ("meal_id") REFERENCES "meals" ("id"),
  CONSTRAINT "meal_history_meal_instance_id_fk"
    FOREIGN KEY ("meal_instance_id") REFERENCES "meal_instances" ("id")
);

-- No unique constraints — append-only event table
CREATE INDEX IF NOT EXISTS "meal_history_user_meal_date_idx"
  ON "meal_history" ("user_id", "meal_id", "used_date" DESC);
CREATE INDEX IF NOT EXISTS "meal_history_interaction_type_idx"
  ON "meal_history" ("interaction_type");
CREATE INDEX IF NOT EXISTS "meal_history_meal_instance_id_idx"
  ON "meal_history" ("meal_instance_id");
