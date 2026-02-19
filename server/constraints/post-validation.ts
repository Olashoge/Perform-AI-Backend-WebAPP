import type { SafeSpec, Violation } from "./types";
import type { PlanOutput, WorkoutPlanOutput } from "@shared/schema";

export interface PostValidationResult {
  violations: Violation[];
  fixedPlan: any | null;
  needsRegen: boolean;
}

function normalizeText(text: string): string {
  return text.toLowerCase().trim();
}

export function postValidateMealPlan(
  plan: PlanOutput,
  safeSpec: SafeSpec
): PostValidationResult {
  const violations: Violation[] = [];
  let fixedPlan: PlanOutput | null = null;
  let needsRegen = false;
  let madeChanges = false;

  const bannedFoodsLower = safeSpec.bannedFoods.map(normalizeText);
  const bannedIngredientsLower = safeSpec.bannedIngredients.map(normalizeText);
  const allBanned = Array.from(new Set([...bannedFoodsLower, ...bannedIngredientsLower]));

  if (allBanned.length === 0) {
    return { violations, fixedPlan: null, needsRegen: false };
  }

  const planCopy = JSON.parse(JSON.stringify(plan)) as PlanOutput;
  let foundBannedCount = 0;

  for (const day of planCopy.days) {
    const mealTypes = ["breakfast", "lunch", "dinner"] as const;
    for (const mealType of mealTypes) {
      const meal = day.meals[mealType];
      if (!meal) continue;

      const badIngredients = meal.ingredients.filter(ing => {
        const ingLower = normalizeText(ing);
        return allBanned.some(banned => ingLower.includes(banned));
      });

      if (badIngredients.length > 0) {
        foundBannedCount += badIngredients.length;
        violations.push({
          ruleKey: "POST_BANNED_FOOD_FOUND",
          category: "NUTRITION",
          severity: "ADJUST",
          message: `Day ${day.dayIndex} ${mealType}: found banned ingredient(s) — ${badIngredients.join(", ")}`,
          metadata: { dayIndex: day.dayIndex, mealType, badIngredients },
        });

        meal.ingredients = meal.ingredients.filter(ing => {
          const ingLower = normalizeText(ing);
          return !allBanned.some(banned => ingLower.includes(banned));
        });
        madeChanges = true;
      }
    }
  }

  if (foundBannedCount > 5) {
    needsRegen = true;
  }

  return {
    violations,
    fixedPlan: madeChanges ? planCopy : null,
    needsRegen,
  };
}

export function postValidateWorkoutPlan(
  plan: WorkoutPlanOutput,
  safeSpec: SafeSpec
): PostValidationResult {
  const violations: Violation[] = [];
  let fixedPlan: WorkoutPlanOutput | null = null;
  let needsRegen = false;
  let madeChanges = false;

  const bannedExercisesLower = safeSpec.bannedExercisesExact.map(normalizeText);

  if (bannedExercisesLower.length === 0 && safeSpec.bannedExerciseTags.length === 0) {
    return { violations, fixedPlan: null, needsRegen: false };
  }

  const planCopy = JSON.parse(JSON.stringify(plan)) as WorkoutPlanOutput;
  let foundBannedCount = 0;

  for (const day of planCopy.days) {
    if (!day.session || !day.isWorkoutDay) continue;

    const bannedInMain = day.session.main.filter(ex => {
      const nameLower = normalizeText(ex.name);
      return bannedExercisesLower.some(banned => nameLower.includes(banned) || banned.includes(nameLower));
    });

    if (bannedInMain.length > 0) {
      foundBannedCount += bannedInMain.length;
      for (const banned of bannedInMain) {
        violations.push({
          ruleKey: "POST_BANNED_EXERCISE_FOUND",
          category: "INJURY",
          severity: "ADJUST",
          message: `Day ${day.dayIndex}: found restricted exercise "${banned.name}"`,
          metadata: { dayIndex: day.dayIndex, exercise: banned.name },
        });
      }

      day.session.main = day.session.main.filter(ex => {
        const nameLower = normalizeText(ex.name);
        return !bannedExercisesLower.some(banned => nameLower.includes(banned) || banned.includes(nameLower));
      });
      madeChanges = true;
    }

    const bannedWarmups = day.session.warmup.filter(w => {
      const wLower = normalizeText(w);
      return bannedExercisesLower.some(banned => wLower.includes(banned));
    });
    if (bannedWarmups.length > 0) {
      day.session.warmup = day.session.warmup.filter(w => {
        const wLower = normalizeText(w);
        return !bannedExercisesLower.some(banned => wLower.includes(banned));
      });
      madeChanges = true;
    }

    const finisher = day.session.finisher || [];
    const bannedFinishers = finisher.filter(f => {
      const fLower = normalizeText(f);
      return bannedExercisesLower.some(banned => fLower.includes(banned));
    });
    if (bannedFinishers.length > 0) {
      day.session.finisher = finisher.filter(f => {
        const fLower = normalizeText(f);
        return !bannedExercisesLower.some(banned => fLower.includes(banned));
      });
      madeChanges = true;
    }
  }

  if (foundBannedCount > 5) {
    needsRegen = true;
  }

  return {
    violations,
    fixedPlan: madeChanges ? planCopy : null,
    needsRegen,
  };
}
