const KEY_INGREDIENTS = [
  "chicken", "beef", "pork", "fish", "salmon", "tuna", "shrimp", "turkey", "lamb",
  "tofu", "tempeh", "egg", "eggs",
  "beans", "lentils", "chickpeas",
  "milk", "cheese", "yogurt", "cream",
  "rice", "pasta", "bread", "quinoa", "oats",
  "avocado", "mushroom", "mushrooms",
];

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function generateMealFingerprint(mealName: string, cuisineTag: string, ingredients?: string[]): string {
  const namePart = slugify(mealName);
  const cuisinePart = slugify(cuisineTag);
  let proteinPart = "none";
  if (ingredients && ingredients.length > 0) {
    const combined = ingredients.join(" ").toLowerCase();
    for (const key of KEY_INGREDIENTS) {
      if (combined.includes(key)) {
        proteinPart = key;
        break;
      }
    }
  }
  return `${namePart}|${cuisinePart}|${proteinPart}`;
}

export function normalizeItemKey(item: string): string {
  let key = item.toLowerCase().trim();
  key = key.replace(/[^\w\s]/g, "");
  key = key.replace(/^\d+[\s./]*\s*(cup|cups|tbsp|tsp|oz|lb|lbs|g|kg|ml|l|bunch|head|clove|cloves|can|cans|pkg|package|piece|pieces|slice|slices|dozen|x|each)\s*/i, "");
  key = key.replace(/\s+/g, " ").trim();
  return key;
}

export function extractKeyIngredients(ingredients: string[]): string[] {
  const found = new Set<string>();
  const combined = ingredients.join(" ").toLowerCase();
  for (const key of KEY_INGREDIENTS) {
    if (combined.includes(key)) {
      const normalized = key === "eggs" ? "egg" : key === "mushrooms" ? "mushroom" : key;
      found.add(normalized);
    }
  }
  return Array.from(found);
}
