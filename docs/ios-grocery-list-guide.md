# iOS Guide: Grocery List — Complete Implementation Reference

This document covers how the grocery list system works end-to-end so the iOS app can be a complete replica of the web app.

---

## How the Grocery List Gets Created

The grocery list is **NOT** a separate generation step. It is included automatically as part of every 7-day meal plan. When a meal plan finishes generating, the plan JSON already contains a `groceryList` field with categorized ingredients.

After the grocery list exists, a **separate async AI call** generates estimated pricing for each item. This pricing step runs in the background — the grocery list is viewable immediately, but prices may take a few extra seconds to appear.

### Timeline

```
1. POST /api/plan/generate (or goal plan generate)
2. AI generates 7-day meal plan → includes groceryList in the plan JSON
3. Plan status becomes "ready"
4. Background: AI generates grocery pricing (takes ~5-10 seconds after plan is ready)
5. Pricing appears on the grocery endpoint
```

---

## Endpoints

### 1. Fetch Grocery List + Pricing + Owned Items

```
GET /api/plan/:mealPlanId/grocery
Authorization: Bearer <accessToken>
```

**Response (HTTP 200):**

```json
{
  "groceryList": {
    "sections": [
      {
        "name": "Protein",
        "items": [
          {
            "item": "chicken breast",
            "quantity": "2 lbs chicken breast",
            "notes": null
          },
          {
            "item": "salmon fillet",
            "quantity": "1 lb salmon fillet"
          }
        ]
      },
      {
        "name": "Produce",
        "items": [
          {
            "item": "spinach",
            "quantity": "1 bunch spinach"
          },
          {
            "item": "bell peppers",
            "quantity": "3 bell peppers"
          }
        ]
      },
      {
        "name": "Dairy",
        "items": [
          {
            "item": "Greek yogurt",
            "quantity": "32 oz Greek yogurt"
          }
        ]
      },
      {
        "name": "Grains & Pantry",
        "items": [
          {
            "item": "brown rice",
            "quantity": "2 cups brown rice"
          }
        ]
      },
      {
        "name": "Oils & Condiments",
        "items": [
          {
            "item": "olive oil",
            "quantity": "1 bottle olive oil"
          }
        ]
      },
      {
        "name": "Spices & Seasonings",
        "items": [
          {
            "item": "cumin",
            "quantity": "1 tsp cumin"
          }
        ]
      }
    ]
  },
  "pricing": {
    "currency": "USD",
    "assumptions": {
      "region": "US national average",
      "pricingType": "retail grocery",
      "note": "Prices are estimates and may vary by location and season."
    },
    "items": [
      {
        "itemKey": "chicken breast",
        "displayName": "Chicken Breast",
        "unitHint": "2 lbs",
        "estimatedRange": { "min": 5.99, "max": 8.99 },
        "confidence": "high"
      },
      {
        "itemKey": "salmon fillet",
        "displayName": "Salmon Fillet",
        "unitHint": "1 lb",
        "estimatedRange": { "min": 8.99, "max": 14.99 },
        "confidence": "medium"
      }
    ]
  },
  "ownedItems": {
    "olive oil": true,
    "salt": true
  },
  "totals": {
    "totalMin": 65.43,
    "totalMax": 102.87,
    "ownedAdjustedMin": 58.44,
    "ownedAdjustedMax": 94.88
  }
}
```

### Response Fields Explained

