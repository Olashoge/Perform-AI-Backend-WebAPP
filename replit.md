# Perform AI

## Overview
Perform AI is an AI-powered personal performance system focused on three core features: **Wellness Plans** (primary), **Daily Meal generation**, and **Daily Workout generation**. Users create Wellness Plans that pair AI-generated 7-day meal and workout plans aligned with their goals. Daily planning allows single-day meal and workout generation. The system provides intelligent, adaptive planning based on user profiles, preferences, and performance data.

## User Preferences
I prefer iterative development with clear communication at each stage. Please ask before making any major architectural changes or significant modifications to existing features. I value concise explanations but appreciate detailed justifications for complex decisions. For styling, I prefer the Inter font, a deep emerald primary color (#0E3B2E), an amber accent for meal-related UI (#A16207), an emerald accent for workout-related UI, and warm neutral backgrounds (#FAFAF8). Full dark mode support is essential, with a theme toggle (light/dark/system) persisted via local storage.

## System Architecture
The application uses a modern web stack for a responsive and intuitive user experience. The frontend is built with React, Vite, and TypeScript, styled using Tailwind CSS and shadcn/ui components. The UI/UX includes a premium visual redesign with an icon-only navigation sidebar and an active goal bar.

The backend is an Express server in TypeScript with dual authentication: cookie-based sessions (for web, 30-day persistence via connect-pg-simple) and JWT Bearer tokens (for mobile/API clients). PostgreSQL is the primary database, managed via Drizzle ORM.

**Note:** Standalone 7-day meal plan and workout plan features have been removed. All plan creation now flows through Wellness Plans (Goal Plans) or Daily Planning. The standalone routes (`POST/GET/DELETE /api/plan*`, `POST/GET/DELETE /api/workout*`, grocery routes) and their frontend pages have been removed.

Key features include:
-   **Wellness Plans (Goal Plans)**: The primary feature. A `GoalPlan` entity is the parent container for paired meal and workout plans. Child plans have a `parentGoalPlanId` column linking them to their parent. Goal-owned plans are accessed via `GET /api/goal-plans/:id` which embeds full `mealPlan` and `workoutPlan` objects. The detail page (`/goals/:id`, `goal-detail.tsx`) renders three tabs: Overview (summary, macro targets, progression notes), Meals (day-by-day browsable meals with feedback and completion), and Workouts (day-by-day sessions with exercise preferences). Cards on the list page (`/goals`, `goal-plans.tsx`) are clickable to navigate to the detail view. Schedule, unschedule, and delete operations cascade from parent to children via `POST /api/goal-plans/:id/schedule`, `/unschedule`, and `DELETE /api/goal-plans/:id`.
-   **Daily Planning**: Allows users to generate single-day meal and workout plans via a dedicated UI.
-   **Feedback Loop & Adaption**: Users can provide tri-state feedback on meals and workouts, influencing future AI-generated plans and tracking preferences.
-   **Scheduling & Calendar**: Plans are schedulable with conflict awareness and displayed in a unified calendar view.
-   **Wellness Context**: A shared server-side `WellnessContext` ensures nutritional adaptation based on workout schedules.
-   **Check-ins**: Weekly logging for weight, energy, compliance, and notes.
-   **Profile (Performance Blueprint)**: A mandatory, comprehensive user profile capturing physical stats, goals, health conditions, training capacity, nutrition preferences, and equipment availability. This profile is a single source of truth for AI generation.
-   **Constraint Engine v1**: A deterministic layer for pre-checking user profiles against safety rules and post-validating AI output, ensuring adherence to constraints.
-   **Performance Core v1**: A weekly performance summary system triggered by check-ins, computing adherence scores, momentum states, insights, and adjustment actions that influence future AI prompts.
-   **Performance State Engine v1**: A deterministic (no LLM) weighted composite score system. Computes a `performanceState` object for any given week including PCS (0–1), label (`on_track`/`building_momentum`/`recovering`/`at_risk`/`declining`), week-over-week delta, 4-week trend slope, streak days, and rule-based explanation strings. Weights: 45% weekly score, 25% delta, 20% trend, 10% streak. Served via `GET /api/weekly-summary` response. Module: `server/performance/performanceState.ts`. Tests: `server/performance/performanceState.test.ts`.
-   **Adaptive Engine v1**: A rule-based system that automatically adjusts plan difficulty, volume, and complexity based on user performance history and check-ins, storing `AdaptiveModifiers` for AI prompt injection.
-   **Unified Context Builder**: Extracts all profile fields and form overrides into structured prompt blocks for AI generation, ensuring all user data influences the output.
-   **Favorite Meals**: Users can specify preferred meals, treated as soft constraints by the AI.
-   **Score Ring 4-Tier Colors**: Weekly scorecard rings use a psychology-based 4-tier color system (red, amber, light green, emerald green).
-   **Equipment Accordion UX**: Improved equipment selection UI on the profile page with accordion-style categories.
-   **Completion Tracking**: Users can mark individual meals and workouts as complete, contributing to adherence calculations.
-   **Rate Limiting**: AI calls are rate-limited to 10 per user per day.
-   **Soft Deletion**: Plans and goals are soft-deleted for data integrity and recovery.
-   **Account Deletion**: `DELETE /api/me` permanently removes a user account and all associated data across all tables in a single transaction. Returns structured error responses with `success`, `code`, and `message` fields. Module: `server/storage.ts` (`deleteUser` method).
-   **Dual Authentication (Session + JWT)**: Web app uses cookie-based sessions (unchanged). Mobile/API clients use JWT Bearer tokens via `POST /api/auth/token-login` (returns accessToken + refreshToken), `POST /api/auth/refresh` (token rotation), and `POST /api/auth/token-logout` (revoke). Access tokens expire in 15 minutes, refresh tokens in 30 days. Refresh tokens are SHA-256 hashed in the `refresh_tokens` table (never stored in plaintext). Unified `requireAuth` middleware checks Bearer header first, then falls back to session cookie. All protected routes use `req.userId` (set by either auth method). Module: `server/jwt.ts`. Env vars: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL` (default 15m), `JWT_REFRESH_TTL` (default 30d).

-   **Shared Mobile Aggregation Endpoints**: Three unified endpoints (`GET /api/weekly-summary`, `GET /api/week-data`, `GET /api/day-data/:date`) serve both web dashboard and mobile clients. The web dashboard consumes `/api/weekly-summary` (via `useWeeklyAdherence` hook) and `/api/week-data` (replacing 5 prior separate queries) for week-level data. Both endpoints accept `?weekStart=YYYY-MM-DD` and `?weekStartsOn=0|1`. The `/api/week-data` response includes `mealSlots`, per-day `planIds`, `workoutPlanId`, `dailyMeal`/`dailyWorkout` objects, and `completions`. Automated comparison script: `scripts/compare-weekly-summary.sh`.

## Mobile Rebuild Documentation
The `docs/` folder contains a comprehensive documentation pack for rebuilding the app as a React Native iOS client:
-   `docs/api-reference.md` — Complete API endpoint reference with request/response examples
-   `docs/data-models.md` — TypeScript type definitions for all entities (for Swift replication)
-   `docs/auth-guide.md` — JWT authentication flow guide with mobile implementation patterns
-   `docs/mobile-architecture.md` — Screen map, navigation structure, and feature parity guide
-   `docs/plan-lifecycle.md` — Plan lifecycle guide covering storage, viewing, scheduling, deletion, completions, feedback, and grocery lists for iOS feature parity

## External Dependencies
-   **OpenAI**: Used for generating personalized meal plans and workout programs.
-   **PostgreSQL**: The primary database for all application data.
-   **connect-pg-simple**: Used for PostgreSQL-backed session storage.
-   **jsonwebtoken**: Used for JWT access token signing and verification.
