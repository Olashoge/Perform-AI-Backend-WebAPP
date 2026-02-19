import OpenAI from "openai";
import { planOutputSchema, mealSchema, daySchema, groceryPricingSchema, workoutPlanOutputSchema, workoutSessionSchema, type Preferences, type PlanOutput, type Meal, type Day, type UserPreferenceContext, type GroceryPricing, type GrocerySection, type WorkoutPreferences, type WorkoutPlanOutput, type WorkoutSession } from "@shared/schema";
import { type WellnessContext, buildMealWellnessBlock, buildWorkoutWellnessBlock } from "./wellness-context";

if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY is not set. AI features will not work.");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "missing" });

function buildSystemPrompt(prefs: Preferences): string {
  const isMinor = prefs.age !== undefined && prefs.age < 18;

  let base = `You are a professional meal planning nutritionist. You generate detailed, practical 7-day meal plans.

RULES:
- Return ONLY valid JSON. No markdown, no commentary, no code fences.
- Always respect foodsToAvoid and allergies/intolerances — never include them as ingredients or feature them in meals.
- Keep ingredients realistic and accessible at US grocery stores.
- When using culturally-specific ingredients (e.g., Nigerian, Indian, Thai), ensure they are available at most US grocery stores or suggest a common US substitution in parentheses.
- Budget mode: reduce specialty ingredients, keep meals simple.
- Family mode (householdSize > 2): avoid overly spicy options unless diet styles explicitly imply spice.
- Each meal must have 6-8 steps maximum. Keep steps concise.
- Scale servings to match householdSize.
- Quick cooking time means each meal should be under 30 minutes.
- Keep ingredient lines short (quantity + ingredient name only).
- Keep summary to 2-3 sentences.
- Keep whyItHelpsGoal to 1 brief sentence.
- Keep nutrition explanation concise (2-3 reasons max).

SPICE LEVEL RULES:
- Apply spice level INDEPENDENTLY of the cuisine. Do NOT infer spice tolerance from the chosen cuisine.
- "none": No spicy ingredients or hot seasonings at all. No chili, cayenne, hot sauce, jalapeño, etc.
- "mild": Only very gentle warmth allowed (e.g., mild paprika, a pinch of black pepper). No hot peppers.
- "medium": Moderate spice is fine (jalapeño, sriracha, red pepper flakes in moderate amounts).
- "hot": Generous use of hot peppers, chili paste, cayenne, habanero, etc. is encouraged.

AUTHENTICITY MODE RULES:
- "traditional": Use more authentic ingredients and traditional cooking methods for the chosen cuisines. Still ensure ingredients are available at US grocery stores — if a traditional ingredient is uncommon, include a parenthetical US substitute that keeps the dish coherent.
- "weeknight": Prioritize fewer ingredients, faster steps, and simpler prep. Simplify traditional dishes to be weeknight-friendly while keeping the cuisine flavor profile.
- "mixed": Balance authentic touches with practical weeknight convenience.

CUISINE ADHERENCE:
- When diet/cuisine styles are specified, meals MUST strongly reflect those cuisines through their staple ingredients, spice profiles, and cooking methods.
- Do NOT just add a "twist" — actually use core ingredients and techniques from the specified cuisines.`;

  if (isMinor) {
    base += `\n\nIMPORTANT: This user is under 18 years old. Use only supportive, non-prescriptive language about nutrition. Avoid terms like "diet", "restrict", "cut", "deficit". Focus on balanced growth, energy for activities, and healthy habits. Never suggest calorie restriction.`;
  }

  return base;
}

function buildPreferenceContextBlock(ctx?: UserPreferenceContext): string {
  if (!ctx) return "";
  const parts: string[] = [];

  if (ctx.dislikedMeals.length > 0) {
    parts.push(`DISLIKED MEALS (do NOT suggest these or very similar meals):\n${ctx.dislikedMeals.map(m => `- ${m.name} (${m.cuisineTag})`).join("\n")}`);
  }
  if (ctx.likedMeals.length > 0) {
    parts.push(`LIKED MEALS (suggest similar cuisines, cooking styles, and proteins):\n${ctx.likedMeals.map(m => `- ${m.name} (${m.cuisineTag})`).join("\n")}`);
  }
  if (ctx.avoidIngredients.length > 0) {
    parts.push(`INGREDIENTS TO AVOID (never include these): ${ctx.avoidIngredients.join(", ")}`);
  }
  if (ctx.preferIngredients.length > 0) {
    parts.push(`PREFERRED INGREDIENTS (use these more often): ${ctx.preferIngredients.join(", ")}`);
  }

  if (parts.length === 0) return "";
  return `\n\n--- USER PREFERENCE LEARNING ---\nThe following preferences were learned from the user's past meal feedback. Respect these strictly:\n${parts.join("\n\n")}\n--- END USER PREFERENCES ---\n`;
}

function formatDietStyles(prefs: Preferences): string {
  const styles = prefs.dietStyles;
  if (!styles || styles.length === 0) return "No Preference";
  return styles.join(", ");
}

function getMealSlotsForPrefs(prefs: Preferences): string[] {
  if (prefs.mealsPerDay === 2 && prefs.mealSlots && prefs.mealSlots.length === 2) {
    return prefs.mealSlots;
  }
  if (prefs.mealsPerDay === 2) return ["lunch", "dinner"];
  return ["breakfast", "lunch", "dinner"];
}

