import OpenAI from "openai";
import { planOutputSchema, mealSchema, daySchema, groceryPricingSchema, type Preferences, type PlanOutput, type Meal, type Day, type UserPreferenceContext, type GroceryPricing, type GrocerySection } from "@shared/schema";

if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY is not set. AI features will not work.");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "missing" });

function buildSystemPrompt(prefs: Preferences): string {
  const isMinor = prefs.age !== undefined && prefs.age < 18;

  let base = `You are a professional meal planning nutritionist. You generate detailed, practical 7-day meal plans.

RULES:
- Return ONLY valid JSON. No markdown, no commentary, no code fences.
- Always respect foodsToAvoid and allergies — never include them as ingredients or feature them in meals.
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
- Keep nutrition explanation concise (2-3 reasons max).`;

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
  if (prefs.workoutDaysPerWeek !== undefined && prefs.workoutDaysPerWeek !== null) {
    parts.push(`Workout Days/Week: ${prefs.workoutDaysPerWeek}`);
  }

  if (parts.length === 0) return "";

  let block = `\nPersonalization:\n${parts.join("\n")}`;
  block += `\n\nADAPTATION GUIDELINES:`;
  block += `\n- Adjust portion sizes and macro ranges based on the user's weight, goal, and activity level.`;

  if (prefs.workoutDaysPerWeek !== undefined && prefs.workoutDaysPerWeek >= 4) {
    block += `\n- This user is active (${prefs.workoutDaysPerWeek} workout days/week). Increase protein portions and overall calories slightly.`;
  } else if (prefs.workoutDaysPerWeek !== undefined && prefs.workoutDaysPerWeek <= 1) {
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
Meals Per Day: ${prefs.mealsPerDay || 3} — ${mealsNote}
Allergies: ${prefs.allergies || "None"}
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
Allergies: ${prefs.allergies || "None"}
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
Allergies: ${prefs.allergies || "None"}
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

export async function generateFullPlan(prefs: Preferences, prefCtx?: UserPreferenceContext): Promise<PlanOutput> {
  const systemPrompt = buildSystemPrompt(prefs);
  const userPrompt = buildPlanPrompt(prefs, prefCtx);

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
