import type { RuleContext, RuleResult, SafeSpec } from "../types";

export function evaluateAgeRules(ctx: RuleContext): RuleResult {
  const violations: RuleResult["violations"] = [];
  const specPatch: Partial<SafeSpec> = {};
  const age = ctx.profile.age;

  if (age < 13) {
    violations.push({
      ruleKey: "AGE_UNDER_13",
      category: "AGE",
      severity: "BLOCK",
      message: "Plan generation is not available for users under 13 years old. This plan is not appropriate for this age group.",
      metadata: { age },
    });
    return { violations, specPatch };
  }

  let ageTier: SafeSpec["ageTier"] = "adult";

  if (age >= 13 && age <= 15) {
    ageTier = "young_teen";
    violations.push({
      ruleKey: "AGE_YOUNG_TEEN",
      category: "AGE",
      severity: "ADJUST",
      message: "Adjusted plan for ages 13-15: removed barbell and heavy lifting patterns, limited intensity.",
      metadata: { age, adjustments: ["no_barbell", "no_heavy_intensity", "lower_rpe"] },
    });
    specPatch.bannedExerciseTags = ["barbell", "heavyHinge", "maxEffort", "olympicLift"];
    specPatch.bannedExercisesExact = [
      "barbell back squat", "barbell front squat", "barbell bench press",
      "barbell deadlift", "power clean", "snatch", "clean and jerk",
      "barbell overhead press",
    ];
    specPatch.intensityCaps = {
      maxRPE: 6,
      noOneRepMax: true,
      noMaxEffortLifts: true,
      noPlyometrics: false,
      plyoLimit: "light",
      warmupMinutesMin: 8,
      mobilityMinutesMin: 5,
      requireLowImpactCardio: false,
      jointFriendlyBias: false,
      longerWarmup: false,
    };
    specPatch.nutritionBounds = {
      calorieDeficitMaxPercent: 0.10,
      calorieDeficitMaxKcal: 200,
      calorieSurplusMaxKcal: 300,
      minDailyCalories: 1600,
      maxDailyCalories: 3000,
      noAggressiveDeficit: true,
    };
  } else if (age >= 16 && age <= 17) {
    ageTier = "older_teen";
    const exp = ctx.profile.trainingExperience;
    if (exp !== "advanced") {
      violations.push({
        ruleKey: "AGE_OLDER_TEEN",
        category: "AGE",
        severity: "WARN",
        message: "Ages 16-17: intensity restricted and advanced lifts limited unless experience level is advanced.",
        metadata: { age, experience: exp },
      });
      specPatch.bannedExerciseTags = ["olympicLift", "maxEffort"];
      specPatch.bannedExercisesExact = ["power clean", "snatch", "clean and jerk"];
      specPatch.intensityCaps = {
        maxRPE: 7,
        noOneRepMax: true,
        noMaxEffortLifts: true,
        noPlyometrics: false,
        plyoLimit: "moderate",
        warmupMinutesMin: 6,
        mobilityMinutesMin: 5,
        requireLowImpactCardio: false,
        jointFriendlyBias: false,
        longerWarmup: false,
      };
    }
    specPatch.nutritionBounds = {
      calorieDeficitMaxPercent: 0.15,
      calorieDeficitMaxKcal: 400,
      calorieSurplusMaxKcal: 400,
      minDailyCalories: 1500,
      maxDailyCalories: 3500,
      noAggressiveDeficit: true,
    };
  } else if (age >= 60) {
    ageTier = "senior";
    violations.push({
      ruleKey: "AGE_SENIOR",
      category: "AGE",
      severity: "ADJUST",
      message: "Adjusted plan for ages 60+: joint-friendly bias, longer warmup, reduced impact exercises.",
      metadata: { age },
    });
    specPatch.bannedExerciseTags = ["highImpact", "olympicLift", "maxEffort"];
    specPatch.bannedExercisesExact = [
      "box jumps", "burpees", "jump rope", "power clean", "snatch",
      "clean and jerk", "depth jumps", "plyometric push-ups",
    ];
    specPatch.intensityCaps = {
      maxRPE: 7,
      noOneRepMax: true,
      noMaxEffortLifts: true,
      noPlyometrics: false,
      plyoLimit: "light",
      warmupMinutesMin: 10,
      mobilityMinutesMin: 8,
      requireLowImpactCardio: true,
      jointFriendlyBias: true,
      longerWarmup: true,
    };
  }

  specPatch.ageTier = ageTier;
  return { violations, specPatch };
}
