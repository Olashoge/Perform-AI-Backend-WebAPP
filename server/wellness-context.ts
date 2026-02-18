import type { Preferences, WorkoutPreferences, UserPreferenceContext } from "@shared/schema";

export interface WellnessContext {
  goalType: string;
  dateRange: { startDate?: string; endDate?: string } | null;
  trainingDays: string[];
  restDays: string[];
  intensityPerDay: Record<string, "easy" | "moderate" | "hard" | "rest">;
  dietaryPrefs: {
    dietStyles: string[];
    foodsToAvoid: string[];
    allergies?: string;
    spiceLevel: string;
    authenticityMode: string;
  };
  macroTargets: {
    calorieRange?: string;
    proteinRange?: string;
    carbsRange?: string;
    fatRange?: string;
  };
  personalization: {
    age?: number;
    currentWeight?: number;
    targetWeight?: number;
    weightUnit: string;
  };
  budgetMode: string;
  sessionLength?: number;
  experienceLevel?: string;
}

const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function buildWellnessContext(opts: {
  goalType: string;
  startDate?: string;
  endDate?: string;
  mealPrefs?: Preferences;
  workoutPrefs?: WorkoutPreferences;
  globalInputs?: { age?: number; currentWeight?: number; targetWeight?: number; weightUnit?: string };
}): WellnessContext {
  const { goalType, startDate, endDate, mealPrefs, workoutPrefs, globalInputs } = opts;

  const trainingDays = workoutPrefs?.daysOfWeek || mealPrefs?.workoutDays || [];
  const restDays = ALL_DAYS.filter(d => !trainingDays.includes(d as any));

  const intensityPerDay: Record<string, "easy" | "moderate" | "hard" | "rest"> = {};
  for (const d of ALL_DAYS) {
    if (trainingDays.includes(d as any)) {
      const level = workoutPrefs?.experienceLevel;
      intensityPerDay[d] = level === "advanced" ? "hard" : level === "intermediate" ? "moderate" : "easy";
    } else {
      intensityPerDay[d] = "rest";
    }
  }

  const calorieHints = deriveMacroTargets(goalType, globalInputs?.currentWeight, globalInputs?.targetWeight, trainingDays.length);

  return {
    goalType,
    dateRange: startDate ? { startDate, endDate } : null,
    trainingDays,
    restDays,
    intensityPerDay,
    dietaryPrefs: {
      dietStyles: mealPrefs?.dietStyles || [],
      foodsToAvoid: mealPrefs?.foodsToAvoid || [],
      allergies: mealPrefs?.allergies,
      spiceLevel: mealPrefs?.spiceLevel || "medium",
      authenticityMode: mealPrefs?.authenticityMode || "mixed",
    },
    macroTargets: calorieHints,
    personalization: {
      age: globalInputs?.age || mealPrefs?.age,
      currentWeight: globalInputs?.currentWeight || mealPrefs?.currentWeight,
      targetWeight: globalInputs?.targetWeight || mealPrefs?.targetWeight,
      weightUnit: globalInputs?.weightUnit || mealPrefs?.weightUnit || "lb",
    },
    budgetMode: mealPrefs?.budgetMode || "normal",
    sessionLength: workoutPrefs?.sessionLength,
    experienceLevel: workoutPrefs?.experienceLevel,
  };
}

function deriveMacroTargets(
  goalType: string,
  currentWeight?: number,
  targetWeight?: number,
  trainingDaysCount: number = 0
): WellnessContext["macroTargets"] {
  switch (goalType) {
    case "weight_loss":
      return {
        calorieRange: "1400-1800",
        proteinRange: "100-140g",
        carbsRange: "120-180g",
        fatRange: "45-65g",
      };
    case "muscle_gain":
      return {
        calorieRange: "2200-2800",
        proteinRange: "140-180g",
        carbsRange: "250-350g",
        fatRange: "60-90g",
      };
    case "performance":
    case "endurance":
      return {
        calorieRange: "2000-2600",
        proteinRange: "120-160g",
        carbsRange: "220-320g",
        fatRange: "55-80g",
      };
    case "strength":
      return {
        calorieRange: "2200-2800",
        proteinRange: "150-190g",
        carbsRange: "200-300g",
        fatRange: "60-90g",
      };
    case "maintenance":
    case "general_fitness":
    default:
      return {
        calorieRange: "1800-2200",
        proteinRange: "100-140g",
        carbsRange: "180-260g",
        fatRange: "50-75g",
      };
  }
}