| Field | Type | Description |
|:------|:-----|:------------|
| `groceryList.sections` | array | Ingredients grouped by category |
| `groceryList.sections[].name` | string | Category name: `"Protein"`, `"Produce"`, `"Dairy"`, `"Grains & Pantry"`, `"Oils & Condiments"`, `"Spices & Seasonings"` |
| `groceryList.sections[].items[].item` | string | The ingredient display name (quantity stripped out) |
| `groceryList.sections[].items[].quantity` | string | The full quantity string (e.g. "2 lbs chicken breast") |
| `groceryList.sections[].items[].notes` | string? | Optional notes, usually null |
| `pricing` | object or `null` | **null while pricing is still generating** |
| `pricing.currency` | string | Always `"USD"` currently |
| `pricing.assumptions` | object | Context about the price estimates |
| `pricing.items[]` | array | One entry per grocery item with price range |
| `pricing.items[].itemKey` | string | Matches `groceryList.sections[].items[].item` |
| `pricing.items[].displayName` | string | Human-friendly name |
| `pricing.items[].unitHint` | string | Quantity context for the price |
| `pricing.items[].estimatedRange` | object | `{ min: number, max: number }` in the pricing currency |
| `pricing.items[].confidence` | string | `"low"`, `"medium"`, or `"high"` |
| `ownedItems` | object | Map of `itemKey → boolean`. Items the user has marked as "already owned" |
| `totals.totalMin` | number | Sum of all `estimatedRange.min` values |
| `totals.totalMax` | number | Sum of all `estimatedRange.max` values |
| `totals.ownedAdjustedMin` | number | Total minus items marked as owned |
| `totals.ownedAdjustedMax` | number | Total minus items marked as owned |

### Important: Pricing Can Be Null

When you first fetch the grocery list after a plan completes, `pricing` may be `null` because the pricing AI call runs asynchronously. The web app handles this by:

1. Showing the grocery list immediately (items with checkboxes)
2. Showing a "Estimating prices..." loading indicator where prices would appear
3. Re-fetching after a few seconds to pick up the pricing

**iOS approach:** After getting `pricing: null`, poll the same endpoint every 3-5 seconds until `pricing` is populated (usually takes 5-15 seconds after plan completion). Or use a pull-to-refresh pattern.

You can also check the plan's `pricingStatus` field. The meal plan object (from `GET /api/plan/:id`) has a `pricingStatus` field:
- `"pending"` — pricing is being generated
- `"ready"` — pricing is available (implicit, when `groceryPricingJson` is set)
- `"failed"` — pricing generation failed

---

### 2. Toggle an Item as Owned / Not Owned

```
POST /api/plan/:mealPlanId/grocery/owned
Authorization: Bearer <accessToken>
Content-Type: application/json
```

**Request Body:**

```json
{
  "itemKey": "olive oil",
  "isOwned": true
}
```

| Field | Type | Required | Description |
|:------|:-----|:---------|:------------|
| `itemKey` | string | **YES** | Must match `groceryList.sections[].items[].item` exactly (case-sensitive) |
| `isOwned` | boolean | **YES** | `true` = user already has this, `false` = user needs to buy it |

**Response (HTTP 200):**

```json
{ "ok": true }
```

**Error (HTTP 400):**

```json
{ "message": "itemKey and isOwned (boolean) are required" }
```

### How Owned Items Affect Pricing

When an item is marked as owned:
- It stays visible in the grocery list (with a visual indicator like a checkmark or strikethrough)
- The `totals.ownedAdjustedMin` and `totals.ownedAdjustedMax` exclude owned items
- The full `totals.totalMin` and `totals.totalMax` remain unchanged (total cost if buying everything)

This lets you show something like:  
**"Estimated cost: $58–$95 (saving $7–$8 from items you own)"**

---

### 3. Regenerate Grocery List

After a meal swap or plan modification, the grocery list may become stale. This endpoint rebuilds it from the current plan's ingredients and triggers a fresh pricing estimate.

```
POST /api/plan/:mealPlanId/grocery/regenerate
Authorization: Bearer <accessToken>
```

**No request body needed.**

**Response (HTTP 200):** Returns the updated meal plan object (full plan JSON).

After calling this:
- The grocery list is immediately rebuilt from all current meal ingredients
- Pricing is reset to `null` and regenerated asynchronously
- You should re-fetch `GET /api/plan/:id/grocery` after a few seconds to get the new pricing

### When to Call Regenerate

The web app calls grocery regenerate automatically after:
- A meal swap completes
- A meal regeneration completes

The iOS app should do the same — after any meal swap or regen mutation succeeds, call `/api/plan/:id/grocery/regenerate` and then re-fetch the grocery data.

---

## Data Models (for Swift)

### GroceryItem

```swift
struct GroceryItem: Codable, Identifiable {
    let item: String
    let quantity: String
    let notes: String?
    
    var id: String { item }
}
```

### GrocerySection

```swift
struct GrocerySection: Codable, Identifiable {
    let name: String
    let items: [GroceryItem]
    
    var id: String { name }
}
```

