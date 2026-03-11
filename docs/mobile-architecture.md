# Perform AI — Mobile App Architecture Guide (React Native / iOS)

This document provides a comprehensive architecture reference for rebuilding Perform AI as a React Native iOS application. It maps every web app screen to its mobile equivalent, defines the navigation structure, describes key UX patterns, and outlines the design system, offline strategy, and API client architecture.

> **⚠️ Deprecation Notice:** All meal swap, meal day regeneration, workout session regeneration, daily plan regeneration, and allowance/budget endpoints have been **intentionally removed** for launch simplification. Any references to these features below (including `/api/plan/:id/swap`, `/api/plan/:id/regenerate-day`, `/api/workout/:id/regenerate-session`, `/api/daily-meal/:date/regenerate`, `/api/daily-workout/:date/regenerate`, `/api/allowance/current`) are outdated and should be ignored. These features may return in a future release.

> **Companion docs:** See [auth-guide.md](./auth-guide.md) for JWT authentication details and [api-reference.md](./api-reference.md) for full endpoint documentation.

---

## Table of Contents

- [Feature Parity Map](#feature-parity-map)
  - [Public Screens](#public-screens)
  - [Authenticated Screens](#authenticated-screens-tabstack-navigation)
- [Navigation Architecture](#navigation-architecture)
- [Web App Layout Reference](#web-app-layout-reference)
- [Key UX Patterns to Replicate](#key-ux-patterns-to-replicate)
- [Design System Reference](#design-system-reference)
- [Offline Considerations](#offline-considerations)
- [API Client Architecture](#api-client-architecture)

---

## Feature Parity Map

### Public Screens

| # | Web Screen | Web Route | Mobile Screen | API Endpoints | Notes |
|---|-----------|-----------|---------------|---------------|-------|
| 1 | Landing | `/` | Splash / Onboarding | None | No direct equivalent needed. Mobile uses a native splash screen + optional onboarding carousel for first launch. |
| 2 | Login | `/login` | Login Screen | `POST /api/auth/token-login` | Use JWT token flow exclusively. Store tokens in iOS Keychain via `react-native-keychain` or `expo-secure-store`. |
| 3 | Signup | `/signup` | Signup Screen | `POST /api/auth/signup` then `POST /api/auth/token-login` | After successful signup, immediately call `token-login` to obtain JWT pair. |

### Authenticated Screens (Tab/Stack Navigation)

| # | Web Screen | Web Route | Mobile Screen | API Endpoints | Navigation Context |
|---|-----------|-----------|---------------|---------------|-------------------|
| 4 | Dashboard | `/dashboard` | **Home Tab** | `GET /api/goal-plans`<br>`GET /api/performance/latest`<br>`GET /api/weekly-adaptation/latest`<br>`GET /api/allowance/current` | Bottom tab — primary landing screen after login. Shows active goal summary, performance score ring, weekly adaptation insights, and allowance status. |
| 5 | Goals | `/goals` | **Goals Tab** — Goal List | `GET /api/goal-plans` | Bottom tab root screen. Lists all goal plans. |
| 5a | Goal Wizard | `/goals/new` | Goal Wizard (multi-step) | `POST /api/goal-plans/generate` | Nested stack screen. Multi-step form: goal type → plan type → preferences → submit. |
| 5b | Goal Generating | `/goals/:id/generating` | Goal Generating | `GET /api/goal-plans/:id/generation-status` | Nested stack. Poll endpoint every 2-3s. Shows multi-stage progress (TRAINING → NUTRITION → SCHEDULING → FINALIZING). |
| 5c | Goal Ready | `/goals/:id/ready` | Goal Ready | `GET /api/goal-plans/:id` + linked plan data | Nested stack. Displays completed goal with linked meal/workout plans. |
| 6 | Calendar | `/calendar` | **Calendar Tab** | `GET /api/calendar/all`<br>`GET /api/calendar/workouts`<br>`GET /api/daily-coverage` | Bottom tab. Month/week calendar views showing scheduled meals and workouts. Tapping a date navigates to daily meal/workout views. |
| 7 | Meal Plans List | `/plans`, `/nutrition` | **Meal Plans List** | `GET /api/plans` | Accessible from Home tab or dedicated section. Shows all meal plans with status, start/end dates. |
| 7b | Workout Plans List | `/training` | **Workout Plans List** | `GET /api/workouts` | Separate list screen for workout plans. |
| 8 | New Meal Plan | `/new-plan` | Meal Plan Creation | `POST /api/plan` | Modal or pushed screen. Collects preferences (goal, diet, cuisine, household size, etc.) and submits. |
| 9 | Plan Generating | `/plan/:id/generating` | Meal Plan Generating | `GET /api/plan/:id/status` | Loading screen. Poll every 2-3s until `status = "ready"` or `"failed"`. Show animated progress indicator. |
| 10 | Plan View | `/plan/:id` | **Meal Plan Detail** | `GET /api/plan/:id`<br>`POST /api/plan/:id/swap`<br>`POST /api/plan/:id/regenerate-day`<br>`POST /api/feedback/meal`<br>`GET /api/plan/:id/grocery`<br>`PATCH /api/plan/:id/start-date` | Rich detail screen with day tabs, meal cards, swap/regen actions, grocery list, scheduling, and feedback controls. |
| 11 | New Workout | `/workouts/new` | Workout Creation | `POST /api/workout` | Modal or pushed screen. Collects workout preferences (split, equipment, duration, etc.). |
| 12 | Workout Generating | `/workout/:id/generating` | Workout Generating | `GET /api/workout/:id/status` | Loading screen with poll pattern (same as meal plan generating). |
| 13 | Workout View | `/workout/:id` | **Workout Detail** | `GET /api/workout/:id`<br>`POST /api/workout/:id/regenerate-session`<br>`POST /api/feedback/workout` | Session-by-session view with exercises, sets/reps, regen per session, and feedback. |
| 14 | Profile | `/profile` | **Profile Screen** | `GET /api/profile`<br>`PUT /api/profile` | Nested in Profile tab. Performance Blueprint fields: age, weight, height, goals, experience, activity level, dietary needs, etc. |
| 15 | Preferences | `/preferences` | Preferences Screen | `GET /api/preferences`<br>`DELETE /api/preferences/:id` | Nested in Profile tab. Manage disliked ingredients, avoided foods, cuisine preferences. |
| 16 | Exercise Prefs | `/preferences/exercise` | Exercise Preferences | `GET /api/preferences/exercise`<br>`POST /api/preferences/exercise`<br>`DELETE /api/preferences/exercise/:id` | Nested in Profile tab. Manage exercise likes/dislikes, equipment availability. |
| 17 | Check-ins | `/check-ins` | Check-in Screen | `POST /api/check-ins`<br>`GET /api/check-ins` | Nested in Profile tab. Weekly wellness check-ins (energy, sleep, stress, adherence). |
| 18 | Settings | `/settings` | Settings Screen | None (local) | Nested in Profile tab. Theme toggle, unit preferences (imperial/metric), notification settings, logout. |
| 19 | Daily Meal | `/daily-meal/:date` | Daily Meal View | `POST /api/daily-meal`<br>`GET /api/daily-meal/:date`<br>`POST /api/daily-meal/:date/regenerate` | Pushed from Calendar. Shows all meals for a specific date with completion checkboxes. |
| 20 | Daily Workout | `/daily-workout/:date` | Daily Workout View | `POST /api/daily-workout`<br>`GET /api/daily-workout/:date`<br>`POST /api/daily-workout/:date/regenerate` | Pushed from Calendar. Shows workout session for a specific date with completion tracking. |

### Additional Shared Endpoints (used across screens)

| Endpoint | Method | Used By |
|----------|--------|---------|
| `/api/completions/toggle` | `POST` | Daily Meal View, Daily Workout View, Plan View, Workout View |
| `/api/completions` | `GET` | Any screen displaying completion state |
| `/api/allowance/current` | `GET` | Home Tab, Plan View, Workout View (before swap/regen) |
| `/api/allowance/redeem-flex` | `POST` | Plan View, Workout View (flex token redemption) |
| `/api/auth/me` | `GET` | App startup (validate stored token) |
| `/api/auth/refresh` | `POST` | API client interceptor (automatic) |
| `/api/auth/token-logout` | `POST` | Settings screen |

---

## Navigation Architecture

### React Navigation Structure

```
RootNavigator (Stack)
├── AuthStack (Stack.Navigator — screenOptions: { headerShown: false })
│   ├── Login
│   └── Signup
│
├── MainTabs (Bottom Tab Navigator — 4 tabs)
│   ├── HomeTab (Stack.Navigator)
│   │   ├── Dashboard (tab root)
│   │   ├── MealPlansList
│   │   └── WorkoutPlansList
│   │
│   ├── GoalsTab (Stack.Navigator)
│   │   ├── GoalsList (tab root)
│   │   ├── GoalWizard
│   │   ├── GoalGenerating
│   │   └── GoalReady
│   │
│   ├── CalendarTab (Stack.Navigator)
│   │   ├── Calendar (tab root)
│   │   ├── DailyMealView
│   │   └── DailyWorkoutView
│   │
│   └── ProfileTab (Stack.Navigator)
│       ├── Profile (tab root)
│       ├── Preferences
│       ├── ExercisePreferences
│       ├── CheckIns
│       └── Settings
│
└── ModalStack (Stack.Group — screenOptions: { presentation: "modal" })
    ├── NewMealPlan
    ├── MealPlanGenerating
    ├── MealPlanDetail
    ├── NewWorkout
    ├── WorkoutGenerating
    └── WorkoutDetail
```

### Tab Configuration

| Tab | Icon | Label | Stack Root |
|-----|------|-------|-----------|
| Home | `LayoutDashboard` | Home | Dashboard |
| Goals | `Target` | Goals | GoalsList |
| Calendar | `CalendarDays` | Calendar | Calendar |
| Profile | `UserCircle` | Profile | Profile |

> **Design decision:** 4 tabs keeps the bar clean. Meal/Workout plan creation flows are presented as modals (full-screen cards) since they are transient creation flows, not primary navigation destinations. Plan lists are accessible from the Home tab.

### Navigation Patterns

| Pattern | Implementation |
|---------|---------------|
| Tab switching | Bottom tab bar (always visible on main screens) |
| Drill-down within tab | `Stack.Navigator` nested inside each tab |
| Plan creation flows | `presentation: "modal"` or `"fullScreenModal"` on iOS |
| Back navigation | Native stack back button + swipe-back gesture |
| Deep linking | `linking` config on `NavigationContainer` for push notifications |

### Example Navigator Code

```typescript
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

const RootStack = createNativeStackNavigator();
const AuthStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const GoalsStack = createNativeStackNavigator();
const CalendarStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0E3B2E',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: { borderTopColor: '#E5E5E5' },
      }}
    >
      <Tab.Screen name="Home" component={HomeStackNavigator} />
      <Tab.Screen name="Goals" component={GoalsStackNavigator} />
      <Tab.Screen name="Calendar" component={CalendarStackNavigator} />
      <Tab.Screen name="Profile" component={ProfileStackNavigator} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { isAuthenticated } = useAuth();

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <RootStack.Screen name="Auth" component={AuthStackNavigator} />
      ) : (
        <>
          <RootStack.Screen name="Main" component={MainTabs} />
          <RootStack.Group screenOptions={{ presentation: 'modal' }}>
            <RootStack.Screen name="NewMealPlan" component={NewMealPlanScreen} />
            <RootStack.Screen name="MealPlanGenerating" component={MealPlanGeneratingScreen} />
            <RootStack.Screen name="MealPlanDetail" component={MealPlanDetailScreen} />
            <RootStack.Screen name="NewWorkout" component={NewWorkoutScreen} />
            <RootStack.Screen name="WorkoutGenerating" component={WorkoutGeneratingScreen} />
            <RootStack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} />
          </RootStack.Group>
        </>
      )}
    </RootStack.Navigator>
  );
}
```

---

## Web App Layout Reference

### Current Web Layout

```
┌─────────────────────────────────────────────────────────┐
│ [P] Perform AI                              [Theme] [🔲]│  ← Header (h-12)
├────┬────────────────────────────────────────────────────┤
│    │ [🎯] Active Plan: Weight Loss   Target: Mar 15    │  ← Active Goal Bar (h-12)
│ 📊 ├────────────────────────────────────────────────────┤
│ 📅 │                                                    │
│ 🎯 │              Main Content Area                     │  ← Scrollable page content
│ 🍽  │              (full width, scrollable)              │
│ 💪 │                                                    │
│ 👤 │                                                    │
│ ⚙  │                                                    │
├────┴────────────────────────────────────────────────────┤
     ↑
  Sidebar (3.5rem, icon-only, collapsible)
```

### Mobile Translation

```
┌──────────────────────────────┐
│ ← Back    Screen Title    ⋯  │  ← Top nav bar (native)
├──────────────────────────────┤
│ [🎯] Weight Loss  View →     │  ← Active Goal Banner (conditional, compact)
├──────────────────────────────┤
│                              │
│     Main Content Area        │  ← ScrollView / FlatList
│     (full width, scrollable) │
│                              │
│                              │
├──────────────────────────────┤
│  🏠    🎯    📅    👤        │  ← Bottom Tab Bar
│ Home  Goals  Cal  Profile    │
└──────────────────────────────┘
```

### Key Layout Differences

| Aspect | Web | Mobile |
|--------|-----|--------|
| Primary navigation | Icon-only sidebar (3.5rem) | Bottom tab bar (4 tabs) |
| Secondary navigation | Route-based (wouter) | Stack navigators within tabs |
| Header | Custom header with logo + theme toggle | Native navigation bar with back button |
| Active Goal Bar | Full-width bar below header | Compact banner or header subtitle |
| Content scrolling | `overflow-auto` on main div | `ScrollView` or `FlatList` |
| Plan creation | Same-page route change | Full-screen modal presentation |
| Theme toggle | Header icon button | Settings screen toggle |

---

## Key UX Patterns to Replicate

### 1. Async Plan Generation (Meal Plans & Workouts)

This is the most critical UX pattern. Both meal plans and workout plans use the same async generation flow.

```
User Action          API Call                    UI State
─────────────       ───────────────────         ─────────────────
Submit preferences → POST /api/plan             → Navigate to Generating screen
                     Response: { id, status:      Show animated progress
                     "generating" }                (Lottie or custom animation)

                     Poll every 2-3 seconds:
                     GET /api/plan/:id/status    → Update progress indicator
                     Response: { status }

                     status = "ready"            → Navigate to Plan Detail
                     status = "failed"           → Show error + retry button
```

**Implementation notes:**
- Use `useEffect` with `setInterval` for polling (or React Query's `refetchInterval`)
- Clear interval on unmount or when status resolves
- Show elapsed time indicator ("Generating your plan... 12s")
- Handle app backgrounding: resume polling on foreground via `AppState` listener
- Prevent back navigation during generation (or confirm discard)

### 2. Goal Generation (Multi-stage)

Goal generation is more complex — it produces multiple artifacts (meal plan + workout plan + schedule) tracked by individual stage statuses.

```
Step 1: User fills wizard
        Goal type (weight_loss, muscle_gain, performance, etc.)
        Plan type (nutrition_only, training_only, both)
        Preferences (duration, intensity, dietary needs)

Step 2: POST /api/goal-plans/generate
        Response: { goalPlanId }

Step 3: Poll GET /api/goal-plans/:id/generation-status
        Response: {
          stages: {
            training:   { status: "DONE" | "IN_PROGRESS" | "PENDING" },
            nutrition:  { status: "DONE" | "IN_PROGRESS" | "PENDING" },
            scheduling: { status: "DONE" | "IN_PROGRESS" | "PENDING" },
            finalizing: { status: "DONE" | "IN_PROGRESS" | "PENDING" }
          },
          overall: "generating" | "ready" | "failed"
        }

Step 4: Show visual progress through stages
        ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ TRAINING │→ │NUTRITION │→ │SCHEDULING│→ │FINALIZING│
        │   ✓ Done │  │ ⟳ Active │  │ ○ Pending│  │ ○ Pending│
        └──────────┘  └──────────┘  └──────────┘  └──────────┘

Step 5: Navigate to Goal Ready screen when overall = "ready"
```

**Mobile UX enhancements:**
- Use a vertical stepper (more natural on narrow screens) instead of horizontal
- Add haptic feedback (`Haptics.notificationAsync`) when each stage completes
- Show estimated time remaining per stage

### 3. Meal Feedback (Tri-state)

Each meal card has three feedback states: liked, disliked, or neutral (no feedback).

```
┌─────────────────────────────────────┐
│ Grilled Chicken Salad       420 cal │
│ Protein: 35g  Carbs: 28g  Fat: 18g │
│                                     │
│         👍    😐    👎              │  ← Tri-state feedback buttons
│        Like  Clear  Dislike         │
└─────────────────────────────────────┘
```

**API flow:**
```
POST /api/feedback/meal
Body: {
  fingerprint: "grilled-chicken-salad-lunch-day1",
  rating: "like" | "dislike",
  mealType: "lunch",
  planId: "plan-uuid"
}
```

**Dislike with ingredient learning:**
- When user dislikes a meal, extract key ingredients
- Show ingredient avoid proposal: "Would you like to avoid these ingredients in future plans?"
- Ingredients selected → saved to user preferences
- Future plan generation respects these preferences

**Mobile implementation:**
- Use swipe gestures as alternative to buttons (swipe right = like, swipe left = dislike)
- Haptic feedback on feedback submission
- Optimistic UI update (change button state immediately, rollback on error)

### 4. Completion Tracking

Every meal and workout item has a completion checkbox for daily tracking.

```
POST /api/completions/toggle
Body: {
  itemType: "meal" | "workout",
  itemId: "unique-item-identifier",
  date: "2026-02-22",
  completed: true
}

GET /api/completions?date=2026-02-22
Response: [
  { itemType: "meal", itemId: "...", completed: true },
  { itemType: "workout", itemId: "...", completed: false }
]
```

**Mobile implementation:**
- Checkbox with animated checkmark (spring animation)
- Optimistic toggle (update UI immediately)
- Queue failed toggles for retry (offline support)
- Completion percentage shown in daily view header
- Haptic feedback on completion

### 5. Allowance / Economy System

The allowance system governs how many swap and regeneration operations a user can perform.

```
GET /api/allowance/current
Response: {
  mealSwapsUsed: 2,
  mealSwapsMax: 5,
  mealRegensUsed: 1,
  mealRegensMax: 3,
  workoutRegensUsed: 0,
  workoutRegensMax: 2,
  flexTokens: 3,
  nextResetAt: "2026-02-24T00:00:00Z"
}
```

**UX flow:**
1. Before any swap/regen action, check allowance state
2. If allowance remaining > 0 → proceed with action
3. If allowance exhausted → show "Allowance used" message with reset countdown
4. If flex tokens available → offer "Use Flex Token?" confirmation
5. `POST /api/allowance/redeem-flex` to convert flex token → bonus regen

**Mobile presentation:**
- Show remaining allowance as pill badges on swap/regen buttons (e.g., "Swap (3 left)")
- Progress bar or ring showing usage vs. max
- Countdown timer to next reset

---

## Design System Reference

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| **Primary** | `#0E3B2E` | Deep emerald — primary buttons, active states, branding |
| **Primary Light** | `#16503E` | Hover/pressed states on primary |
| **Meal Accent** | `#A16207` | Amber — meal plan cards, nutrition-related elements |
| **Workout Accent** | `#059669` | Emerald green — workout plan cards, training elements |
| **Background** | `#FAFAF8` | Warm neutral — app background (light mode) |
| **Surface** | `#FFFFFF` | Card backgrounds (light mode) |
| **Background Dark** | `#0F1419` | App background (dark mode) |
| **Surface Dark** | `#1C2530` | Card backgrounds (dark mode) |
| **Text Primary** | `#1A1A1A` | Main text (light mode) |
| **Text Secondary** | `#6B7280` | Supporting text |
| **Text Tertiary** | `#9CA3AF` | Least important text |
| **Border** | `#E5E7EB` | Subtle borders and dividers |

### Score Ring Colors (4-tier, psychology-based)

| Range | Color | Hex | Meaning |
|-------|-------|-----|---------|
| 0–25% | Red | `#EF4444` | Needs attention |
| 26–50% | Amber | `#F59E0B` | Below target |
| 51–75% | Light Green | `#84CC16` | Good progress |
| 76–100% | Emerald Green | `#10B981` | Excellent |

### Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| App font family | Inter | — | — |
| Screen title | Inter | 20pt | SemiBold (600) |
| Section header | Inter | 16pt | SemiBold (600) |
| Body text | Inter | 14pt | Regular (400) |
| Caption / label | Inter | 12pt | Medium (500) |
| Tab bar label | Inter | 10pt | Medium (500) |
| Badge text | Inter | 11pt | SemiBold (600) |

**React Native setup:**
```typescript
// Use expo-font or react-native-asset to load Inter
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
```

### Dark Mode

- **Essential** — must be supported from day one
- Persist theme preference in device settings (`AsyncStorage` key: `@theme`)
- Respect system preference via `useColorScheme()` as default
- Allow manual override in Settings screen
- Use `React.createContext` for theme provider
- All colors should reference theme tokens, never hardcoded hex values in components

### Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4pt | Tight spacing (inline elements) |
| `sm` | 8pt | Compact spacing (within cards) |
| `md` | 12pt | Standard spacing (between card sections) |
| `lg` | 16pt | Section spacing |
| `xl` | 24pt | Screen padding, major section gaps |
| `2xl` | 32pt | Screen-level vertical spacing |

### Component Patterns

| Component | Style Notes |
|-----------|------------|
| Cards | Rounded corners (12pt radius), subtle border or shadow, consistent padding (16pt) |
| Buttons | Primary: filled `#0E3B2E`, text white. Secondary: outlined. Minimum touch target 44pt. |
| Tab bar | 4 items max. Active: primary color. Inactive: gray. |
| Checkboxes | Rounded square, emerald fill when checked, spring animation |
| Badges / Pills | Small rounded capsules, color-coded by type (meal amber, workout emerald) |
| Progress rings | SVG circle with animated stroke-dashoffset, color by score tier |
| Meal cards | Left accent border (amber), title + macros + feedback buttons |
| Workout cards | Left accent border (emerald), exercise list + sets/reps |

---

## Offline Considerations

### Caching Strategy

| Data Type | Cache Location | TTL | Strategy |
|-----------|---------------|-----|----------|
| Generated meal plans | SQLite / MMKV | Until plan deleted | Cache full plan JSON on first fetch. Serve from cache if offline. |
| Generated workout plans | SQLite / MMKV | Until plan deleted | Same as meal plans. |
| User profile | MMKV | 24 hours | Cache on login and after updates. |
| Goal plans | MMKV | 1 hour | Refresh on app foreground. |
| Calendar data | MMKV | 30 minutes | Refresh on tab focus. |
| Auth tokens | iOS Keychain | Per JWT TTL | Never in AsyncStorage. Use `react-native-keychain` or `expo-secure-store`. |
| Theme preference | AsyncStorage | Permanent | Simple key-value, no security concern. |
| Completion states | SQLite / MMKV | Until synced | Queue for sync. |

### Offline Queue (Write Operations)

When the device is offline, queue the following operations for sync when connectivity returns:

```typescript
interface QueuedOperation {
  id: string;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body: unknown;
  createdAt: string;
  retryCount: number;
}
```

**Queueable operations:**
- `POST /api/completions/toggle` — meal/workout completion
- `POST /api/feedback/meal` — meal feedback (like/dislike)
- `POST /api/feedback/workout` — workout feedback
- `POST /api/check-ins` — weekly check-in submission

**Non-queueable operations (require real-time response):**
- Plan generation (POST /api/plan, POST /api/workout)
- Swap/regen operations (need allowance check)
- Goal generation

**Sync strategy:**
1. Monitor connectivity with `@react-native-community/netinfo`
2. On connectivity restore, process queue in FIFO order
3. Retry failed operations up to 3 times with exponential backoff
4. Show sync indicator in UI ("Syncing 3 changes...")
5. Clear queue items after successful sync

---

## API Client Architecture

### Overview

```
┌──────────────────────────────────────────────┐
│                React Native App              │
│                                              │
│  ┌────────────┐    ┌──────────────────────┐  │
│  │  Screens   │───▶│  React Query Hooks   │  │
│  │            │    │  (useQuery,           │  │
│  │            │    │   useMutation)        │  │
│  └────────────┘    └──────────┬───────────┘  │
│                               │              │
│                    ┌──────────▼───────────┐  │
│                    │   apiRequest()        │  │
│                    │   - Base URL config   │  │
│                    │   - JWT injection     │  │
│                    │   - Auto-refresh      │  │
│                    │   - Error handling    │  │
│                    └──────────┬───────────┘  │
│                               │              │
│                    ┌──────────▼───────────┐  │
│                    │   Token Storage       │  │
│                    │   (iOS Keychain)      │  │
│                    └─────────────────────┘  │
└──────────────────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │  Perform AI API │
              │  (Express/Node) │
              └─────────────────┘
```

### Base URL Configuration

```typescript
const API_BASE_URL = __DEV__
  ? 'http://localhost:5000'
  : 'https://your-perform-ai-domain.com';
```

### JWT Authentication with Auto-Refresh

See [auth-guide.md](./auth-guide.md) for the complete `apiRequest` implementation with:
- Automatic token injection via `Authorization: Bearer <token>` header
- 401 interception with transparent token refresh
- Concurrent request queue during refresh (prevents multiple simultaneous refresh calls)
- Token rotation handling (old refresh token revoked on each use)
- Forced logout on refresh failure

### React Query Setup

```typescript
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        const [path] = queryKey as [string];
        return apiRequest(path);
      },
      staleTime: 30_000,        // 30 seconds
      gcTime: 5 * 60_000,       // 5 minutes garbage collection
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});
```

### Key Query Patterns

```typescript
// Fetch plans list
const { data: plans, isLoading } = useQuery({
  queryKey: ['/api/plans'],
});

// Fetch single plan (hierarchical key for targeted invalidation)
const { data: plan } = useQuery({
  queryKey: ['/api/plan', planId],
});

// Poll for generation status
const { data: status } = useQuery({
  queryKey: ['/api/plan', planId, 'status'],
  refetchInterval: (query) => {
    const data = query.state.data;
    if (data?.status === 'ready' || data?.status === 'failed') return false;
    return 2500; // Poll every 2.5 seconds
  },
});

// Mutation with cache invalidation
const swapMutation = useMutation({
  mutationFn: (body) =>
    apiRequest(`/api/plan/${planId}/swap`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/plan', planId] });
    queryClient.invalidateQueries({ queryKey: ['/api/allowance'] });
  },
});
```

### Optimistic Updates

Use optimistic updates for feedback and completion toggles to ensure instant UI response:

```typescript
const toggleCompletion = useMutation({
  mutationFn: (body) =>
    apiRequest('/api/completions/toggle', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey: ['/api/completions'] });
    const previous = queryClient.getQueryData(['/api/completions']);
    // Optimistically update cache
    queryClient.setQueryData(['/api/completions'], (old) => {
      // Toggle the specific item in the cached array
      return updateCompletionInCache(old, newData);
    });
    return { previous };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    queryClient.setQueryData(['/api/completions'], context?.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/completions'] });
  },
});
```

### Error Handling

| HTTP Status | Handling |
|-------------|----------|
| 401 | Auto-refresh token. If refresh fails → navigate to Login, clear tokens. |
| 403 | Show allowance exhausted message with reset countdown. |
| 429 | Show "Daily limit reached" message. Disable generation buttons. |
| 400 | Show validation error message from `response.message`. |
| 500 | Show generic error with retry button. Log to error tracking service. |
| Network error | Queue operation if queueable, otherwise show "No connection" banner. |

---

## Recommended Libraries

| Category | Library | Purpose |
|----------|---------|---------|
| Navigation | `@react-navigation/native` + `@react-navigation/bottom-tabs` + `@react-navigation/native-stack` | Tab + stack navigation |
| Data fetching | `@tanstack/react-query` | Server state management, caching, polling |
| Token storage | `react-native-keychain` or `expo-secure-store` | Secure credential storage (iOS Keychain) |
| Local storage | `react-native-mmkv` | Fast key-value cache for offline data |
| Network status | `@react-native-community/netinfo` | Connectivity detection for offline queue |
| Animations | `react-native-reanimated` + `lottie-react-native` | Smooth animations, generation progress |
| Haptics | `expo-haptics` or `react-native-haptic-feedback` | Tactile feedback on actions |
| Charts/Rings | `react-native-svg` | Score rings, progress indicators |
| Calendar | `react-native-calendars` | Month/week calendar views |
| Forms | `react-hook-form` + `zod` | Form validation (reuse shared schemas) |
| Icons | `lucide-react-native` | Consistent with web app icon set |
| Fonts | `expo-font` or `react-native-asset` | Load Inter font family |
| Date handling | `date-fns` | Date formatting and manipulation |

---

## Shared Code Opportunities

The following can be shared between web and mobile via a `shared/` package:

| Module | Path | Shareable Content |
|--------|------|------------------|
| Schema | `shared/schema.ts` | Zod schemas, TypeScript types, insert schemas |
| Validation | Extracted from schemas | Form validation rules |
| Constants | New `shared/constants.ts` | Goal type labels, meal types, score tier thresholds |
| API types | New `shared/api-types.ts` | Request/response type definitions |
| Utilities | `shared/utils.ts` | Date formatting, fingerprint generation, nutrient calculations |

> **Note:** The `shared/schema.ts` file currently imports from `drizzle-orm` and `drizzle-zod` which are server-only. For mobile sharing, extract pure Zod schemas and TypeScript types into a separate file that has no Drizzle dependencies.