export function buildMealWellnessBlock(ctx: WellnessContext): string {
  if (ctx.trainingDays.length === 0) return "";

  const dayMap: Record<string, number> = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 };
  const trainingIndices = ctx.trainingDays.map(d => dayMap[d]).filter(Boolean);
  const restIndices = ctx.restDays.map(d => dayMap[d]).filter(Boolean);

  let block = `\n\n--- WELLNESS CONTEXT (CROSS-PLAN COUPLING) ---`;
  block += `\nGoal: ${ctx.goalType.replace("_", " ")}`;

  if (ctx.macroTargets.calorieRange) {
    block += `\nDaily calorie target range: ${ctx.macroTargets.calorieRange} kcal`;
  }
  if (ctx.macroTargets.proteinRange) {
    block += `\nProtein target: ${ctx.macroTargets.proteinRange}`;
  }

  block += `\n\nTRAINING-DAY NUTRITION RULES:`;
  block += `\n- Training days (Day indices ${trainingIndices.join(", ")} = ${ctx.trainingDays.join(", ")}):`;
  block += `\n  * Increase carbs by ~15-25% above baseline to fuel workouts and support recovery.`;
  block += `\n  * Increase total calories by ~10-15% above rest-day levels.`;
  block += `\n  * Keep protein STEADY on all days (${ctx.macroTargets.proteinRange || "adequate"}).`;
  block += `\n  * Include post-workout-friendly meals (fast carbs + protein) when appropriate.`;

  block += `\n- Rest days (Day indices ${restIndices.join(", ")} = ${ctx.restDays.join(", ")}):`;
  block += `\n  * Reduce carbs by ~15-25% below training-day levels.`;
  block += `\n  * Slightly lower total calories.`;
  block += `\n  * Emphasize vegetables, healthy fats, and lean protein.`;
  block += `\n  * Protein remains STEADY.`;

  if (ctx.goalType === "weight_loss") {
    block += `\n\nWEIGHT LOSS NOTE: Still maintain a calorie deficit on all days. On training days, shift macros toward more carbs rather than adding excess calories. Keep deficit moderate.`;
  } else if (ctx.goalType === "muscle_gain" || ctx.goalType === "strength") {
    block += `\n\nMUSCLE/STRENGTH NOTE: Ensure caloric surplus on training days. Post-workout meals should emphasize protein + fast-digesting carbs. Rest days can be at maintenance.`;
  }

  block += `\n- In whyItHelpsGoal, briefly mention training/rest day rationale when relevant.`;
  block += `\n--- END WELLNESS CONTEXT ---`;

  return block;
}

export function buildWorkoutWellnessBlock(ctx: WellnessContext): string {
  let block = `\n\nNUTRITION-AWARE TRAINING ADJUSTMENTS:`;
  block += `\nGoal: ${ctx.goalType.replace("_", " ")}`;

  if (ctx.macroTargets.calorieRange) {
    block += `\nUser's daily calorie range: ${ctx.macroTargets.calorieRange} kcal`;
  }

  if (ctx.goalType === "weight_loss") {
    block += `\n- User is in a calorie deficit. Keep session intensity moderate to avoid overtraining.`;
    block += `\n- Favor compound movements for calorie efficiency. Include short rest periods (30-60s) to maintain elevated heart rate.`;
    block += `\n- Volume: moderate (3-4 sets per exercise). Avoid excessive volume that requires surplus nutrition for recovery.`;
  } else if (ctx.goalType === "muscle_gain" || ctx.goalType === "strength") {
    block += `\n- User is in a calorie surplus. Higher volume and intensity are sustainable.`;
    block += `\n- Prioritize progressive overload. Allow longer rest periods (60-120s) for strength work.`;
    block += `\n- Volume: higher (3-5 sets per exercise) with progressive rep ranges.`;
  } else if (ctx.goalType === "performance" || ctx.goalType === "endurance") {
    block += `\n- User has moderate calorie intake. Balance intensity with recovery.`;
    block += `\n- Include sport-specific conditioning and endurance work.`;
    block += `\n- Volume: moderate-high with adequate rest between sessions.`;
  } else {
    block += `\n- User is at maintenance calories. Keep volume moderate and focus on consistency.`;
    block += `\n- Balance intensity across the week. Avoid excessive strain.`;
  }

  if (ctx.budgetMode === "budget_friendly") {
    block += `\n- User is on a budget diet. Avoid prescribing expensive supplements or recovery aids in coaching cues.`;
  }

  if (ctx.sessionLength) {
    block += `\n- Session time constraint: ${ctx.sessionLength} min. Adjust volume to fit within this window including warm-up and cool-down.`;
  }

  return block;
}
