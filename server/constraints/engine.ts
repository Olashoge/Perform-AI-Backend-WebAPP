import type { RuleContext, ConstraintResult, SafeSpec, Violation } from "./types";
import { getDefaultSafeSpec } from "./types";
import { evaluateAgeRules } from "./rules/age";
import { evaluateInjuryRules } from "./rules/injury";
import { evaluateEquipmentRules } from "./rules/equipment";
import { evaluateNutritionRules } from "./rules/nutrition";
import { evaluateScheduleRules } from "./rules/schedule";

function deepMergeSafeSpec(base: SafeSpec, patch: Partial<SafeSpec>): SafeSpec {
  const result = { ...base };

  if (patch.ageTier) result.ageTier = patch.ageTier;

  if (patch.bannedFoods) {
    result.bannedFoods = Array.from(new Set([...result.bannedFoods, ...patch.bannedFoods]));
  }
  if (patch.bannedIngredients) {
    result.bannedIngredients = Array.from(new Set([...result.bannedIngredients, ...patch.bannedIngredients]));
  }
  if (patch.bannedExerciseTags) {
    result.bannedExerciseTags = Array.from(new Set([...result.bannedExerciseTags, ...patch.bannedExerciseTags]));
  }
  if (patch.bannedExercisesExact) {
    result.bannedExercisesExact = Array.from(new Set([...result.bannedExercisesExact, ...patch.bannedExercisesExact]));
  }
  if (patch.allowedEquipment) {
    result.allowedEquipment = patch.allowedEquipment;
  }
  if (patch.equipmentRestriction) {
    result.equipmentRestriction = patch.equipmentRestriction;
  }

  if (patch.nutritionBounds) {
    result.nutritionBounds = {
      ...result.nutritionBounds,
      ...patch.nutritionBounds,
      calorieDeficitMaxPercent: Math.min(
        result.nutritionBounds.calorieDeficitMaxPercent,
        patch.nutritionBounds.calorieDeficitMaxPercent ?? result.nutritionBounds.calorieDeficitMaxPercent
      ),
      calorieDeficitMaxKcal: Math.min(
        result.nutritionBounds.calorieDeficitMaxKcal,
        patch.nutritionBounds.calorieDeficitMaxKcal ?? result.nutritionBounds.calorieDeficitMaxKcal
      ),
      minDailyCalories: Math.max(
        result.nutritionBounds.minDailyCalories,
        patch.nutritionBounds.minDailyCalories ?? result.nutritionBounds.minDailyCalories
      ),
    };
  }

  if (patch.intensityCaps) {
    result.intensityCaps = {
      ...result.intensityCaps,
      ...patch.intensityCaps,
      maxRPE: Math.min(
        result.intensityCaps.maxRPE,
        patch.intensityCaps.maxRPE ?? result.intensityCaps.maxRPE
      ),
      warmupMinutesMin: Math.max(
        result.intensityCaps.warmupMinutesMin,
        patch.intensityCaps.warmupMinutesMin ?? result.intensityCaps.warmupMinutesMin
      ),
      mobilityMinutesMin: Math.max(
        result.intensityCaps.mobilityMinutesMin,
        patch.intensityCaps.mobilityMinutesMin ?? result.intensityCaps.mobilityMinutesMin
      ),
    };
  }

  if (patch.scheduleConstraints) {
    result.scheduleConstraints = {
      ...result.scheduleConstraints,
      ...patch.scheduleConstraints,
    };
  }

  if (patch.swapHints) {
    result.swapHints = { ...result.swapHints, ...patch.swapHints };
  }

  return result;
}

export function evaluateConstraints(ctx: RuleContext): ConstraintResult {
  let safeSpec = getDefaultSafeSpec();
  const allViolations: Violation[] = [];

  const rules = [
    evaluateAgeRules,
    evaluateInjuryRules,
    evaluateEquipmentRules,
    evaluateNutritionRules,
    evaluateScheduleRules,
  ];

  for (const rule of rules) {
    const { violations, specPatch } = rule(ctx);
    allViolations.push(...violations);

    if (violations.some(v => v.severity === "BLOCK")) {
      return {
        blocked: true,
        violations: allViolations,
        safeSpec,
      };
    }

    safeSpec = deepMergeSafeSpec(safeSpec, specPatch);
  }

  return {
    blocked: false,
    violations: allViolations,
    safeSpec,
  };
}