function buildMealsStructure(prefs: Preferences): string {
  const slots = getMealSlotsForPrefs(prefs);
  return slots.map(t => `"${t}": { meal object }`).join(",\n        ");
}

function buildPersonalizationBlock(prefs: Preferences): string {
  const parts: string[] = [];

  if (prefs.age) {
    parts.push(`Age: ${prefs.age}`);
  }
  if (prefs.currentWeight) {
    parts.push(`Current Weight: ${prefs.currentWeight} ${prefs.weightUnit || "lb"}`);
  }
  if (prefs.targetWeight) {
    parts.push(`Target Weight: ${prefs.targetWeight} ${prefs.weightUnit || "lb"}`);
  }
  const workoutDays = prefs.workoutDays || [];
  const workoutCount = workoutDays.length || prefs.workoutDaysPerWeek || 0;

  if (workoutDays.length > 0) {
    parts.push(`Workout Days: ${workoutDays.join(", ")}`);
  } else if (prefs.workoutDaysPerWeek !== undefined && prefs.workoutDaysPerWeek !== null) {
    parts.push(`Workout Days/Week: ${prefs.workoutDaysPerWeek}`);
  }

  if (parts.length === 0) return "";

  let block = `\nPersonalization:\n${parts.join("\n")}`;
  block += `\n\nADAPTATION GUIDELINES:`;
  block += `\n- Adjust portion sizes and macro ranges based on the user's weight, goal, and activity level.`;

  if (workoutDays.length > 0) {
    const dayMap: Record<string, number> = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 };
    const workoutDayIndices = workoutDays.map(d => dayMap[d]).filter(Boolean);
    block += `\n\nWORKOUT-DAY FUELING LOGIC:`;
    block += `\n- The user works out on: ${workoutDays.join(", ")} (Day indices: ${workoutDayIndices.join(", ")}).`;
    block += `\n- On workout days (${workoutDays.join("/")}): bias toward higher protein and slightly higher carbs to support training and recovery. Include carb-rich sides or grains, and ensure adequate protein in every meal.`;
    block += `\n- On rest days: slightly lighter carbs, emphasize vegetables, healthy fats, and lean proteins. Keep within the calorie range for the user's goal.`;
    if (prefs.goal === "weight_loss") {
      block += `\n- For weight loss: still keep within calorie range on all days. On workout days, shift macros toward more carbs/protein rather than adding extra calories.`;
    } else if (prefs.goal === "muscle_gain" || prefs.goal === "performance") {
      block += `\n- For ${prefs.goal}: include adequate carbs on workout days to fuel performance and recovery. Post-workout friendly meals encouraged.`;
    }
    block += `\n- In whyItHelpsGoal for workout-day meals, briefly mention the fueling rationale (e.g., "Higher-carb dinner to support training recovery").`;
  } else if (workoutCount >= 4) {
    block += `\n- This user is active (${workoutCount} workout days/week). Increase protein portions and overall calories slightly.`;
  } else if (workoutCount <= 1 && workoutCount >= 0 && prefs.workoutDaysPerWeek !== undefined) {
    block += `\n- This user is mostly sedentary. Keep portions moderate and focus on nutrient-dense foods.`;
  }

  if (prefs.currentWeight && prefs.targetWeight) {
    const diff = prefs.currentWeight - prefs.targetWeight;
    if (diff > 0 && prefs.goal === "weight_loss") {
      block += `\n- User wants to lose weight. Focus on satisfying, lower-calorie meals with adequate protein. Keep estimated calorie ranges appropriate.`;
    } else if (diff < 0 && prefs.goal === "muscle_gain") {
      block += `\n- User wants to gain muscle. Increase protein and overall calorie content. Include post-workout friendly meals.`;
    }
  }

  block += `\n- All nutrition values are estimates and ranges, not medical advice.`;
  return block;
}

