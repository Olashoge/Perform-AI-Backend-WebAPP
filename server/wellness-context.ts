import type { Preferences, WorkoutPreferences, UserPreferenceContext } from "@shared/schema";

export interface WellnessContext {
  goalType: string;
  secondaryFocus?: string | null;
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
  secondaryFocus?: string | null;
  startDate?: string;
  endDate?: string;
  mealPrefs?: Preferences;
  workoutPrefs?: WorkoutPreferences;
  globalInputs?: { age?: number; currentWeight?: number; targetWeight?: number; weightUnit?: string };
}): WellnessContext {
  const { goalType, secondaryFocus, startDate, endDate, mealPrefs, workoutPrefs, globalInputs } = opts;

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

  const canonicalGoal = canonicalizeGoalType(goalType);
  const calorieHints = deriveMacroTargets(canonicalGoal, secondaryFocus, trainingDays.length);

  return {
    goalType: canonicalGoal,
    secondaryFocus: secondaryFocus || null,
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

export function canonicalizeGoalType(goalType: string): string {
  switch (goalType) {
    case "performance": return "athletic_performance";
    case "maintenance": return "general_fitness";
    case "energy": return "general_fitness";
    case "mobility": return "general_fitness";
    case "endurance": return "general_fitness";
    case "strength": return "muscle_gain";
    default: return goalType;
  }
}

function deriveMacroTargets(
  goalType: string,
  secondaryFocus?: string | null,
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
    case "body_recomposition":
      return {
        calorieRange: "1800-2200",
        proteinRange: "150-190g",
        carbsRange: "180-240g",
        fatRange: "55-75g",
      };
    case "athletic_performance":
      return {
        calorieRange: "2000-2600",
        proteinRange: "120-160g",
        carbsRange: "220-320g",
        fatRange: "55-80g",
      };
    case "general_fitness":
    default:
      if (secondaryFocus === "strength") {
        return {
          calorieRange: "2000-2500",
          proteinRange: "130-170g",
          carbsRange: "200-280g",
          fatRange: "55-80g",
        };
      }
      if (secondaryFocus === "endurance") {
        return {
          calorieRange: "1900-2400",
          proteinRange: "110-150g",
          carbsRange: "220-300g",
          fatRange: "50-75g",
        };
      }
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

  const goalLabel = ctx.goalType.replace(/_/g, " ");
  let block = `\n\n--- WELLNESS CONTEXT (CROSS-PLAN COUPLING) ---`;
  block += `\nPrimary Goal: ${goalLabel}`;
  if (ctx.secondaryFocus) {
    block += `\nSecondary Focus: ${ctx.secondaryFocus.replace(/_/g, " ")} (modifier)`;
  }

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
  } else if (ctx.goalType === "muscle_gain") {
    block += `\n\nMUSCLE GAIN NOTE: Ensure caloric surplus on training days. Post-workout meals should emphasize protein + fast-digesting carbs. Rest days can be at maintenance.`;
    if (ctx.secondaryFocus === "strength") {
      block += ` Prioritize dense protein sources and calorie-rich whole foods to support heavy strength work.`;
    }
  } else if (ctx.goalType === "body_recomposition") {
    block += `\n\nBODY RECOMPOSITION NOTE: High protein is critical. Cycle carbs — higher on training days, lower on rest days. Overall calories at or slightly below maintenance. Prioritize lean proteins and fibrous vegetables.`;
  } else if (ctx.goalType === "athletic_performance") {
    block += `\n\nATHLETIC PERFORMANCE NOTE: Carb timing is key. Prioritize pre- and post-workout carb availability. Protein supports recovery. Match calorie intake to training load.`;
  }

  if (ctx.secondaryFocus === "recovery") {
    block += `\n\nRECOVERY FOCUS NOTE: Include anti-inflammatory foods (berries, leafy greens, omega-3 sources). Emphasize easy-to-digest meals. Prioritize sleep-supportive nutrients (magnesium, tryptophan).`;
  } else if (ctx.secondaryFocus === "mobility") {
    block += `\n\nMOBILITY FOCUS NOTE: Include anti-inflammatory and collagen-supportive foods (vitamin C sources, bone broth if not restricted). Keep meals light and easy to digest pre-movement sessions.`;
  } else if (ctx.secondaryFocus === "energy_focus") {
    block += `\n\nENERGY & FOCUS NOTE: Prioritize balanced blood sugar throughout the day. Include slow-digesting carbs, healthy fats, and B-vitamin-rich foods. Limit processed sugars.`;
  }

  block += `\n- In whyItHelpsGoal, briefly mention training/rest day rationale when relevant.`;
  block += `\n--- END WELLNESS CONTEXT ---`;

  return block;
}

export function buildWorkoutWellnessBlock(ctx: WellnessContext): string {
  let block = `\n\nNUTRITION-AWARE TRAINING ADJUSTMENTS:`;
  const goalLabel = ctx.goalType.replace(/_/g, " ");
  block += `\nPrimary Goal: ${goalLabel}`;
  if (ctx.secondaryFocus) {
    block += ` | Secondary Focus: ${ctx.secondaryFocus.replace(/_/g, " ")}`;
  }

  if (ctx.macroTargets.calorieRange) {
    block += `\nUser's daily calorie range: ${ctx.macroTargets.calorieRange} kcal`;
  }

  if (ctx.goalType === "weight_loss") {
    block += `\n- User is in a calorie deficit. Keep session intensity moderate to avoid overtraining.`;
    block += `\n- Favor compound movements for calorie efficiency. Include short rest periods (30-60s) to maintain elevated heart rate.`;
    block += `\n- Volume: moderate (3-4 sets per exercise). Avoid excessive volume that requires surplus nutrition for recovery.`;
    if (ctx.secondaryFocus === "strength") {
      block += `\n- Strength modifier: preserve/build strength while in deficit. Include heavy compounds (squat, deadlift, press) with adequate rest. Reduce cardio volume.`;
    } else if (ctx.secondaryFocus === "endurance") {
      block += `\n- Endurance modifier: add cardio conditioning blocks (20-30 min steady-state or intervals) while keeping strength work efficient.`;
    }
  } else if (ctx.goalType === "muscle_gain") {
    block += `\n- User is in a calorie surplus. Higher volume and intensity are sustainable.`;
    block += `\n- Prioritize progressive overload. Allow longer rest periods (60-120s) for strength work.`;
    block += `\n- Volume: higher (3-5 sets per exercise) with progressive rep ranges.`;
    if (ctx.secondaryFocus === "mobility") {
      block += `\n- Mobility modifier: add dedicated warm-up/cool-down mobility blocks. Include active stretching and movement quality work before main lifts.`;
    } else if (ctx.secondaryFocus === "endurance") {
      block += `\n- Endurance modifier: include conditioning finishers (10-15 min) after main strength work. Keep aerobic base without compromising hypertrophy.`;
    }
  } else if (ctx.goalType === "body_recomposition") {
    block += `\n- Body recomposition: balanced caloric approach. Combine strength training with moderate cardio conditioning.`;
    block += `\n- Training: 3-5 days/week. Mix compound lifts with circuit or superset structures to maximize calorie burn and muscle stimulus simultaneously.`;
    block += `\n- Rest periods: 45-90s to maintain metabolic demand while allowing adequate recovery.`;
    if (ctx.secondaryFocus === "strength") {
      block += `\n- Strength modifier: bias toward compound movements and progressive overload. Minimize isolation work.`;
    } else if (ctx.secondaryFocus === "endurance") {
      block += `\n- Endurance modifier: include conditioning circuits. Maintain aerobic capacity alongside body recomposition work.`;
    }
  } else if (ctx.goalType === "athletic_performance") {
    block += `\n- User has moderate-high calorie intake. Balance intensity with recovery.`;
    block += `\n- Include sport-specific conditioning, power development, and endurance work as needed.`;
    block += `\n- Volume: moderate-high with adequate rest between sessions.`;
    if (ctx.secondaryFocus === "strength") {
      block += `\n- Strength modifier: periodize strength work. Include power movements (jumps, cleans) alongside structural strength.`;
    } else if (ctx.secondaryFocus === "recovery") {
      block += `\n- Recovery modifier: integrate active recovery days. Monitor fatigue. Prioritize quality over quantity.`;
    } else if (ctx.secondaryFocus === "mobility") {
      block += `\n- Mobility modifier: add sport-specific movement prep and dedicated mobility blocks. Improve range of motion for performance.`;
    }
  } else {
    block += `\n- User is at maintenance calories. Keep volume moderate and focus on consistency.`;
    block += `\n- Balance intensity across the week. Avoid excessive strain.`;
    if (ctx.secondaryFocus === "strength") {
      block += `\n- Strength modifier: bias toward compound lifts. Include progressive overload even at maintenance calories.`;
    } else if (ctx.secondaryFocus === "endurance") {
      block += `\n- Endurance modifier: include cardio sessions (running, cycling, rowing). Build aerobic base progressively.`;
    } else if (ctx.secondaryFocus === "mobility") {
      block += `\n- Mobility modifier: incorporate dedicated flexibility, yoga-style, or movement flow work into sessions.`;
    } else if (ctx.secondaryFocus === "energy_focus") {
      block += `\n- Energy & Focus modifier: prefer moderate intensity, avoid overtraining. Include mindful movement and stress-reducing exercise formats.`;
    } else if (ctx.secondaryFocus === "recovery") {
      block += `\n- Recovery modifier: prioritize active recovery, foam rolling, and lower-intensity sessions. Fatigue management is primary.`;
    }
  }

  if (ctx.budgetMode === "budget_friendly") {
    block += `\n- User is on a budget diet. Avoid prescribing expensive supplements or recovery aids in coaching cues.`;
  }

  if (ctx.sessionLength) {
    block += `\n- Session time constraint: ${ctx.sessionLength} min. Adjust volume to fit within this window including warm-up and cool-down.`;
  }

  return block;
}
