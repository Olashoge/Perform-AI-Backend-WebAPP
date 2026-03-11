import OpenAI from "openai";
import { planOutputSchema, workoutPlanOutputSchema, workoutSessionSchema, type Preferences, type PlanOutput, type UserPreferenceContext, type WorkoutPreferences, type WorkoutPlanOutput, type WorkoutSession } from "@shared/schema";
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
    } else if (prefs.goal === "muscle_gain") {
      block += `\n- For muscle gain: include adequate carbs on workout days to fuel training and recovery. Post-workout meals with fast-digesting carbs + protein encouraged. Maintain caloric surplus on training days.`;
    } else if (prefs.goal === "body_recomposition") {
      block += `\n- For body recomposition: cycle carbs — higher on training days, lower on rest days. Overall calories near maintenance. Prioritize lean protein at every meal.`;
    } else if (prefs.goal === "athletic_performance" || prefs.goal === "performance") {
      block += `\n- For athletic performance: carb timing is key. Prioritize pre- and post-workout carb availability. Match calorie intake to training load.`;
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

function buildBodyContextBlock(bodyContext?: string): string {
  if (!bodyContext || bodyContext.trim() === "") return "";
  return `\n\nIMPORTANT USER CONTEXT (MUST FOLLOW):\n${bodyContext.trim()}\n`;
}

function buildEquipmentBlock(location?: string, equipment?: string[], notes?: string): string {
  if (!location && (!equipment || equipment.length === 0) && !notes) return "";
  const parts: string[] = ["\n\nAVAILABLE EQUIPMENT (MUST USE):"];
  if (location) parts.push(`Workout Location: ${location}`);
  if (equipment && equipment.length > 0) {
    parts.push(`Available Equipment: ${equipment.join(", ")}`);
    parts.push("IMPORTANT: Only prescribe exercises using the equipment listed above. If an exercise requires unlisted equipment, provide a bodyweight alternative.");
  }
  if (notes && notes.trim()) parts.push(`Additional Equipment Notes: ${notes.trim()}`);
  return parts.join("\n");
}

export async function generateFullPlan(prefs: Preferences, prefCtx?: UserPreferenceContext, workoutDays?: string[], wellnessCtx?: WellnessContext, constraintBlock?: string, profileExtras?: { bodyContext?: string }): Promise<PlanOutput> {
  let systemPrompt = buildSystemPrompt(prefs);
  if (constraintBlock) {
    systemPrompt += "\n\n" + constraintBlock;
  }
  let userPrompt = buildPlanPrompt(prefs, prefCtx);
  if (profileExtras?.bodyContext) {
    userPrompt += buildBodyContextBlock(profileExtras.bodyContext);
  }

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

function buildSecondaryFocusBlock(secondaryFocus?: string | null): string {
  if (!secondaryFocus) return "";

  const focusInstructions: Record<string, string> = {
    strength: `
SECONDARY FOCUS: Strength
Apply the following modifiers to ALL workout sessions:
- Exercise Selection: Prioritize compound, multi-joint lifts (squats, deadlifts, bench press, overhead press, rows, pull-ups). Minimize isolation work. Include power-dominant movements where appropriate.
- Warmup Structure: Dynamic joint mobility + CNS activation (e.g., hip circles, banded walks, box jumps or explosive jumps at low rep count) before main work. 5-8 minutes minimum.
- Rep Ranges: Hypertrophy-strength hybrid: 4-6 sets of 3-6 reps for primary lifts. Accessory work at 3-4 sets of 6-10 reps. Avoid endurance-range (15+) sets for primary movements.
- Rest Intervals: 2-4 minutes between heavy compound sets. 60-90s between accessory exercises.
- Cardio Bias: Minimal dedicated cardio. If cardio is included, keep it short (10-15 min) and low-impact (walk, bike) to preserve recovery for strength work.
- Mobility Blocks: Brief focused mobility (5 min max) targeting session-specific joints (e.g., hip flexors before lower body, thoracic rotation before upper body). Do not sacrifice main work time for mobility.`,

    endurance: `
SECONDARY FOCUS: Endurance
Apply the following modifiers to ALL workout sessions:
- Exercise Selection: Include sustained-effort cardio movements (running, rowing, cycling, jump rope) alongside strength work. Use circuit formats and supersets to maintain elevated heart rate.
- Warmup Structure: Gradual aerobic warm-up (light jog, jump rope, or rowing at low intensity) for 5-8 minutes before main work to prime cardiovascular system.
- Rep Ranges: Higher rep ranges for strength work: 3 sets of 12-20 reps with short rest. Circuit sets acceptable. Prioritize muscular endurance over max strength.
- Rest Intervals: Short rest periods: 30-45s between exercises, 60s maximum between circuits. This is critical for cardiovascular adaptation.
- Cardio Bias: High — include at least 1 dedicated cardio block (20-40 min) per workout day. On non-cardio days, add a 10-15 min conditioning finisher.
- Mobility Blocks: Include dynamic stretching in warm-up (leg swings, arm circles). Post-session static stretching for major muscle groups (3-5 min) to aid recovery between high-frequency sessions.`,

    mobility: `
SECONDARY FOCUS: Mobility
Apply the following modifiers to ALL workout sessions:
- Exercise Selection: Include movement-quality exercises alongside standard training: lunges with thoracic rotation, deep squat holds, hip 90/90 stretches, shoulder CARs (controlled articular rotations). Use yoga-inspired flows as accessory work.
- Warmup Structure: Extended, multi-plane warm-up (8-12 minutes): foam rolling/self-myofascial release (2-3 min), joint circles (2 min), dynamic flow sequence (3-5 min). This is non-negotiable — every session starts with it.
- Rep Ranges: Standard for main lifts. Add 2-3 mobility-focused exercises per session at 2 sets of 8-10 slow, controlled reps with a 2-second hold at end range.
- Rest Intervals: Normal for main work. During rest periods, cue the user to perform a passive stretch for the muscles just worked.
- Cardio Bias: Prefer low-impact cardio (cycling, swimming, elliptical) over high-impact running to protect joints and support range of motion development.
- Mobility Blocks: Mandatory dedicated cool-down mobility block (8-10 min) for EVERY session. Target the joints used in that session. Include at least 2-3 specific stretches/holds in the cooldown array.`,

    energy_focus: `
SECONDARY FOCUS: Energy & Focus
Apply the following modifiers to ALL workout sessions:
- Exercise Selection: Prefer moderate-intensity, varied exercise formats that prevent monotony: circuit training, functional movements, compound lifts mixed with movement variety. Avoid high-monotony exercise (e.g., 5 sets of the same isolated movement). Include breathing exercises or mindfulness cues.
- Warmup Structure: Full-body activation warm-up (5-8 min) emphasizing blood flow and mental preparation: light cardio, dynamic stretching, 1-2 activation exercises. Keep it rhythmic.
- Rep Ranges: Moderate rep ranges (8-15) at 70-80% intensity. Prioritize consistent, clean form over maximal loads. Avoid training to failure — leaves user energized, not depleted.
- Rest Intervals: 60-90s rest. Use active recovery during rest (light walking, breathing, low-intensity stretch). No prolonged sitting between sets.
- Cardio Bias: Moderate — include light to moderate cardio blocks (15-25 min) that boost energy without excessive fatigue. Prefer steady-state or moderate interval work over all-out HIIT.
- Mobility Blocks: Include a 3-5 min mindful cool-down with slow, deliberate stretching and breathing cues. This is part of the energy recovery loop and should be in every session's cooldown.`,

    recovery: `
SECONDARY FOCUS: Recovery
Apply the following modifiers to ALL workout sessions:
- Exercise Selection: Prioritize movements that promote blood flow and tissue recovery without creating additional fatigue: sled pushes (light), bodyweight squats, light Romanian deadlifts, resistance band work, and active stretching. Avoid heavy eccentric loading or maximum-effort sets on consecutive days.
- Warmup Structure: Gentle progressive warm-up (8-10 minutes): foam rolling, light joint mobility, low-intensity activation. No explosive or aggressive CNS-activation movements.
- Rep Ranges: Conservative volume: 2-3 sets of 10-15 reps at 60-70% intensity. Focus on movement quality and full range of motion over load. Moderate weekly volume increase (no more than 5-10% per week).
- Rest Intervals: Generous rest: 90s-2 minutes between all sets. No rushed circuits. Heart rate should not spike excessively.
- Cardio Bias: Low-moderate. Include 15-20 min of low-intensity steady-state cardio (walking, light cycling) on workout days. Avoid HIIT or sprint intervals.
- Mobility Blocks: Extended cool-down (10-15 min) for every session covering full-body major muscle groups. Incorporate parasympathetic breathing cues (e.g., "exhale for 4 counts"). This is integral to the recovery protocol.`,
  };

  return focusInstructions[secondaryFocus] || "";
}

function buildWorkoutPlanPrompt(prefs: WorkoutPreferences, exerciseContext?: { avoidedExercises: string[]; dislikedExercises: string[] }, secondaryFocus?: string | null): string {
  const locationLabels: Record<string, string> = {
    gym: "Gym",
    home: "Home",
    outdoors: "Outdoors",
  };

  const dayMap: Record<string, number> = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 };
  const workoutDayIndices = prefs.daysOfWeek.map(d => dayMap[d]).filter(Boolean);

  const goalLabel = prefs.goal.replace(/_/g, " ");

  return `Generate a complete 7-day workout plan based on these preferences:

Goal: ${goalLabel}
Location: ${locationLabels[prefs.location] || prefs.location || "Not specified"}
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
- "gym": Full equipment including barbells, machines, cables, dumbbells.
- "home": Use only equipment available at home (bodyweight, dumbbells, bands, etc. based on equipment list).
- "outdoors": Running, walking, sprints, hills, bodyweight exercises. No indoor equipment.

DAY ASSIGNMENT:
- Days ${workoutDayIndices.join(", ")} are workout days: isWorkoutDay=true and session must be provided.
- All other days are rest days: isWorkoutDay=false and session=null.

GOAL ALIGNMENT:
- Weight Loss: combine strength + cardio for calorie burn, moderate intensity, short rest periods (45-60s), circuit-friendly.
- Muscle Gain: prioritize compound strength movements, progressive overload, long rest periods (90s-3min), volume emphasis.
- Body Recomposition: hybrid approach — compound lifts + conditioning circuits, moderate rest (60-90s), balanced volume.
- General Fitness: balanced variety, moderate intensity, enjoyable movements, 60-90s rest, consistency over intensity.
- Athletic Performance: sport-specific conditioning, power/speed movements, periodized intensity, mobility integration.

SAFETY:
- If user reports limitations/injuries, avoid exercises that stress those areas.
- Include proper warm-up (3-5 items) and cool-down (2-4 items) for every session.
- Insert rest if user selected too many consecutive workout days (add note in progression).${buildSecondaryFocusBlock(secondaryFocus)}

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

export async function generateWorkoutPlan(prefs: WorkoutPreferences, exerciseContext?: { avoidedExercises: string[]; dislikedExercises: string[] }, wellnessCtx?: WellnessContext, constraintBlock?: string, profileExtras?: { bodyContext?: string; workoutLocation?: string; equipment?: string[]; equipmentNotes?: string }): Promise<WorkoutPlanOutput> {
  let systemPrompt = buildWorkoutSystemPrompt();
  if (constraintBlock) {
    systemPrompt += "\n\n" + constraintBlock;
  }
  let userPrompt = buildWorkoutPlanPrompt(prefs, exerciseContext, wellnessCtx?.secondaryFocus);
  if (profileExtras?.bodyContext) {
    userPrompt += buildBodyContextBlock(profileExtras.bodyContext);
  }
  if (profileExtras) {
    userPrompt += buildEquipmentBlock(profileExtras.workoutLocation, profileExtras.equipment, profileExtras.equipmentNotes);
  }

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
  secondaryFocus?: string | null;
  location?: string;
  trainingMode?: string;
  focusAreas?: string[];
  sessionLength?: number;
  experienceLevel?: string;
  healthConstraints?: string[];
  constraintBlock?: string;
}

export async function generateSingleDayWorkout(input: DailyWorkoutInput, exerciseContext?: { avoidedExercises: string[]; dislikedExercises: string[] }, profileExtras?: { bodyContext?: string; workoutLocation?: string; equipment?: string[]; equipmentNotes?: string }): Promise<WorkoutSession> {
  let systemPrompt = buildWorkoutSystemPrompt();
  if (input.constraintBlock) {
    systemPrompt += "\n\n" + input.constraintBlock;
  }

  const locationLabels: Record<string, string> = {
    gym: "Gym",
    home: "Home",
    outdoors: "Outdoors",
  };

  const dateLabel = new Date(input.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const userPrompt = `Generate a SINGLE workout session for ${dateLabel}.

Goal: ${input.goal.replace(/_/g, " ")}
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
${profileExtras?.bodyContext ? buildBodyContextBlock(profileExtras.bodyContext) : ""}${profileExtras ? buildEquipmentBlock(profileExtras.workoutLocation, profileExtras.equipment, profileExtras.equipmentNotes) : ""}${buildSecondaryFocusBlock(input.secondaryFocus)}
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
