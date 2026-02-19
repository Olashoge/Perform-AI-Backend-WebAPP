import type { RuleContext, RuleResult, SafeSpec } from "../types";

export function evaluateNutritionRules(ctx: RuleContext): RuleResult {
  const violations: RuleResult["violations"] = [];
  const specPatch: Partial<SafeSpec> = {};

  const profile = ctx.profile;
  const allergiesIntolerances = (profile.allergiesIntolerances as string[]) || [];
  const mealPrefs = ctx.mealPreferences;
  const foodsToAvoid = mealPrefs?.foodsToAvoid || [];

  const bannedFoods = Array.from(new Set([...allergiesIntolerances, ...foodsToAvoid]));
  const bannedIngredients = Array.from(new Set(allergiesIntolerances));

  if (bannedFoods.length > 0) {
    violations.push({
      ruleKey: "NUTRITION_BANNED_FOODS",
      category: "NUTRITION",
      severity: "ADJUST",
      message: `The following foods/allergens are excluded from your plan: ${bannedFoods.join(", ")}.`,
      metadata: { bannedFoods, allergiesIntolerances },
    });
    specPatch.bannedFoods = bannedFoods;
    specPatch.bannedIngredients = bannedIngredients;
  }

  const goal = profile.primaryGoal;
  const age = profile.age;
  const isMinor = age < 18;

  const nutritionBounds: SafeSpec["nutritionBounds"] = {
    calorieDeficitMaxPercent: 0.25,
    calorieDeficitMaxKcal: 700,
    calorieSurplusMaxKcal: 500,
    minDailyCalories: 1200,
    maxDailyCalories: 4000,
    noAggressiveDeficit: false,
  };

  if (goal === "weight_loss") {
    nutritionBounds.calorieDeficitMaxPercent = 0.25;
    nutritionBounds.calorieDeficitMaxKcal = 700;
  } else if (goal === "muscle_gain" || goal === "strength") {
    nutritionBounds.calorieSurplusMaxKcal = 500;
    nutritionBounds.calorieDeficitMaxKcal = 0;
  }

  if (isMinor) {
    nutritionBounds.calorieDeficitMaxPercent = 0.10;
    nutritionBounds.calorieDeficitMaxKcal = 200;
    nutritionBounds.calorieSurplusMaxKcal = 300;
    nutritionBounds.minDailyCalories = 1600;
    nutritionBounds.noAggressiveDeficit = true;

    if (goal === "weight_loss") {
      violations.push({
        ruleKey: "NUTRITION_MINOR_DEFICIT",
        category: "NUTRITION",
        severity: "WARN",
        message: "Calorie deficit limits reduced for users under 18. Focus is on balanced nutrition rather than aggressive weight loss.",
        metadata: { age, adjustedDeficitMax: nutritionBounds.calorieDeficitMaxKcal },
      });
    }
  }

  specPatch.nutritionBounds = nutritionBounds;
  return { violations, specPatch };
}