function buildPlanPrompt(prefs: Preferences, prefCtx?: UserPreferenceContext): string {
  const mealSlots = getMealSlotsForPrefs(prefs);
  const slotsLabel = mealSlots.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" + ");
  const mealsNote = `Generate only ${slotsLabel} (${prefs.mealsPerDay} meals per day). Do NOT include any other meal slots.`;

  return `Generate a complete 7-day meal plan based on these preferences:

Goal: ${prefs.goal === "weight_loss" ? "Weight Loss" : prefs.goal}
Diet/Cuisine Styles: ${formatDietStyles(prefs)} (Prefer meals that fit ANY of these cuisines/styles, and blend them sensibly)
Foods to Avoid: ${prefs.foodsToAvoid.length > 0 ? prefs.foodsToAvoid.join(", ") : "None"}
Household Size: ${prefs.householdSize}
Prep Style: ${prefs.prepStyle}
Budget Mode: ${prefs.budgetMode}
Cooking Time: ${prefs.cookingTime}
Spice Level: ${prefs.spiceLevel || "medium"}
Authenticity Mode: ${prefs.authenticityMode || "mixed"}
Meals Per Day: ${prefs.mealsPerDay || 3} — ${mealsNote}
Allergies & Intolerances: ${prefs.allergies || "None"}
${buildPersonalizationBlock(prefs)}

INGREDIENT GUIDELINES:
- Use ingredients readily available at US grocery stores.
- For culturally-specific cuisines, prefer ingredients found in well-stocked US supermarkets. If an ingredient is uncommon, add a parenthetical substitute (e.g., "scotch bonnet pepper (or habanero)").
- Include local greens, seasonal vegetables, and culturally appropriate spice blends where possible.

Return a JSON object with this exact structure:
{
  "title": "string - catchy plan title",
  "summary": "string - 2-3 sentences summarizing the plan",
  "preferencesEcho": { copy of the preferences above as an object },
  "days": [
    {
      "dayIndex": 1-7,
      "dayName": "Day 1" through "Day 7",
      "meals": {
        ${buildMealsStructure(prefs)}
      }
    }
  ],
  "groceryList": {
    "sections": [
      {
        "name": "section name like Produce, Pantry, Protein, Dairy, Spices, etc.",
        "items": [
          { "item": "name", "quantity": "human readable amount", "notes": "optional" }
        ]
      }
    ]
  },
  ${prefs.prepStyle !== "cook_daily" ? `"batchPrepPlan": {
    "prepDay": "string - which day to prep",
    "steps": ["step 1", "step 2", ...],
    "storageTips": ["tip 1", "tip 2", ...]
  },` : ""}
  "nutritionNotes": {
    "dailyMacroTargetsRange": { "calories": "string range", "protein_g": "string range", "carbs_g": "string range", "fat_g": "string range" },
    "howThisSupportsGoal": ["reason 1", "reason 2"] (2-3 concise reasons)
  }
}

Meal object structure:
{
  "name": "string",
  "cuisineTag": "string",
  "prepTimeMinutes": number,
  "servings": number (scaled to householdSize of ${prefs.householdSize}),
  "ingredients": ["short string with quantity, e.g. 2 cups rice"],
  "steps": ["step 1", ..., max 6-8 steps, keep concise],
  "nutritionEstimateRange": { "calories": "string", "protein_g": "string", "carbs_g": "string", "fat_g": "string" },
  "whyItHelpsGoal": "1 brief sentence"
}${buildPreferenceContextBlock(prefCtx)}`;
}

function buildSwapMealPrompt(prefs: Preferences, mealType: string, dayIndex: number, existingMealName: string, prefCtx?: UserPreferenceContext): string {
  return `Generate a SINGLE replacement ${mealType} meal for Day ${dayIndex} of a meal plan.

The current meal "${existingMealName}" needs to be replaced with something different.

Preferences:
Goal: ${prefs.goal === "weight_loss" ? "Weight Loss" : prefs.goal}
Diet/Cuisine Styles: ${formatDietStyles(prefs)}
Foods to Avoid: ${prefs.foodsToAvoid.length > 0 ? prefs.foodsToAvoid.join(", ") : "None"}
Household Size: ${prefs.householdSize}
Budget Mode: ${prefs.budgetMode}
Cooking Time: ${prefs.cookingTime}
Spice Level: ${prefs.spiceLevel || "medium"}
Authenticity Mode: ${prefs.authenticityMode || "mixed"}
Allergies & Intolerances: ${prefs.allergies || "None"}
${buildPersonalizationBlock(prefs)}

INGREDIENT GUIDELINES:
- Use ingredients readily available at US grocery stores.
- For culturally-specific cuisines, prefer ingredients found in well-stocked US supermarkets.

Return ONLY a JSON meal object:
{
  "name": "string",
  "cuisineTag": "string",
  "prepTimeMinutes": number,
  "servings": ${prefs.householdSize},
  "ingredients": ["short string with quantity"],
  "steps": ["step 1", ..., max 6-8 steps],
  "nutritionEstimateRange": { "calories": "string", "protein_g": "string", "carbs_g": "string", "fat_g": "string" },
  "whyItHelpsGoal": "1 brief sentence"
}${buildPreferenceContextBlock(prefCtx)}`;
}

function buildRegenDayPrompt(prefs: Preferences, dayIndex: number, prefCtx?: UserPreferenceContext): string {
  const mealSlots = getMealSlotsForPrefs(prefs);
  const slotsLabel = mealSlots.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" + ");
  const mealsNote = `Generate only ${slotsLabel}.`;

  return `Generate meals for a SINGLE day (Day ${dayIndex}) of a meal plan. ${mealsNote}

Preferences:
Goal: ${prefs.goal === "weight_loss" ? "Weight Loss" : prefs.goal}
Diet/Cuisine Styles: ${formatDietStyles(prefs)}
Foods to Avoid: ${prefs.foodsToAvoid.length > 0 ? prefs.foodsToAvoid.join(", ") : "None"}
Household Size: ${prefs.householdSize}
Budget Mode: ${prefs.budgetMode}
Cooking Time: ${prefs.cookingTime}
Spice Level: ${prefs.spiceLevel || "medium"}
Authenticity Mode: ${prefs.authenticityMode || "mixed"}
Allergies & Intolerances: ${prefs.allergies || "None"}
${buildPersonalizationBlock(prefs)}

Return ONLY a JSON object:
{
  "dayIndex": ${dayIndex},
  "dayName": "Day ${dayIndex}",
  "meals": {
    ${buildMealsStructure(prefs)}
  }
}

Meal object: { "name", "cuisineTag", "prepTimeMinutes", "servings": ${prefs.householdSize}, "ingredients": ["short string with qty"], "steps": [...max 6-8], "nutritionEstimateRange": { "calories", "protein_g", "carbs_g", "fat_g" }, "whyItHelpsGoal": "1 brief sentence" }${buildPreferenceContextBlock(prefCtx)}`;
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 16000,
  });

  return response.choices[0]?.message?.content || "";
}

