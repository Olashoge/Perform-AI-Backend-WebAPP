# MealPlan AI

## Overview
AI-powered 7-day meal planning app. Users enter dietary preferences and personalization data (age, weight, workout frequency) and the app generates personalized 7-day meal plans with step-by-step recipes, nutrition info, and organized grocery lists using OpenAI gpt-4.1-mini.

## Tech Stack
- **Frontend**: React + Vite (TypeScript), Tailwind CSS, shadcn/ui components
- **Backend**: Express (TypeScript) with session-based auth (PostgreSQL-backed, 30-day sessions via connect-pg-simple)
- **Database**: PostgreSQL (Drizzle ORM)
- **AI**: OpenAI gpt-4.1-mini for meal plan + workout plan generation

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
    preferences.tsx - Manage liked/disliked meals and ingredient preferences
    plan-calendar.tsx - Calendar view (dense month + week) showing ALL scheduled plans merged, feedback icons, workout indicators, settings modal
    new-workout.tsx  - Workout preference form (goal, location, mode, days, focus areas, session length, experience, limitations)
    workout-generating.tsx - Workout generation progress page (polls, timeline, tips)
    workout-view.tsx - View generated workout plan (sessions, exercises, progression notes, 3-dot scheduling/delete)
    goal-plans.tsx - GoalPlan management (create goals, link meal+workout plans, navigate to check-ins)
    check-ins.tsx  - Weekly check-in logging (weight, energy, compliance, notes) with history
    dashboard.tsx  - Unified weekly overview (active plans, momentum, compliance, weight trend)

server/
  index.ts         - Express server setup (connect-pg-simple session store)
  routes.ts        - API routes (auth + meal plan CRUD + workout plan CRUD + preferences management)
  storage.ts       - Database storage layer (IStorage interface)
  db.ts            - PostgreSQL connection
  openai.ts        - OpenAI integration (meal plan generation, swap, regen, workout plan generation)
  meal-utils.ts    - Meal fingerprinting and ingredient keyword extraction

shared/
  schema.ts        - Drizzle schema + Zod validation schemas