### GroceryPricingItem

```swift
struct GroceryPricingItem: Codable {
    let itemKey: String
    let displayName: String
    let unitHint: String
    let estimatedRange: PriceRange
    let confidence: String  // "low", "medium", "high"
}

struct PriceRange: Codable {
    let min: Double
    let max: Double
}
```

### GroceryPricing

```swift
struct GroceryPricing: Codable {
    let currency: String
    let assumptions: PricingAssumptions
    let items: [GroceryPricingItem]
}

struct PricingAssumptions: Codable {
    let region: String
    let pricingType: String
    let note: String
}
```

### GroceryTotals

```swift
struct GroceryTotals: Codable {
    let totalMin: Double
    let totalMax: Double
    let ownedAdjustedMin: Double
    let ownedAdjustedMax: Double
}
```

### Full Grocery Response

```swift
struct GroceryResponse: Codable {
    let groceryList: GroceryList
    let pricing: GroceryPricing?
    let ownedItems: [String: Bool]
    let totals: GroceryTotals
}

struct GroceryList: Codable {
    let sections: [GrocerySection]
}
```

---

## Category Types

The grocery list groups ingredients into exactly these 6 categories (determined server-side):

| Category | Example Items |
|:---------|:-------------|
| `"Protein"` | chicken, beef, salmon, eggs, tofu, tempeh |
| `"Produce"` | spinach, tomatoes, onions, bell peppers |
| `"Dairy"` | milk, cheese, yogurt, butter |
| `"Grains & Pantry"` | rice, pasta, bread, oats, quinoa |
| `"Oils & Condiments"` | olive oil, soy sauce, honey, vinegar |
| `"Spices & Seasonings"` | cumin, paprika, oregano, garlic powder |

Items that don't match any keyword pattern default to `"Produce"`.

---

## Web App UI Behavior (for Parity)

The web app's grocery list screen shows:

1. **Section headers** — one per category, collapsible
2. **Item rows** — each with:
   - A checkbox to toggle owned status
   - The item name (from `item` field)
   - The quantity (from `quantity` field)
   - The estimated price range (from `pricing.items[]`) — or a loading shimmer if pricing is null
   - Owned items show strikethrough text and are visually de-emphasized
3. **Cost summary bar** at the top or bottom:
   - Shows "Est. $XX – $YY" using `ownedAdjustedMin` and `ownedAdjustedMax`
   - If no items are owned, uses `totalMin` and `totalMax`
4. **Regenerate button** — triggers `/api/plan/:id/grocery/regenerate`
5. **Pricing confidence** — items with `"low"` confidence may show a subtle indicator

---

## Matching Pricing to Grocery Items

The `pricing.items[].itemKey` should match `groceryList.sections[].items[].item`. To display pricing next to each grocery item:

```swift
// Build a lookup dictionary from pricing
let priceLookup: [String: GroceryPricingItem] = Dictionary(
    uniqueKeysWithValues: (pricing?.items ?? []).map { ($0.itemKey, $0) }
)

// For each grocery item, look up its price
for section in groceryList.sections {
    for item in section.items {
        if let priceInfo = priceLookup[item.item] {
            // Show: "$\(priceInfo.estimatedRange.min) – $\(priceInfo.estimatedRange.max)"
        } else {
            // No pricing available for this item
        }
    }
}
```

---

## Complete Flow Summary

```
┌─────────────────────────────────────┐
│  Meal plan generation completes     │
│  groceryList is already in planJson │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Background: AI generates pricing   │
│  (pricingStatus: "pending")         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  GET /api/plan/:id/grocery          │
│  Returns list + pricing + owned     │
│  (pricing may be null initially)    │
└──────────────┬──────────────────────┘
               │
      ┌────────┼────────┐
      ▼        ▼        ▼
  ┌────────┐ ┌───────┐ ┌──────────┐
  │ Toggle │ │ Show  │ │ Regen    │
  │ owned  │ │ costs │ │ after    │
  │ items  │ │       │ │ swap     │
  └────────┘ └───────┘ └──────────┘
      │                      │
      ▼                      ▼
  POST owned    POST grocery/regenerate
  → re-fetch    → re-fetch grocery
```