function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  return cleaned.trim();
}

export async function generateFullPlan(prefs: Preferences, prefCtx?: UserPreferenceContext, workoutDays?: string[], wellnessCtx?: WellnessContext, constraintBlock?: string): Promise<PlanOutput> {
  let systemPrompt = buildSystemPrompt(prefs);
  if (constraintBlock) {
    systemPrompt += "\n\n" + constraintBlock;
  }
  let userPrompt = buildPlanPrompt(prefs, prefCtx);

  if (wellnessCtx && wellnessCtx.trainingDays.length > 0) {
    userPrompt += buildMealWellnessBlock(wellnessCtx);
  } else if (workoutDays && workoutDays.length > 0) {
    userPrompt += `\n\nWORKOUT-DAY AWARENESS:
The user works out on: ${workoutDays.join(", ")}.
On workout days, provide slightly higher protein and carb portions for recovery.
On rest days, keep meals lighter with more vegetables and moderate portions.
Do NOT drastically change the meal style — just subtly adjust portion guidance in the nutritionEstimateRange.`;
  }

  let raw = await callOpenAI(systemPrompt, userPrompt);
  let cleaned = cleanJsonString(raw);

  try {
    const parsed = JSON.parse(cleaned);
    return planOutputSchema.parse(parsed);
  } catch (firstErr) {
    const repairPrompt = `The following JSON was invalid. Fix it and return ONLY valid JSON matching the required schema. Error: ${firstErr instanceof Error ? firstErr.message : "Parse error"}

Original JSON:
${cleaned}`;

    raw = await callOpenAI(systemPrompt, repairPrompt);
    cleaned = cleanJsonString(raw);
    const parsed = JSON.parse(cleaned);
    return planOutputSchema.parse(parsed);
  }
}

export async function generateSwapMeal(prefs: Preferences, mealType: string, dayIndex: number, existingMealName: string, prefCtx?: UserPreferenceContext): Promise<Meal> {
  const systemPrompt = buildSystemPrompt(prefs);
  const userPrompt = buildSwapMealPrompt(prefs, mealType, dayIndex, existingMealName, prefCtx);

  let raw = await callOpenAI(systemPrompt, userPrompt);
  let cleaned = cleanJsonString(raw);

  try {
    const parsed = JSON.parse(cleaned);
    return mealSchema.parse(parsed);
  } catch (firstErr) {
    const repairPrompt = `Fix this JSON meal object. Return ONLY valid JSON. Error: ${firstErr instanceof Error ? firstErr.message : "Parse error"}\n\n${cleaned}`;
    raw = await callOpenAI(systemPrompt, repairPrompt);
    cleaned = cleanJsonString(raw);
    return mealSchema.parse(JSON.parse(cleaned));
  }
}

export async function generateDayMeals(prefs: Preferences, dayIndex: number, prefCtx?: UserPreferenceContext): Promise<Day> {
  const systemPrompt = buildSystemPrompt(prefs);
  const userPrompt = buildRegenDayPrompt(prefs, dayIndex, prefCtx);

  let raw = await callOpenAI(systemPrompt, userPrompt);
  let cleaned = cleanJsonString(raw);

  try {
    const parsed = JSON.parse(cleaned);
    return daySchema.parse(parsed);
  } catch (firstErr) {
    const repairPrompt = `Fix this JSON day object. Return ONLY valid JSON. Error: ${firstErr instanceof Error ? firstErr.message : "Parse error"}\n\n${cleaned}`;
    raw = await callOpenAI(systemPrompt, repairPrompt);
    cleaned = cleanJsonString(raw);
    return daySchema.parse(JSON.parse(cleaned));
  }
}

export async function generateGroceryPricing(
  grocerySections: GrocerySection[],
  householdSize: number,
  prepStyle: string
): Promise<GroceryPricing> {
  const itemsList = grocerySections
    .flatMap(s => s.items.map(i => `${i.item} — ${i.quantity}`))
    .join("\n");

  const systemPrompt = `You are a grocery pricing estimator. You estimate US average grocery price ranges.

RULES:
- Return ONLY valid JSON. No markdown, no commentary, no code fences.
- Never claim store-specific or live pricing.
- Always return a min/max range per item in USD.
- Keep ranges conservative (not too narrow).
- Set confidence based on how specific the item is (e.g., "salt" = high, "spices" = low).
- Prices should account for the stated household size and quantities.`;

  const userPrompt = `Estimate grocery prices for the following items. Household size: ${householdSize}. Prep style: ${prepStyle}.

Items:
${itemsList}

Return JSON with this exact structure:
{
  "currency": "USD",
  "assumptions": {
    "region": "USA",
    "pricingType": "estimated_ranges",
    "note": "Estimates vary by brand and store; not real-time."
  },
  "items": [
    {
      "itemKey": "lowercase normalized item name",
      "displayName": "Human readable item name",
      "unitHint": "lb|each|dozen|oz|jar|bag",
      "estimatedRange": { "min": 0.00, "max": 0.00 },
      "confidence": "low|medium|high"
    }
  ]
}

Include one entry per grocery item provided. The itemKey should be the item name lowercased, trimmed, punctuation removed, quantity words stripped.`;

  let raw = await callOpenAI(systemPrompt, userPrompt);
  let cleaned = cleanJsonString(raw);

  try {
    const parsed = JSON.parse(cleaned);
    return groceryPricingSchema.parse(parsed);
  } catch (firstErr) {
    const repairPrompt = `Fix this JSON grocery pricing object. Return ONLY valid JSON. Error: ${firstErr instanceof Error ? firstErr.message : "Parse error"}\n\n${cleaned}`;
    raw = await callOpenAI(systemPrompt, repairPrompt);
    cleaned = cleanJsonString(raw);
    return groceryPricingSchema.parse(JSON.parse(cleaned));
  }
}

