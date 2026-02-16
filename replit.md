# MealPlan AI

## Overview
AI-powered 7-day meal planning app. Users enter dietary preferences and the app generates personalized meal plans with step-by-step recipes, nutrition info, and organized grocery lists using OpenAI gpt-4.1-mini.

## Tech Stack
- **Frontend**: React + Vite (TypeScript), Tailwind CSS, shadcn/ui components
- **Backend**: Express (TypeScript) with session-based auth
- **Database**: PostgreSQL (Drizzle ORM)
- **AI**: OpenAI gpt-4.1-mini for meal plan generation

## Project Structure
```
client/src/
  App.tsx          - Main router with auth provider
  lib/auth.tsx     - Auth context (login/signup/logout)
  lib/queryClient.ts - TanStack Query setup
  pages/
    landing.tsx    - Landing page
    login.tsx      - Login form
    signup.tsx     - Signup form
    new-plan.tsx   - Preference form for generating plans
    plan-generating.tsx - Dedicated generation progress page (polls, timeout, retry)
    plan-view.tsx  - View generated plan (meals + grocery list)
    plans-list.tsx - List of user's saved plans

server/
  index.ts         - Express server setup
  routes.ts        - API routes (auth + meal plan CRUD)
  storage.ts       - Database storage layer (IStorage interface)
  db.ts            - PostgreSQL connection
  openai.ts        - OpenAI integration (plan generation, swap, regen)
  meal-utils.ts    - Meal fingerprinting and ingredient keyword extraction

shared/
  schema.ts        - Drizzle schema + Zod validation schemas
```

## Key Features
- Email/password authentication with sessions
- AI-generated 7-day meal plans with configurable meals per day (2 or 3)
- Multi-select diet/cuisine styles with chip UI, including custom style input
- 14 foods-to-avoid options including Chicken, Beans/Legumes, Spicy Foods, Garlic/Onion
- Dedicated generation page (/plan/:id/generating) with 4-stage dynamic timeline, progress bar, rotating tips, collapsible preference summary
- Idempotency keys prevent duplicate plan generation
- Swap individual meals (max 3 per plan)
- Regenerate entire day (max 1 per plan)
- Rebuild grocery list from current meals (no AI needed)
- Grocery price estimation: AI estimates min/max price ranges per item with confidence levels
  - groceryPricingJson stored on mealPlans, regenerated on swap/regen/rebuild
  - pricingStatus column tracks pricing generation independently from plan status (pending/ready/failed)
  - Owned item tracking: users mark items they already have, adjusted totals update in real-time
  - ownedGroceryItems table with unique constraint on (userId, mealPlanId, itemKey)
  - Item key normalization shared between server (meal-utils.ts) and client
  - Frontend polls for pricing (max 10 polls, 3s interval) with timeout fallback
- Rate limiting: 10 AI calls per user per day
- Print-friendly layout
- Plan Settings panel: collapsible view of plan preferences, swap/regen limits in plan-view
- Meal feedback learning: like/dislike meals to improve future AI suggestions
  - MealFeedback table stores per-meal feedback with fingerprinting
  - IngredientPreference table tracks derived ingredient avoids/prefers
  - Preferences wired into all OpenAI prompts (plan gen, swap, regen day)

## Schema Notes
- `dietStyles` is a string array (replaced old `dietStyle` string field)
- `mealsPerDay` is 2 or 3 (default 3); when 2, only lunch+dinner are generated, breakfast is optional/null
- `pricingStatus` column on mealPlans tracks grocery pricing independently (pending/ready/failed)
- Day schema has optional breakfast to support 2-meal plans
- OpenAI prompts limited to 6-8 steps per meal, shorter summaries and whyItHelpsGoal

## API Endpoints
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `POST /api/plan` - Generate new meal plan (async, returns immediately with status)
- `GET /api/plan/:id` - Get saved plan (includes status, errorMessage)
- `GET /api/plan/:id/status` - Get plan status + pricingStatus (lightweight polling endpoint)
- `GET /api/plans` - List user's plans
- `POST /api/plan/:id/swap` - Swap a meal
- `POST /api/plan/:id/regenerate-day` - Regenerate a day
- `POST /api/plan/:id/grocery/regenerate` - Rebuild grocery list
- `GET /api/plan/:id/grocery` - Get grocery data with pricing, owned items, totals
- `POST /api/plan/:id/grocery/owned` - Toggle owned item status
- `POST /api/feedback/meal` - Like/dislike a meal (upserts feedback + derives ingredient prefs)
- `GET /api/feedback/plan/:planId` - Get feedback map for all meals (by fingerprint)
- `GET /api/preferences` - Get user's learned preference context

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - OpenAI API key
- `SESSION_SECRET` - Express session secret

## Running
```bash
npm run dev        # Start dev server
npm run db:push    # Push schema to database
```
