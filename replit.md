# Perform AI

## Overview
Perform AI is an AI-powered personal performance system designed to generate personalized 7-day meal and workout plans. It caters to individuals seeking to optimize their health and fitness routines by providing intelligent, adaptive planning. Users input dietary and fitness preferences, along with personal data (age, weight, workout frequency), to receive customized meal plans with recipes and grocery lists, as well as tailored workout programs. The project's vision is to offer a comprehensive solution for personal health optimization.

## User Preferences
I prefer iterative development with clear communication at each stage. Please ask before making any major architectural changes or significant modifications to existing features. I value concise explanations but appreciate detailed justifications for complex decisions. For styling, I prefer the Inter font, a deep emerald primary color (#0E3B2E), an amber accent for meal-related UI (#A16207), an emerald accent for workout-related UI, and warm neutral backgrounds (#FAFAF8). Full dark mode support is essential, with a theme toggle (light/dark/system) persisted via local storage.

## System Architecture
The application uses a modern web stack for a responsive and intuitive user experience. The frontend is built with React, Vite, and TypeScript, styled using Tailwind CSS and shadcn/ui components. The UI/UX includes a premium visual redesign with an icon-only navigation sidebar and an active goal bar.

The backend is an Express server in TypeScript, utilizing session-based authentication with PostgreSQL for 30-day session persistence. PostgreSQL is the primary database, managed via Drizzle ORM.

Key features include:
-   **Personalized Plan Generation**: AI-generated 7-day meal and workout plans based on user profiles and preferences. Meal plans are configurable for 2 or 3 meals daily, and workout plans consider various factors like goals, location, and experience.
-   **Goal-Oriented Planning**: A `GoalPlan` entity manages the sequential generation of workout and meal plans, supporting diverse fitness goals.
-   **Feedback Loop & Adaption**: Users can provide tri-state feedback on meals and workouts, influencing future AI-generated plans and tracking preferences.
-   **Grocery Management**: AI-estimated grocery pricing, dynamic grocery lists, and tracking of owned items.
-   **Scheduling & Calendar**: Plans are schedulable with conflict awareness and displayed in a unified calendar view.
-   **Wellness Context**: A shared server-side `WellnessContext` ensures nutritional adaptation based on workout schedules.
-   **Check-ins**: Weekly logging for weight, energy, compliance, and notes.
-   **Adaptive Swap/Regen Economy**: A dynamic allowance system for meal swaps and plan regens, with adaptive bonuses/penalties based on user behavior.
-   **Profile (Performance Blueprint)**: A mandatory, comprehensive user profile capturing physical stats, goals, health conditions, training capacity, nutrition preferences, and equipment availability. This profile is a single source of truth for AI generation.
-   **Constraint Engine v1**: A deterministic layer for pre-checking user profiles against safety rules and post-validating AI output, ensuring adherence to constraints.
-   **Performance Core v1**: A weekly performance summary system triggered by check-ins, computing adherence scores, momentum states, insights, and adjustment actions that influence future AI prompts.
-   **Daily Planning**: Allows users to generate single-day meal and workout plans via a dedicated UI.
-   **Adaptive Engine v1**: A rule-based system that automatically adjusts plan difficulty, volume, and complexity based on user performance history and check-ins, storing `AdaptiveModifiers` for AI prompt injection.
-   **Unified Context Builder**: Extracts all profile fields and form overrides into structured prompt blocks for AI generation, ensuring all user data influences the output.
-   **Favorite Meals**: Users can specify preferred meals, treated as soft constraints by the AI.
-   **Score Ring 4-Tier Colors**: Weekly scorecard rings use a psychology-based 4-tier color system (red, amber, light green, emerald green).
-   **Equipment Accordion UX**: Improved equipment selection UI on the profile page with accordion-style categories.
-   **Completion Tracking**: Users can mark individual meals and workouts as complete, contributing to adherence calculations.
-   **Rate Limiting**: AI calls are rate-limited to 10 per user per day.
-   **Soft Deletion**: Plans and goals are soft-deleted for data integrity and recovery.

## External Dependencies
-   **OpenAI**: Used for generating personalized meal plans and workout programs.
-   **PostgreSQL**: The primary database for all application data.
-   **connect-pg-simple**: Used for PostgreSQL-backed session storage.