function buildWorkoutSystemPrompt(): string {
  return `You are a certified fitness coach and workout plan designer. You generate detailed, safe, practical 7-day workout plans.

RULES:
- Return ONLY valid JSON. No markdown, no commentary, no code fences.
- Prioritize proper form and safety over intensity.
- Include warm-up and cool-down for every session.
- Respect equipment/location constraints strictly.
- Never suggest exercises that require equipment the user doesn't have.
- Keep coaching cues to 3 max per session.
- Rest days should have session: null.
- Be encouraging but never make medical claims.`;
}

function buildWorkoutPlanPrompt(prefs: WorkoutPreferences, exerciseContext?: { avoidedExercises: string[]; dislikedExercises: string[] }): string {
  const locationLabels: Record<string, string> = {
    home_none: "Home (no equipment — bodyweight only)",
    home_equipment: "Home (dumbbells and/or resistance bands)",
    gym: "Gym (full equipment: machines, barbells, dumbbells, cables)",
    outdoor: "Outdoor (running, walking, bodyweight, hills)",
    mixed: "Mixed (combination of home, gym, and outdoor)",
  };

  const dayMap: Record<string, number> = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 };
  const workoutDayIndices = prefs.daysOfWeek.map(d => dayMap[d]).filter(Boolean);

  return `Generate a complete 7-day workout plan based on these preferences:

Goal: ${prefs.goal.replace("_", " ")}
Location: ${locationLabels[prefs.location] || prefs.location}
Training Mode: ${prefs.trainingMode}
Focus Areas: ${prefs.focusAreas.join(", ")}
Workout Days: ${prefs.daysOfWeek.join(", ")} (Day indices: ${workoutDayIndices.join(", ")})
Session Length: ${prefs.sessionLength} minutes
Experience Level: ${prefs.experienceLevel}
Limitations/Injuries: ${prefs.limitations || "None"}
${exerciseContext && (exerciseContext.avoidedExercises.length > 0 || exerciseContext.dislikedExercises.length > 0) ? `
EXERCISE PREFERENCES:
${exerciseContext.avoidedExercises.length > 0 ? `- AVOIDED exercises (NEVER include these): ${exerciseContext.avoidedExercises.join(", ")}` : ""}
${exerciseContext.dislikedExercises.length > 0 ? `- Disliked exercises (deprioritize, use only if necessary): ${exerciseContext.dislikedExercises.join(", ")}` : ""}
` : ""}
TRAINING MODE RULES:
- If trainingMode = "strength": sessions MUST be strength-focused (optional short mobility). Include sets, reps, rest periods.
- If trainingMode = "cardio": sessions MUST be cardio-focused. Use time-based exercises, intervals, circuits.
- If trainingMode = "both": alternate or mix strength and cardio intelligently through the week.

LOCATION/EQUIPMENT RULES:
- "home_none": ONLY bodyweight exercises. No dumbbells, no bands, no machines.
- "home_equipment": Bodyweight + dumbbell + resistance band exercises. No machines, no barbells.
- "gym": Full equipment including barbells, machines, cables, dumbbells.
- "outdoor": Running, walking, sprints, hills, bodyweight exercises. No indoor equipment.
- "mixed": Combine freely based on what makes sense per session.

DAY ASSIGNMENT:
- Days ${workoutDayIndices.join(", ")} are workout days: isWorkoutDay=true and session must be provided.
- All other days are rest days: isWorkoutDay=false and session=null.

GOAL ALIGNMENT:
- Weight Loss: combine strength + cardio for maximum calorie burn, moderate intensity.
- Muscle Gain: prioritize strength, progressive overload, adequate rest between sets.
- Performance: balanced conditioning + strength, sport-specific movements.
- Maintenance: moderate intensity, balanced, enjoyable variety.

SAFETY:
- If user reports limitations/injuries, avoid exercises that stress those areas.
- Include proper warm-up (3-5 items) and cool-down (2-4 items) for every session.
- Insert rest if user selected too many consecutive workout days (add note in progression).

Return a JSON object with this exact structure:
{
  "title": "string - catchy workout plan title",
  "summary": "string - 2-3 sentences summarizing the plan approach",
  "preferencesEcho": { copy of preferences },
  "days": [
    {
      "dayIndex": 1-7,
      "dayName": "Day 1" through "Day 7",
      "isWorkoutDay": boolean,
      "session": null OR {
        "mode": "strength"|"cardio"|"mixed",
        "focus": "string describing session focus",
        "durationMinutes": number,
        "intensity": "easy"|"moderate"|"hard",
        "warmup": ["warm-up item 1", ...] (3-5 items),
        "main": [
          {
            "name": "exercise name",
            "type": "strength"|"cardio"|"mobility",
            "sets": number or null,
            "reps": "string or null (e.g. '8-12', '10 each side')",
            "time": "string or null (e.g. '30 seconds', '5 minutes')",
            "restSeconds": number or null,
            "notes": "string or null (form cues, modifications)"
          }
        ],
        "finisher": ["optional finisher item"] (optional array),
        "cooldown": ["cool-down item 1", ...] (2-4 items),
        "coachingCues": ["cue 1", "cue 2"] (max 3, optional)
      }
    }
  ],
  "progressionNotes": [
    "string - week-to-week guidance" (max 4 items)
  ]
}`;
}

