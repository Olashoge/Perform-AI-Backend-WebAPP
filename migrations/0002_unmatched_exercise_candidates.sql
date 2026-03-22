-- Migration: 0002_unmatched_exercise_candidates
-- Adds unmatched_exercise_candidates table.
-- Append-only review queue for AI-generated exercise names that could not be
-- matched to the canonical exercise library. No existing tables modified.

CREATE TABLE IF NOT EXISTS "unmatched_exercise_candidates" (
  "id"               varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"          varchar NOT NULL,
  "source_type"      text NOT NULL,
  "source_id"        text NOT NULL,
  "scheduled_date"   varchar(10) NOT NULL,
  "block_type"       text NOT NULL,
  "raw_name"         text NOT NULL,
  "normalized_name"  text NOT NULL,
  "occurrence_count" integer NOT NULL DEFAULT 1,
  "created_at"       timestamp NOT NULL DEFAULT now(),
  "updated_at"       timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "unmatched_exercise_candidates_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
);

-- No unique constraints — append-only review table
CREATE INDEX IF NOT EXISTS "unmatched_exercise_candidates_normalized_name_idx"
  ON "unmatched_exercise_candidates" ("normalized_name");
CREATE INDEX IF NOT EXISTS "unmatched_exercise_candidates_user_id_idx"
  ON "unmatched_exercise_candidates" ("user_id");
CREATE INDEX IF NOT EXISTS "unmatched_exercise_candidates_source_idx"
  ON "unmatched_exercise_candidates" ("source_type", "source_id");
CREATE INDEX IF NOT EXISTS "unmatched_exercise_candidates_block_type_idx"
  ON "unmatched_exercise_candidates" ("block_type");
CREATE INDEX IF NOT EXISTS "unmatched_exercise_candidates_created_at_idx"
  ON "unmatched_exercise_candidates" ("created_at");
