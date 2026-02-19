import type { RuleContext, RuleResult, SafeSpec } from "../types";

export function evaluateNutritionRules(ctx: RuleContext): RuleResult {
  const violations: RuleResult["violations"] = [];
  const specPatch: Partial<SafeSpec> = {};

  const profile = ctx.profile;
  const allergies = (profile.allergies as string[]) || [];
  const intolerances = (profile.intolerances as string[]) || [];
  const religiousRestrictions = (profile.religiousRestrictions as string[]) || [];
  const mealPrefs = ctx.mealPreferences;
  const foodsToAvoid = mealPrefs?.foodsToAvoid || [];

  const bannedFoods = Array.from(new Set([...allergies, ...intolerances, ...foodsToAvoid]));
  const bannedIngredients = Array.from(new Set(allergies));

  if (bannedFoods.length > 0) {
    violations.push({
      ruleKey: "NUTRITION_BANNED_FOODS",
      category: "NUTRITION",
      severity: "ADJUST",
      message: `The following foods/allergens are excluded from your plan: ${bannedFoods.join(", ")}.`,
      metadata: { bannedFoods, allergies, intolerances, religiousRestrictions },
    });
    specPatch.bannedFoods = bannedFoods;
    specPatch.bannedIngredients = bannedIngredients;
  }

  if (religiousRestrictions.length > 0) {
    const religionFoodBans: Record<string, string[]> = {
      halal: ["pork", "bacon", "ham", "lard", "gelatin (pork)", "alcohol"],
      kosher: ["pork", "shellfish", "bacon", "ham", "mixing meat and dairy"],
      hindu: ["beef", "cow meat"],
      buddhist: ["beef", "pork"],
      jain: ["meat", "fish", "eggs", "root vegetables"],
      vegan: ["meat", "fish", "eggs", "dairy", "honey"],
      vegetarian: ["meat", "fish", "poultry"],
    };

    for (const restriction of religiousRestrictions) {
      const key = restriction.toLowerCase();
      const foods = religionFoodBans[key];
      if (foods) {
        bannedFoods.push(...foods);
        violations.push({
          ruleKey: "NUTRITION_RELIGIOUS",
          category: "NUTRITION",
          severity: "ADJUST",
          message: `Dietary restriction "${restriction}" applied: excluding ${foods.join(", ")}.`,
          metadata: { restriction, excludedFoods: foods },
        });
      }
    }
    specPatch.bannedFoods = Array.from(new Set(bannedFoods));
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