export async function generateWorkoutPlan(prefs: WorkoutPreferences, exerciseContext?: { avoidedExercises: string[]; dislikedExercises: string[] }, wellnessCtx?: WellnessContext, constraintBlock?: string): Promise<WorkoutPlanOutput> {
  let systemPrompt = buildWorkoutSystemPrompt();
  if (constraintBlock) {
    systemPrompt += "\n\n" + constraintBlock;
  }
  let userPrompt = buildWorkoutPlanPrompt(prefs, exerciseContext);

  if (wellnessCtx) {
    userPrompt += buildWorkoutWellnessBlock(wellnessCtx);
  }

  let raw = await callOpenAI(systemPrompt, userPrompt);
  let cleaned = cleanJsonString(raw);

  try {
    const parsed = JSON.parse(cleaned);
    return workoutPlanOutputSchema.parse(parsed);
  } catch (firstErr) {
    const repairPrompt = `The following JSON was invalid. Fix it and return ONLY valid JSON matching the required schema. Error: ${firstErr instanceof Error ? firstErr.message : "Parse error"}

Original JSON:
${cleaned}`;

    raw = await callOpenAI(systemPrompt, repairPrompt);
    cleaned = cleanJsonString(raw);
    const parsed = JSON.parse(cleaned);
    return workoutPlanOutputSchema.parse(parsed);
  }
}

export async function generateWorkoutSession(
  prefs: WorkoutPreferences,
  dayIndex: number,
  currentSession: WorkoutSession,
  exerciseContext?: { avoidedExercises: string[]; dislikedExercises: string[] },
): Promise<WorkoutSession> {
  const systemPrompt = buildWorkoutSystemPrompt();

  const locationLabels: Record<string, string> = {
    home_none: "Home (no equipment — bodyweight only)",
    home_equipment: "Home (dumbbells and/or resistance bands)",
    gym: "Gym (full equipment: machines, barbells, dumbbells, cables)",
    outdoor: "Outdoor (running, walking, bodyweight, hills)",
    mixed: "Mixed (combination of home, gym, and outdoor)",
  };

  const userPrompt = `Regenerate a SINGLE workout session for Day ${dayIndex} of a 7-day workout plan.

The current session for this day was:
- Focus: ${currentSession.focus}
- Mode: ${currentSession.mode}
- Duration: ${currentSession.durationMinutes} min
- Intensity: ${currentSession.intensity}
- Exercises: ${currentSession.main.map(e => e.name).join(", ")}

Generate a DIFFERENT session that keeps the same general intent but uses different exercises and structure. Make it feel fresh.

User Preferences:
Goal: ${prefs.goal.replace("_", " ")}
Location: ${locationLabels[prefs.location] || prefs.location}
Training Mode: ${prefs.trainingMode}
Focus Areas: ${prefs.focusAreas.join(", ")}
Session Length: ${prefs.sessionLength} minutes
Experience Level: ${prefs.experienceLevel}
Limitations/Injuries: ${prefs.limitations || "None"}
${exerciseContext && (exerciseContext.avoidedExercises.length > 0 || exerciseContext.dislikedExercises.length > 0) ? `
EXERCISE PREFERENCES:
${exerciseContext.avoidedExercises.length > 0 ? `- AVOIDED exercises (NEVER include these): ${exerciseContext.avoidedExercises.join(", ")}` : ""}
${exerciseContext.dislikedExercises.length > 0 ? `- Disliked exercises (deprioritize): ${exerciseContext.dislikedExercises.join(", ")}` : ""}
` : ""}
Return ONLY a JSON object for the session (NOT the full plan) with this structure:
{
  "mode": "strength"|"cardio"|"mixed",
  "focus": "string describing session focus",
  "durationMinutes": number,
  "intensity": "easy"|"moderate"|"hard",
  "warmup": ["warm-up item 1", ...] (3-5 items),
  "main": [
    {
      "name": "exercise name",
      "type": "strength"|"cardio"|"mobility",
      "sets": number or null,
      "reps": "string or null",
      "time": "string or null",
      "restSeconds": number or null,
      "notes": "string or null"
    }
  ],
  "finisher": ["optional finisher item"],
  "cooldown": ["cool-down item 1", ...] (2-4 items),
  "coachingCues": ["cue 1", "cue 2"] (max 3)
}`;

  let raw = await callOpenAI(systemPrompt, userPrompt);
  let cleaned = cleanJsonString(raw);

  try {
    const parsed = JSON.parse(cleaned);
    return workoutSessionSchema.parse(parsed);
  } catch (firstErr) {
    const repairPrompt = `The following JSON was invalid. Fix it and return ONLY valid JSON matching the required workout session schema. Error: ${firstErr instanceof Error ? firstErr.message : "Parse error"}\n\nOriginal JSON:\n${cleaned}`;
    raw = await callOpenAI(systemPrompt, repairPrompt);
    cleaned = cleanJsonString(raw);
    const parsed = JSON.parse(cleaned);
    return workoutSessionSchema.parse(parsed);
  }
}

