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
    plan-view.tsx  - View generated plan (meals + grocery list)
    plans-list.tsx - List of user's saved plans

server/
  index.ts         - Express server setup
  routes.ts        - API routes (auth + meal plan CRUD)
  storage.ts       - Database storage layer (IStorage interface)
  db.ts            - PostgreSQL connection
  openai.ts        - OpenAI integration (plan generation, swap, regen)

shared/
  schema.ts        - Drizzle schema + Zod validation schemas
```

## Key Features
- Email/password authentication with sessions
- AI-generated 7-day meal plans (3 meals/day)
- Swap individual meals (max 3 per plan)
- Regenerate entire day (max 1 per plan)
- Rebuild grocery list from current meals (no AI needed)
- Rate limiting: 10 AI calls per user per day
- Print-friendly layout

## API Endpoints
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `POST /api/plan` - Generate new meal plan
- `GET /api/plan/:id` - Get saved plan
- `GET /api/plans` - List user's plans
- `POST /api/plan/:id/swap` - Swap a meal
- `POST /api/plan/:id/regenerate-day` - Regenerate a day
- `POST /api/plan/:id/grocery/regenerate` - Rebuild grocery list

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `OPENAI_API_KEY` - OpenAI API key
- `SESSION_SECRET` - Express session secret

## Running
```bash
npm run dev        # Start dev server
npm run db:push    # Push schema to database
```
