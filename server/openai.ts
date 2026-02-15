import OpenAI from "openai";
import { planOutputSchema, mealSchema, daySchema, type Preferences, type PlanOutput, type Meal, type Day } from "@shared/schema";

if (!process.env.OPENAI_API_KEY) {
  console.warn("WARNING: OPENAI_API_KEY is not set. AI features will not work.");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "missing" });

function buildSystemPrompt(): string {
  return `You are a professional meal planning nutritionist. You generate detailed, practical 7-day meal plans.

RULES:
- Return ONLY valid JSON. No markdown, no commentary, no code fences.
- Always respect foodsToAvoid and allergies — never include them.
- Keep ingredients realistic and accessible.
- Budget mode: reduce specialty ingredients, keep meals simple.
- Family mode (householdSize > 2): avoid overly spicy options unless dietStyle explicitly implies spice.
- Each meal must have 5-10 steps maximum.
- Scale servings to match householdSize.
- Quick cooking time means each meal should be under 30 minutes.`;
}

function buildPlanPrompt(prefs: Preferences): string {
  return `Generate a complete 7-day meal plan based on these preferences:

Goal: ${prefs.goal}
Diet/Cuisine Style: ${prefs.dietStyle}
Foods to Avoid: ${prefs.foodsToAvoid.length > 0 ? prefs.foodsToAvoid.join(", ") : "None"}
Household Size: ${prefs.householdSize}
Prep Style: ${prefs.prepStyle}
Budget Mode: ${prefs.budgetMode}
Cooking Time: ${prefs.cookingTime}
Allergies: ${prefs.allergies || "None"}

Return a JSON object with this exact structure:
{
  "title": "string - catchy plan title",
  "summary": "string - 2-4 sentences summarizing the plan",
  "preferencesEcho": { copy of the preferences above as an object },
  "days": [
    {
      "dayIndex": 1-7,
      "dayName": "Day 1" through "Day 7",
      "meals": {
        "breakfast": { meal object },
        "lunch": { meal object },
        "dinner": { meal object }
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
    "howThisSupportsGoal": ["reason 1", "reason 2", ...]
  }
}

Meal object structure:
{
  "name": "string",
  "cuisineTag": "string",
  "prepTimeMinutes": number,
  "servings": number (scaled to householdSize of ${prefs.householdSize}),
  "ingredients": ["string with quantity included"],
  "steps": ["step 1", ..., max 10 steps],
  "nutritionEstimateRange": { "calories": "string", "protein_g": "string", "carbs_g": "string", "fat_g": "string" },
  "whyItHelpsGoal": "1-2 sentences"
}`;
}

function buildSwapMealPrompt(prefs: Preferences, mealType: string, dayIndex: number, existingMealName: string): string {
  return `Generate a SINGLE replacement ${mealType} meal for Day ${dayIndex} of a meal plan.

The current meal "${existingMealName}" needs to be replaced with something different.

Preferences:
Goal: ${prefs.goal}
Diet/Cuisine Style: ${prefs.dietStyle}
Foods to Avoid: ${prefs.foodsToAvoid.length > 0 ? prefs.foodsToAvoid.join(", ") : "None"}
Household Size: ${prefs.householdSize}
Budget Mode: ${prefs.budgetMode}
Cooking Time: ${prefs.cookingTime}
Allergies: ${prefs.allergies || "None"}

Return ONLY a JSON meal object:
{
  "name": "string",
  "cuisineTag": "string",
  "prepTimeMinutes": number,
  "servings": ${prefs.householdSize},
  "ingredients": ["string with quantity"],
  "steps": ["step 1", ..., max 10],
  "nutritionEstimateRange": { "calories": "string", "protein_g": "string", "carbs_g": "string", "fat_g": "string" },
  "whyItHelpsGoal": "1-2 sentences"
}`;
}

function buildRegenDayPrompt(prefs: Preferences, dayIndex: number): string {
  return `Generate meals for a SINGLE day (Day ${dayIndex}) of a meal plan.

Preferences:
Goal: ${prefs.goal}
Diet/Cuisine Style: ${prefs.dietStyle}
Foods to Avoid: ${prefs.foodsToAvoid.length > 0 ? prefs.foodsToAvoid.join(", ") : "None"}
Household Size: ${prefs.householdSize}
Budget Mode: ${prefs.budgetMode}
Cooking Time: ${prefs.cookingTime}
Allergies: ${prefs.allergies || "None"}

Return ONLY a JSON object:
{
  "dayIndex": ${dayIndex},
  "dayName": "Day ${dayIndex}",
  "meals": {
    "breakfast": { meal object },
    "lunch": { meal object },
    "dinner": { meal object }
  }
}

Meal object: { "name", "cuisineTag", "prepTimeMinutes", "servings": ${prefs.householdSize}, "ingredients": [...], "steps": [...max 10], "nutritionEstimateRange": { "calories", "protein_g", "carbs_g", "fat_g" }, "whyItHelpsGoal" }`;
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

export async function generateFullPlan(prefs: Preferences): Promise<PlanOutput> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildPlanPrompt(prefs);

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

export async function generateSwapMeal(prefs: Preferences, mealType: string, dayIndex: number, existingMealName: string): Promise<Meal> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildSwapMealPrompt(prefs, mealType, dayIndex, existingMealName);

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

export async function generateDayMeals(prefs: Preferences, dayIndex: number): Promise<Day> {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildRegenDayPrompt(prefs, dayIndex);

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
    for (const mealType of ["breakfast", "lunch", "dinner"] as const) {
      const meal = day.meals[mealType];
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