export interface DailyMealInput {
  date: string;
  mealsPerDay: 2 | 3;
  goal: string;
  dietStyles?: string[];
  foodsToAvoid?: string[];
  allergiesIntolerances?: string[];
  spiceLevel?: string;
  cookingTime?: string;
  budgetMode?: string;
  age?: number;
  currentWeight?: number;
  targetWeight?: number;
  weightUnit?: string;
  constraintBlock?: string;
}

export interface DailyMealOutput {
  title: string;
  date: string;
  meals: Record<string, {
    name: string;
    cuisineTag: string;
    prepTimeMinutes: number;
    servings: number;
    ingredients: string[];
    steps: string[];
    nutritionEstimateRange: { calories: string; protein_g: string; carbs_g: string; fat_g: string };
    whyItHelpsGoal: string;
  }>;
  nutritionSummary: { calories: string; protein_g: string; carbs_g: string; fat_g: string };
}

export async function generateSingleDayMeals(input: DailyMealInput, prefCtx?: UserPreferenceContext): Promise<DailyMealOutput> {
  const mealSlots = input.mealsPerDay === 2 ? ["lunch", "dinner"] : ["breakfast", "lunch", "dinner"];
  const slotsLabel = mealSlots.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" + ");

  let systemPrompt = `You are a professional meal planning nutritionist. You generate detailed, practical single-day meal plans.

RULES:
- Return ONLY valid JSON. No markdown, no commentary, no code fences.
- Always respect foodsToAvoid and allergies/intolerances — never include them as ingredients.
- Keep ingredients realistic and accessible at US grocery stores.
- Each meal must have 6-8 steps maximum. Keep steps concise.
- Keep ingredient lines short (quantity + ingredient name only).`;

  if (input.age && input.age < 18) {
    systemPrompt += `\n\nIMPORTANT: This user is under 18. Use supportive, non-prescriptive language. Avoid "diet", "restrict", "deficit". Focus on balanced growth.`;
  }

  if (input.constraintBlock) {
    systemPrompt += "\n\n" + input.constraintBlock;
  }

  const dateLabel = new Date(input.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  let userPrompt = `Generate meals for a SINGLE day (${dateLabel}). Generate only ${slotsLabel} (${input.mealsPerDay} meals).

Goal: ${input.goal.replace("_", " ")}
Diet/Cuisine Styles: ${input.dietStyles?.join(", ") || "No preference"}
Foods to Avoid: ${input.foodsToAvoid?.length ? input.foodsToAvoid.join(", ") : "None"}
Allergies & Intolerances: ${input.allergiesIntolerances?.length ? input.allergiesIntolerances.join(", ") : "None"}
Spice Level: ${input.spiceLevel || "medium"}
Cooking Time: ${input.cookingTime || "normal"}
Budget Mode: ${input.budgetMode || "normal"}
${input.age ? `Age: ${input.age}` : ""}
${input.currentWeight ? `Current Weight: ${input.currentWeight} ${input.weightUnit || "lb"}` : ""}
${input.targetWeight ? `Target Weight: ${input.targetWeight} ${input.weightUnit || "lb"}` : ""}

Return ONLY a JSON object:
{
  "title": "Daily Meal — ${dateLabel}",
  "date": "${input.date}",
  "meals": {
    ${mealSlots.map(s => `"${s}": { meal object }`).join(",\n    ")}
  },
  "nutritionSummary": { "calories": "range", "protein_g": "range", "carbs_g": "range", "fat_g": "range" }
}

Meal object: { "name", "cuisineTag", "prepTimeMinutes", "servings": 1, "ingredients": ["short string with qty"], "steps": [...max 6-8], "nutritionEstimateRange": { "calories", "protein_g", "carbs_g", "fat_g" }, "whyItHelpsGoal": "1 brief sentence" }`;

  if (prefCtx) {
    userPrompt += buildPreferenceContextBlock(prefCtx);
  }

  let raw = await callOpenAI(systemPrompt, userPrompt);
  let cleaned = cleanJsonString(raw);

  try {
    const parsed = JSON.parse(cleaned);
    return parsed as DailyMealOutput;
  } catch (firstErr) {
    const repairPrompt = `The following JSON was invalid. Fix it and return ONLY valid JSON. Error: ${firstErr instanceof Error ? firstErr.message : "Parse error"}\n\nOriginal JSON:\n${cleaned}`;
    raw = await callOpenAI(systemPrompt, repairPrompt);
    cleaned = cleanJsonString(raw);
    return JSON.parse(cleaned) as DailyMealOutput;
  }
}

export interface DailyWorkoutInput {
  date: string;
  goal: string;
  location?: string;
  trainingMode?: string;
  focusAreas?: string[];
  sessionLength?: number;
  experienceLevel?: string;
  healthConstraints?: string[];
  constraintBlock?: string;
}