```

## Key Features
- Email/password authentication with PostgreSQL-backed sessions (30-day duration)
- AI-generated 7-day meal plans with configurable meals per day (2 or 3)
- Dynamic meal slots: when mealsPerDay=2, user picks exactly 2 from breakfast/lunch/dinner
- Personalization: age, current/target weight (lb/kg), workout days/week
  - Age < 18 triggers safe, non-prescriptive nutrition language
  - Weight/activity data adapts portion sizes and macro ranges
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
- Plan Settings panel: collapsible view of plan preferences including personalization, swap/regen limits
- Tri-state meal feedback: like/dislike/neutral (neutral removes feedback record)
  - MealFeedback table stores per-meal feedback with fingerprinting
  - IngredientPreference table tracks derived ingredient avoids/prefers
  - Dislike triggers ingredient avoid confirmation modal (user chooses which ingredients to avoid)
  - IngredientAvoidProposal table: pending proposals from dislikes, reviewed in Preferences page
  - Preferences wired into all OpenAI prompts (plan gen, swap, regen day)
- Workout session feedback: like/dislike/neutral per workout session (WorkoutFeedback table)
- GoalPlan entity: links meal plan + workout plan with shared goal type and start date
  - CRUD API for goal plans
  - Supports unified plan management
- Preferences management page (/preferences): view and delete liked/disliked meals, avoided ingredients, pending ingredient proposals
- Plan lifecycle status badges: Draft, Scheduled, Active, Completed (derived from start date)
- Calendar filter toggle: Combined/Meals/Workouts view filtering
- Workout-day-aware meal generation: OpenAI prompts adapt nutrition based on workout schedule
- Weekly check-in tracking: weight, energy rating, compliance, notes (WeeklyCheckIn table)
- AI-generated 7-day workout plans with customizable preferences
  - Goals: weight loss, muscle gain, performance, maintenance
  - Location: home (no equipment), home (dumbbells/bands), gym, outdoor, mixed
  - Training modes: strength, cardio, both
  - Focus areas: full body, upper/lower body, core, back, chest, arms, etc.
  - Day-of-week selection for workout days
  - Session length: 20/30/45/60/90 min
  - Experience level: beginner/intermediate/advanced
  - Injuries/limitations support
  - Each session includes warm-up, main exercises (sets/reps/time), optional finisher, cool-down, coaching cues
  - Progression notes for week-to-week guidance
  - Plans schedulable via 3-dot menu (same pattern as meal plans)
  - Plans-list page has tabs for Meal Plans and Workout Plans
  - Calendar shows workout days with dumbbell icon indicator alongside meals

## Schema Notes
- `dietStyles` is a string array (replaced old `dietStyle` string field)
- `mealsPerDay` is 2 or 3 (default 3)
- `mealSlots` is optional string array; when mealsPerDay=2, stores exactly 2 of ["breakfast","lunch","dinner"]
- `age`, `currentWeight`, `targetWeight` (optional numbers), `weightUnit` ("lb"|"kg"), `workoutDaysPerWeek` (0-7), `workoutDays` (optional string array of "Sun"|"Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat")
- `spiceLevel` ("none"|"mild"|"medium"|"hot"), default "medium" — applied independently of cuisine
- `authenticityMode` ("traditional"|"weeknight"|"mixed"), default "mixed" — controls recipe complexity
- `planStartDate` is nullable varchar(10) storing YYYY-MM-DD; plans are created without a start date and must be scheduled from the Plan Detail page via 3-dot overflow menu
- `deletedAt` is nullable timestamp for soft delete; all queries exclude deleted plans; soft delete also clears planStartDate
- `pricingStatus` column on mealPlans tracks grocery pricing independently (pending/ready/failed)
- Day schema has optional breakfast, lunch, dinner to support dynamic meal slots
- OpenAI prompts limited to 6-8 steps per meal, shorter summaries and whyItHelpsGoal
- Goal enum uses `weight_loss` (backward compat: server normalizes old `fat_loss` values)

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
- `GET /api/preferences` - Get user's full preference data (meals + ingredients with IDs)
- `DELETE /api/preferences/meal/:id` - Remove a meal feedback entry
- `DELETE /api/preferences/ingredient/:id` - Remove an ingredient preference
- `DELETE /api/plans/:id` - Soft delete a plan (sets deletedAt, clears startDate)
- `GET /api/calendar/all` - Merged calendar data from ALL scheduled plans (no plan selector)
- `GET /api/calendar/occupied-dates?excludePlanId=X` - List of dates with existing meals (for date picker blocking)
- `POST /api/workout` - Generate new workout plan (async, returns immediately with status)
- `GET /api/workout/:id` - Get saved workout plan
- `GET /api/workout/:id/status` - Get workout plan status (lightweight polling)
- `GET /api/workouts` - List user's workout plans
- `POST /api/workout/:id/start-date` - Set/clear workout plan start date
- `DELETE /api/workouts/:id` - Soft delete a workout plan
- `GET /api/calendar/workouts` - Merged workout calendar data from ALL scheduled workout plans
- `GET /api/calendar/workout-occupied-dates?excludePlanId=X` - List of dates with existing workouts
- `POST /api/feedback/workout` - Like/dislike/neutral a workout session
- `GET /api/feedback/workout/:planId` - Get feedback map for workout sessions
- `POST /api/goal-plans` - Create a goal plan
- `GET /api/goal-plans` - List user's goal plans
- `GET /api/goal-plans/:id` - Get a goal plan
- `PATCH /api/goal-plans/:id` - Update a goal plan
- `DELETE /api/goal-plans/:id` - Soft delete a goal plan
- `GET /api/ingredient-proposals` - Get pending ingredient avoid proposals
- `POST /api/ingredient-proposals/:id/resolve` - Accept/decline a proposal
- `POST /api/check-ins` - Create a weekly check-in
- `GET /api/check-ins` - List check-ins (optional goalPlanId filter)

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - OpenAI API key
- `SESSION_SECRET` - Express session secret

## Running
```bash
npm run dev        # Start dev server
npm run db:push    # Push schema to database
```
