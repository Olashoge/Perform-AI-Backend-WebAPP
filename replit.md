# Perform AI

## Overview
Perform AI is an AI-powered personal performance system that generates personalized 7-day meal and workout plans. Users input their dietary and fitness preferences, along with personalization data such as age, weight, and workout frequency. The system then leverages AI to create customized 7-day meal plans, complete with step-by-step recipes, nutrition information, and organized grocery lists. Additionally, it generates tailored workout programs. The project aims to provide a comprehensive solution for individuals seeking to optimize their personal health and fitness routines through intelligent, adaptive planning.

## User Preferences
I prefer iterative development with clear communication at each stage. Please ask before making any major architectural changes or significant modifications to existing features. I value concise explanations but appreciate detailed justifications for complex decisions. For styling, I prefer the Inter font, a deep emerald primary color (#0E3B2E), an amber accent for meal-related UI (#A16207), an emerald accent for workout-related UI, and warm neutral backgrounds (#FAFAF8). Full dark mode support is essential, with a theme toggle (light/dark/system) persisted via local storage.

## System Architecture
The application is built with a modern web stack, emphasizing a responsive and intuitive user experience. The frontend is developed using React with Vite and TypeScript, styled with Tailwind CSS and shadcn/ui components. The UI/UX features a premium visual redesign, including an icon-only navigation sidebar and an active goal bar.

The backend is an Express server written in TypeScript, managing session-based authentication with PostgreSQL for session storage, ensuring 30-day session persistence. PostgreSQL is also used as the primary database, interfaced via Drizzle ORM.

Core features include:
- **Personalized Plan Generation**: AI-generated 7-day meal and workout plans based on user preferences and personal data. Meal plans are configurable for 2 or 3 meals per day, with dynamic meal slot selection. Workout plans consider goals, location, training modes, focus areas, session length, experience level, and injuries.
- **Goal-Oriented Planning**: A `GoalPlan` entity orchestrates the generation of both meal and workout plans, supporting various goal types (e.g., weight loss, muscle gain). It features a sequential generation pipeline (workout → meal plan → scheduling → finalizing) with real-time progress tracking.
- **Feedback Loop & Adaption**: Users can provide tri-state feedback (like/dislike/neutral) on individual meals and workout sessions. This feedback influences future AI-generated plans by tracking ingredient and exercise preferences/avoids.
- **Grocery Management**: AI-estimated grocery pricing with confidence levels, and a feature for users to track owned items, dynamically updating totals. Grocery lists can be rebuilt from current meals.
- **Scheduling & Calendar**: Plans are schedulable with conflict-aware date pickers. A unified calendar view displays all scheduled meal and workout plans.
- **Wellness Context**: A shared `WellnessContext` on the server ensures cross-plan coupling, adapting nutrition based on workout schedules (e.g., increased carbs/calories on training days).
- **Check-ins**: Weekly check-in logging for weight, energy, compliance, and notes.
- **Rate Limiting**: AI calls are rate-limited to 10 per user per day to manage resource usage.
- **Soft Deletion**: Plans and goals are soft-deleted, maintaining data integrity while allowing for recovery.

## External Dependencies
- **OpenAI**: Utilizes `gpt-4.1-mini` for generating personalized meal plans and workout programs.
- **PostgreSQL**: Primary database for all application data, including user information, session storage, plans, preferences, and check-ins.
- **connect-pg-simple**: Used for PostgreSQL-backed session storage in the Express backend.