export async function generateSingleDayWorkout(input: DailyWorkoutInput, exerciseContext?: { avoidedExercises: string[]; dislikedExercises: string[] }): Promise<WorkoutSession> {
  let systemPrompt = buildWorkoutSystemPrompt();
  if (input.constraintBlock) {
    systemPrompt += "\n\n" + input.constraintBlock;
  }

  const locationLabels: Record<string, string> = {
    home_none: "Home (no equipment — bodyweight only)",
    home_equipment: "Home (dumbbells and/or resistance bands)",
    gym: "Gym (full equipment: machines, barbells, dumbbells, cables)",
    outdoor: "Outdoor (running, walking, bodyweight, hills)",
    mixed: "Mixed (combination of home, gym, and outdoor)",
  };

  const dateLabel = new Date(input.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const userPrompt = `Generate a SINGLE workout session for ${dateLabel}.

Goal: ${input.goal.replace("_", " ")}
Location: ${locationLabels[input.location || "gym"] || input.location || "Gym"}
Training Mode: ${input.trainingMode || "both"}
Focus Areas: ${input.focusAreas?.join(", ") || "Full Body"}
Session Length: ${input.sessionLength || 45} minutes
Experience Level: ${input.experienceLevel || "intermediate"}
Injuries/Limitations: ${input.healthConstraints?.length ? input.healthConstraints.join(", ") : "None"}
${exerciseContext && (exerciseContext.avoidedExercises.length > 0 || exerciseContext.dislikedExercises.length > 0) ? `
EXERCISE PREFERENCES:
${exerciseContext.avoidedExercises.length > 0 ? `- AVOIDED exercises (NEVER include): ${exerciseContext.avoidedExercises.join(", ")}` : ""}
${exerciseContext.dislikedExercises.length > 0 ? `- Disliked exercises (deprioritize): ${exerciseContext.dislikedExercises.join(", ")}` : ""}
` : ""}
Return ONLY a JSON object for the session:
{
  "mode": "strength"|"cardio"|"mixed",
  "focus": "string describing session focus",
  "durationMinutes": number,
  "intensity": "easy"|"moderate"|"hard",
  "warmup": ["warm-up item 1", ...] (3-5 items),
  "main": [
    {
      "name": "exercise name",
      "type": "strength"|"cardio"|"mobility",
      "sets": number or null,
      "reps": "string or null",
      "time": "string or null",
      "restSeconds": number or null,
      "notes": "string or null"
    }
  ],
  "finisher": ["optional finisher item"],
  "cooldown": ["cool-down item 1", ...] (2-4 items),
  "coachingCues": ["cue 1", "cue 2"] (max 3)
}`;

  let raw = await callOpenAI(systemPrompt, userPrompt);
  let cleaned = cleanJsonString(raw);

  try {
    const parsed = JSON.parse(cleaned);
    return workoutSessionSchema.parse(parsed);
  } catch (firstErr) {
    const repairPrompt = `The following JSON was invalid. Fix it and return ONLY valid JSON matching the workout session schema. Error: ${firstErr instanceof Error ? firstErr.message : "Parse error"}\n\nOriginal JSON:\n${cleaned}`;
    raw = await callOpenAI(systemPrompt, repairPrompt);
    cleaned = cleanJsonString(raw);
    return workoutSessionSchema.parse(JSON.parse(cleaned));
  }
}

export function rebuildGroceryList(planJson: PlanOutput): PlanOutput["groceryList"] {
  const ingredientMap = new Map<string, Set<string>>();
  const categorize = (ingredient: string): string => {
    const lower = ingredient.toLowerCase();
    if (/chicken|beef|pork|fish|shrimp|turkey|salmon|tuna|lamb|tofu|tempeh|egg/i.test(lower)) return "Protein";
    if (/milk|cheese|yogurt|cream|butter/i.test(lower)) return "Dairy";
    if (/salt|pepper|cumin|paprika|oregano|thyme|cinnamon|garlic powder|onion powder|chili|turmeric|basil|rosemary/i.test(lower)) return "Spices & Seasonings";
    if (/rice|pasta|bread|flour|oats|quinoa|tortilla|noodle|cereal/i.test(lower)) return "Grains & Pantry";
    if (/oil|vinegar|sauce|soy|honey|maple|sugar|stock|broth/i.test(lower)) return "Oils & Condiments";
    return "Produce";
  };

  for (const day of planJson.days) {
    const mealTypes = ["breakfast", "lunch", "dinner"] as const;
    for (const mealType of mealTypes) {
      const meal = day.meals[mealType];
      if (!meal) continue;
      for (const ing of meal.ingredients) {
        const category = categorize(ing);
        if (!ingredientMap.has(category)) {
          ingredientMap.set(category, new Set());
        }
        ingredientMap.get(category)!.add(ing);
      }
    }
  }

  const sections = Array.from(ingredientMap.entries()).map(([name, items]) => ({
    name,
    items: Array.from(items).map(item => ({
      item: item.replace(/^[\d./\s]+(cup|cups|tbsp|tsp|oz|lb|lbs|g|kg|ml|l|bunch|head|clove|cloves|can|cans|pkg|package|piece|pieces|slice|slices)s?\s*/i, "").trim() || item,
      quantity: item,
      notes: undefined as string | undefined,
    })),
  }));

  return { sections };
}
