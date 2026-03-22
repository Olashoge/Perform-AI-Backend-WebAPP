/**
 * Idempotent exercise seed script.
 *
 * Usage:
 *   npx tsx scripts/seed-exercises.ts
 *
 * Requires DATABASE_URL to be set in the environment.
 *
 * Behaviour:
 *   - Upserts each exercise by normalizedCanonicalName (safe to re-run).
 *   - For each alias on an exercise, inserts into exercise_aliases only if
 *     the (exerciseId, normalizedAliasText) pair does not already exist.
 *   - Logs progress and a final summary to stdout.
 *   - Exits 0 on success, 1 on error.
 */

import { eq, and } from "drizzle-orm";
import { db, pool } from "../server/db";
import { exercises as exercisesTable, exerciseAliases } from "../shared/schema";
import { exercises as seedData } from "./seed-data/exercises";

async function main() {
  if (seedData.length === 0) {
    console.log("No exercises in seed data — nothing to do.");
    return;
  }

  console.log(`Seeding ${seedData.length} exercises...`);

  let upserted = 0;
  let aliasesInserted = 0;
  let aliasesSkipped = 0;

  for (const item of seedData) {
    const { aliases = [], ...exerciseFields } = item;

    // Upsert exercise by normalizedCanonicalName
    const [row] = await db
      .insert(exercisesTable)
      .values(exerciseFields)
      .onConflictDoUpdate({
        target: exercisesTable.normalizedCanonicalName,
        set: {
          canonicalName: exerciseFields.canonicalName,
          displayName: exerciseFields.displayName,
          category: exerciseFields.category,
          movementPattern: exerciseFields.movementPattern,
          primaryMuscleGroups: exerciseFields.primaryMuscleGroups,
          secondaryMuscleGroups: exerciseFields.secondaryMuscleGroups,
          equipmentType: exerciseFields.equipmentType,
          repTrackingMode: exerciseFields.repTrackingMode,
          isBilateral: exerciseFields.isBilateral,
          isUnilateral: exerciseFields.isUnilateral,
          difficultyLevel: exerciseFields.difficultyLevel,
          instructionsShort: exerciseFields.instructionsShort,
          reviewStatus: exerciseFields.reviewStatus,
          createdBySource: exerciseFields.createdBySource,
          updatedAt: new Date(),
        },
      })
      .returning({ id: exercisesTable.id });

    upserted++;
    console.log(`  [${upserted}/${seedData.length}] ${exerciseFields.canonicalName}`);

    if (!aliases.length) continue;

    // Seed aliases for this exercise
    for (const alias of aliases) {
      const existing = await db
        .select({ id: exerciseAliases.id })
        .from(exerciseAliases)
        .where(
          and(
            eq(exerciseAliases.exerciseId, row.id),
            eq(exerciseAliases.normalizedAliasText, alias.normalizedAliasText)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        aliasesSkipped++;
        continue;
      }

      await db.insert(exerciseAliases).values({
        exerciseId: row.id,
        aliasText: alias.aliasText,
        normalizedAliasText: alias.normalizedAliasText,
        source: alias.source ?? "curated",
        isPreferred: alias.isPreferred ?? false,
      });
      aliasesInserted++;
    }
  }

  console.log("\nDone.");
  console.log(`  Exercises upserted : ${upserted}`);
  console.log(`  Aliases inserted   : ${aliasesInserted}`);
  console.log(`  Aliases skipped    : ${aliasesSkipped}`);
}

main()
  .then(() => {
    pool.end();
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    pool.end();
    process.exit(1);
  });