export function buildConstraintPromptBlock(safeSpec: SafeSpec, planKind: "meal" | "workout" | "both", planBias?: string | null): string {
  const parts: string[] = [];

  parts.push(`\n\n--- CONSTRAINT ENGINE SAFETY SPEC ---`);
  parts.push(`Age tier: ${safeSpec.ageTier}`);

  if (planBias && planBias !== "maintain") {
    parts.push(`\n--- PERFORMANCE COACH ADJUSTMENT ---`);
    switch (planBias) {
      case "reduce_load":
        parts.push("REDUCE training intensity and volume this week. Prioritize recovery. Use lighter weights, fewer sets, and include extra rest days or active recovery sessions. For meals, emphasize anti-inflammatory foods and recovery nutrition.");
        break;
      case "increase_load":
        parts.push("SLIGHTLY INCREASE training challenge this week. Add modest volume or intensity progression. For meals, ensure adequate protein and calories to support increased workload.");
        break;
      case "simplify_plan":
        parts.push("SIMPLIFY the plan this week. Use fewer exercises per session, shorter workouts, and simpler meal preparations. Focus on making adherence easy and rebuilding consistency.");
        break;
      case "nutrition_bias_training_days":
        parts.push("BIAS nutrition toward training days. Increase carbs and total calories on workout days, keep rest days lighter. Focus on timing nutrition around workouts.");
        break;
    }
    parts.push(`--- END PERFORMANCE COACH ADJUSTMENT ---`);
  }

  if (planKind === "workout" || planKind === "both") {
    if (safeSpec.bannedExerciseTags.length > 0) {
      parts.push(`BANNED exercise categories/tags (do NOT include): ${safeSpec.bannedExerciseTags.join(", ")}`);
    }
    if (safeSpec.bannedExercisesExact.length > 0) {
      parts.push(`BANNED exercises (NEVER include these): ${safeSpec.bannedExercisesExact.join(", ")}`);
    }
    if (safeSpec.equipmentRestriction !== "any" && safeSpec.equipmentRestriction !== "gym") {
      parts.push(`Equipment restriction: ${safeSpec.equipmentRestriction}`);
      if (safeSpec.allowedEquipment.length > 0) {
        parts.push(`Allowed equipment only: ${safeSpec.allowedEquipment.join(", ")}`);
      }
    }

    const ic = safeSpec.intensityCaps;
    parts.push(`Max RPE: ${ic.maxRPE}`);
    if (ic.noOneRepMax) parts.push(`No 1-rep max testing`);
    if (ic.noMaxEffortLifts) parts.push(`No max effort lifts`);
    if (ic.noPlyometrics) {
      parts.push(`No plyometrics allowed`);
    } else if (ic.plyoLimit !== "full") {
      parts.push(`Plyometrics limited to: ${ic.plyoLimit}`);
    }
    parts.push(`Minimum warmup: ${ic.warmupMinutesMin} min`);
    parts.push(`Minimum mobility work: ${ic.mobilityMinutesMin} min`);
    if (ic.jointFriendlyBias) parts.push(`Prefer joint-friendly exercises`);
    if (ic.requireLowImpactCardio) parts.push(`Use low-impact cardio only`);
    if (ic.longerWarmup) parts.push(`Include extended warmup and cooldown`);

    if (Object.keys(safeSpec.swapHints).length > 0) {
      parts.push(`If needed, swap suggestions:`);
      for (const [banned, alts] of Object.entries(safeSpec.swapHints)) {
        parts.push(`  - Instead of "${banned}" use: ${alts.join(" or ")}`);
      }
    }
  }

  if (planKind === "meal" || planKind === "both") {
    if (safeSpec.bannedFoods.length > 0) {
      parts.push(`BANNED foods (NEVER include as ingredients or in meals): ${safeSpec.bannedFoods.join(", ")}`);
    }
    if (safeSpec.bannedIngredients.length > 0) {
      parts.push(`BANNED ingredients (allergens — absolute prohibition): ${safeSpec.bannedIngredients.join(", ")}`);
    }

    const nb = safeSpec.nutritionBounds;
    parts.push(`Min daily calories: ${nb.minDailyCalories}`);
    parts.push(`Max daily calories: ${nb.maxDailyCalories}`);
    if (nb.noAggressiveDeficit) {
      parts.push(`No aggressive calorie deficits — keep nutrition balanced and growth-supportive.`);
    }
  }

  parts.push(`--- END CONSTRAINT ENGINE SAFETY SPEC ---`);
  return parts.join("\n");
}
