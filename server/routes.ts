import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { hash, compare } from "bcryptjs";
import { signupSchema, loginSchema, updateAccountSchema, changePasswordSchema, preferencesSchema, mealFeedbackSchema, workoutPreferencesSchema, workoutFeedbackSchema, goalPlanCreateSchema, goalGenerateInputSchema, weeklyCheckInSchema, ingredientProposalResolveSchema, exercisePreferenceSchema, insertUserProfileSchema, toggleCompletionSchema, type PlanOutput, type Preferences, type WorkoutPlanOutput } from "@shared/schema";
import { generateFullPlan, generateWorkoutPlan, generateSingleDayMeals, generateSingleDayWorkout } from "./openai";
import { generateMealFingerprint, extractKeyIngredients, normalizeItemKey } from "./meal-utils";
import { log } from "./index";
import { buildWellnessContext } from "./wellness-context";
import { evaluateConstraints, buildConstraintPromptBlock } from "./constraints/engine";
import { postValidateMealPlan, postValidateWorkoutPlan } from "./constraints/post-validation";
import type { RuleContext, PlanKind } from "./constraints/types";
import { computeWeeklySummary } from "./performance/computeWeeklySummary";
import { computePerformanceState, type PerformanceStateInput } from "./performance/performanceState";
import { computeAdaptiveModifiers, buildAdaptivePromptBlock, computeWeeklyAdaptation } from "./adaptive";
import type { AdaptiveSnapshot, AdaptiveInputs } from "./adaptive";
import { buildUserContextForGeneration, type ContextOverrides } from "./context-builder";
import connectPgSimple from "connect-pg-simple";
import { ensureJwtSecrets, generateAccessToken, generateRefreshToken, verifyAccessToken, hashRefreshToken, getRefreshTokenExpiry } from "./jwt";

const PgStore = connectPgSimple(session);

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

async function computeAdaptiveForUser(userId: string, pace?: string | null): Promise<{ snapshot: AdaptiveSnapshot; promptBlock: string }> {
  const profile = await storage.getUserProfile(userId);
  const summaries = await storage.getRecentPerformanceSummaries(userId, 4);

  const inputs: AdaptiveInputs = {
    profile: {
      primaryGoal: profile?.primaryGoal || null,
      trainingExperience: profile?.trainingExperience || null,
      activityLevel: profile?.activityLevel || null,
    },
    pace: pace || null,
    latestSummary: summaries.length > 0 ? summaries[0] : null,
    last2Summaries: summaries.slice(0, 2),
  };

  const result = computeAdaptiveModifiers(inputs);
  const promptBlock = buildAdaptivePromptBlock(result.modifiers, result.decisions);
  const snapshot: AdaptiveSnapshot = {
    modifiers: result.modifiers,
    decisions: result.decisions,
    inputsMeta: {
      summaryIdsUsed: summaries.map(s => s.id),
      computedAt: new Date().toISOString(),
    },
  };

  return { snapshot, promptBlock };
}


function requireAuth(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const payload = verifyAccessToken(token);
      req.userId = payload.userId;
      return next();
    } catch {
      return res.status(401).json({ success: false, code: "AUTH_REQUIRED", message: "Your session expired. Please log in again." });
    }
  }

  if (req.session?.userId) {
    req.userId = req.session.userId;
    return next();
  }

  return res.status(401).json({ success: false, code: "AUTH_REQUIRED", message: "Your session expired. Please log in again." });
}

function buildGoalPlanOverview(
  plan: { title?: string | null; status?: string | null; goalType?: string | null; planType?: string | null; pace?: string | null; startDate?: string | null; endDate?: string | null },
  mealPlan: { planJson?: unknown } | null,
  workoutPlan: { planJson?: unknown } | null,
) {
  // identity — always present
  const identity = {
    title: plan.title ?? "",
    status: plan.status ?? "",
    goalType: plan.goalType ?? null,
    planType: (plan.planType ?? null) as "meal" | "workout" | "both" | null,
    pace: plan.pace ?? null,
    startDate: plan.startDate ?? null,
    endDate: plan.endDate ?? null,
  };

  // weeklyStructure + training — sourced exclusively from workoutPlan.planJson.days
  let weeklyStructure: { totalDays: number; workoutDays: number; restDays: number; workoutPattern: boolean[] } | null = null;
  let training: { frequencyPerWeek: number | null; focusModes: string[]; avgDurationMinutes: number | null } | null = null;

  const workoutPlanJson = workoutPlan?.planJson as Record<string, any> | null | undefined;
  const workoutDays: any[] = Array.isArray(workoutPlanJson?.days) ? workoutPlanJson.days : [];

  if (workoutPlan && workoutDays.length > 0) {
    const totalDays = workoutDays.length;
    const workoutPattern = workoutDays.map((d: any) => d.isWorkoutDay === true);
    const workoutDayCount = workoutPattern.filter(Boolean).length;

    weeklyStructure = {
      totalDays,
      workoutDays: workoutDayCount,
      restDays: totalDays - workoutDayCount,
      workoutPattern,
    };

    const activeSessions = workoutDays
      .filter((d: any) => d.isWorkoutDay === true && d.session != null)
      .map((d: any) => d.session);

    const focusModesOrdered: string[] = [];
    const seenModes = new Set<string>();
    for (const s of activeSessions) {
      if (typeof s.mode === "string" && s.mode.trim() !== "" && !seenModes.has(s.mode)) {
        seenModes.add(s.mode);
        focusModesOrdered.push(s.mode);
      }
    }

    const validDurations = activeSessions
      .map((s: any) => typeof s.durationMinutes === "number" ? s.durationMinutes : null)
      .filter((d): d is number => d !== null && d > 0);

    const avgDurationMinutes = validDurations.length > 0
      ? Math.round(validDurations.reduce((a, b) => a + b, 0) / validDurations.length)
      : null;

    training = {
      frequencyPerWeek: workoutDayCount,
      focusModes: focusModesOrdered,
      avgDurationMinutes,
    };
  }

  // nutrition — sourced exclusively from mealPlan.planJson.nutritionNotes
  let nutrition: { calories: string | null; protein_g: string | null; carbs_g: string | null; fat_g: string | null; howThisSupportsGoal: string[] } | null = null;

  const mealPlanJson = mealPlan?.planJson as Record<string, any> | null | undefined;
  const nutritionNotes = mealPlanJson?.nutritionNotes;

  if (mealPlan && nutritionNotes != null && typeof nutritionNotes === "object") {
    const macros = nutritionNotes.dailyMacroTargetsRange;
    nutrition = {
      calories: typeof macros?.calories === "string" ? macros.calories : null,
      protein_g: typeof macros?.protein_g === "string" ? macros.protein_g : null,
      carbs_g: typeof macros?.carbs_g === "string" ? macros.carbs_g : null,
      fat_g: typeof macros?.fat_g === "string" ? macros.fat_g : null,
      howThisSupportsGoal: Array.isArray(nutritionNotes.howThisSupportsGoal)
        ? (nutritionNotes.howThisSupportsGoal as unknown[]).filter((s): s is string => typeof s === "string")
        : [],
    };
  }

  return { identity, weeklyStructure, nutrition, training };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
        tableName: "user_sessions",
      }),
      secret: process.env.SESSION_SECRET || "meal-plan-default-session-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    })
  );

  ensureJwtSecrets();
  log("Mounted auth routes: /api/auth/token-login, /api/auth/refresh, /api/auth/token-logout", "auth");

  // ACTIVE — user registration, session-based signup
  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const existing = await storage.getUserByEmail(parsed.data.email);
      if (existing) {
        return res.status(409).json({ message: "Email already in use" });
      }

      const passwordHash = await hash(parsed.data.password, 10);
      const user = await storage.createUser(parsed.data.email, passwordHash, parsed.data.firstName);

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          log(`Session save error on signup: ${err}`, "auth");
          return res.status(500).json({ message: "Internal server error" });
        }
        return res.json({ id: user.id, email: user.email, firstName: user.firstName ?? null });
      });
    } catch (err) {
      log(`Signup error: ${err}`, "auth");
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ACTIVE — session-based login for web client
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const user = await storage.getUserByEmail(parsed.data.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const valid = await compare(parsed.data.password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          log(`Session save error on login: ${err}`, "auth");
          return res.status(500).json({ message: "Internal server error" });
        }
        return res.json({ id: user.id, email: user.email, firstName: user.firstName ?? null });
      });
    } catch (err) {
      log(`Login error: ${err}`, "auth");
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ACTIVE — session logout for web client
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  // ACTIVE — returns current authenticated user; supports both Bearer token and session
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    let userId: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const payload = verifyAccessToken(authHeader.slice(7));
        userId = payload.userId;
      } catch {
        return res.status(401).json({ message: "Invalid or expired token" });
      }
    } else if (req.session?.userId) {
      userId = req.session.userId;
    }

    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({ id: user.id, email: user.email, firstName: user.firstName ?? null });
  });

  // ACTIVE — update account name/email
  app.patch("/api/account", requireAuth, async (req: Request, res: Response) => {
    if (!req.userId) return res.status(401).json({ message: "Not authenticated" });
    try {
      const parsed = updateAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const { firstName, email } = parsed.data;
      if (!firstName && !email) {
        return res.status(400).json({ message: "No fields to update" });
      }
      if (email) {
        const existing = await storage.getUserByEmail(email);
        if (existing && existing.id !== req.userId) {
          return res.status(409).json({ message: "Email already in use" });
        }
      }
      const updated = await storage.updateUser(req.userId, { firstName, email });
      if (!updated) return res.status(404).json({ message: "User not found" });
      return res.json({ id: updated.id, email: updated.email, firstName: updated.firstName ?? null });
    } catch (err) {
      log(`Account update error: ${err}`, "auth");
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ACTIVE — password change for authenticated user
  app.post("/api/account/change-password", requireAuth, async (req: Request, res: Response) => {
    if (!req.userId) return res.status(401).json({ message: "Not authenticated" });
    try {
      const parsed = changePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const user = await storage.getUserById(req.userId);
      if (!user) return res.status(401).json({ message: "Not authenticated" });
      const valid = await compare(parsed.data.currentPassword, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      const newHash = await hash(parsed.data.newPassword, 10);
      await storage.updateUser(req.userId, { passwordHash: newHash });
      return res.json({ ok: true });
    } catch (err) {
      log(`Password change error: ${err}`, "auth");
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ACTIVE — JWT-based login for iOS app; issues access + refresh tokens
  app.post("/api/auth/token-login", async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const user = await storage.getUserByEmail(parsed.data.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const valid = await compare(parsed.data.password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const accessToken = generateAccessToken(user);
      const rawRefreshToken = generateRefreshToken();
      const tokenHash = hashRefreshToken(rawRefreshToken);
      const expiresAt = getRefreshTokenExpiry();

      await storage.createRefreshToken(
        user.id,
        tokenHash,
        expiresAt,
        req.headers["user-agent"] || undefined,
        req.ip || undefined
      );

      return res.json({
        accessToken,
        refreshToken: rawRefreshToken,
        user: { id: user.id, email: user.email, firstName: user.firstName ?? null },
      });
    } catch (err) {
      log(`Token login error: ${err}`, "auth");
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ACTIVE — JWT refresh token rotation for iOS app
  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    try {
      const rawToken = req.body?.refreshToken;
      if (!rawToken || typeof rawToken !== "string") {
        return res.status(400).json({ message: "refreshToken is required" });
      }

      const tokenHash = hashRefreshToken(rawToken);
      const stored = await storage.getRefreshTokenByHash(tokenHash);

      if (!stored) {
        return res.status(401).json({ message: "Invalid refresh token" });
      }

      if (stored.expiresAt < new Date()) {
        await storage.revokeRefreshToken(stored.id);
        return res.status(401).json({ message: "Refresh token expired" });
      }

      await storage.revokeRefreshToken(stored.id);

      const user = await storage.getUserById(stored.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const accessToken = generateAccessToken(user);
      const newRawRefresh = generateRefreshToken();
      const newHash = hashRefreshToken(newRawRefresh);
      const expiresAt = getRefreshTokenExpiry();

      await storage.createRefreshToken(
        user.id,
        newHash,
        expiresAt,
        req.headers["user-agent"] || undefined,
        req.ip || undefined
      );

      return res.json({
        accessToken,
        refreshToken: newRawRefresh,
      });
    } catch (err) {
      log(`Token refresh error: ${err}`, "auth");
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ACTIVE — JWT logout; revokes refresh token for iOS app
  app.post("/api/auth/token-logout", async (req: Request, res: Response) => {
    try {
      const rawToken = req.body?.refreshToken;
      if (!rawToken || typeof rawToken !== "string") {
        return res.status(400).json({ message: "refreshToken is required" });
      }

      const tokenHash = hashRefreshToken(rawToken);
      const stored = await storage.getRefreshTokenByHash(tokenHash);

      if (stored) {
        await storage.revokeRefreshToken(stored.id);
      }

      return res.json({ ok: true });
    } catch (err) {
      log(`Token logout error: ${err}`, "auth");
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ACTIVE — hard-delete user account and all associated data
  app.delete("/api/me", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      log(`Delete account request for user ${userId}`, "auth");

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          code: "USER_NOT_FOUND",
          message: "Account not found.",
        });
      }

      await storage.deleteUser(userId);

      if (req.session) {
        req.session.destroy(() => {});
      }

      log(`Account deleted for user ${userId}`, "auth");
      return res.json({ success: true });
    } catch (err: any) {
      log(`Delete account error for user ${req.userId}: ${err?.message || err}`, "error");
      return res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Something went wrong on our side. Please try again.",
      });
    }
  });

  // ACTIVE — fetch user Performance Blueprint / profile
  app.get("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const profile = await storage.getUserProfile(req.userId!);
      return res.json(profile || null);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load profile" });
    }
  });

  // ACTIVE — create user Performance Blueprint (first-time setup)
  app.post("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertUserProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid profile data", errors: parsed.error.errors });
      }
      const existing = await storage.getUserProfile(req.userId!);
      if (existing) {
        return res.status(409).json({ message: "Profile already exists. Use PUT to update." });
      }
      const profile = await storage.createUserProfile(req.userId!, parsed.data);
      return res.json(profile);
    } catch (err) {
      console.error("Profile creation error:", err);
      return res.status(500).json({ message: "Failed to create profile" });
    }
  });

  // ACTIVE — upsert user Performance Blueprint (create or update)
  app.put("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertUserProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid profile data", errors: parsed.error.errors });
      }
      const existing = await storage.getUserProfile(req.userId!);
      if (!existing) {
        const profile = await storage.createUserProfile(req.userId!, parsed.data);
        return res.json(profile);
      }
      const profile = await storage.updateUserProfile(req.userId!, parsed.data);
      return res.json(profile);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // ACTIVE — record like/dislike feedback for a meal; triggers ingredient preference derivation
  app.post("/api/feedback/meal", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = mealFeedbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid feedback data" });
      }

      const userId = req.userId!;
      const { planId, mealFingerprint, mealName, cuisineTag, feedback, ingredients } = parsed.data;

      const record = await storage.upsertMealFeedback(userId, {
        mealPlanId: planId,
        mealFingerprint,
        mealName,
        cuisineTag,
        feedback,
      });

      let proposalId: string | null = null;
      let proposalIngredients: string[] = [];

      if (feedback === "dislike" && ingredients && ingredients.length > 0) {
        const keyIngredients = extractKeyIngredients(ingredients);
        if (keyIngredients.length > 0) {
          const proposal = await storage.createIngredientProposal(userId, mealFingerprint, mealName, keyIngredients);
          proposalId = proposal.id;
          proposalIngredients = keyIngredients;
        }
      }

      if (feedback === "like" && ingredients && ingredients.length > 0) {
        const keyIngredients = extractKeyIngredients(ingredients);
        for (const ing of keyIngredients) {
          await storage.upsertIngredientPreference(userId, ing, "prefer", "derived");
        }
      }

      return res.json({ record, feedback, proposalId, proposalIngredients });
    } catch (err) {
      log(`Feedback error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to save feedback" });
    }
  });

  // ACTIVE — fetch all meal and ingredient preferences for the user
  app.get("/api/preferences", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const allFeedback = await storage.getAllMealFeedback(userId);
      const allIngPrefs = await storage.getAllIngredientPreferences(userId);

      const likedMeals = allFeedback.filter(f => f.feedback === "like");
      const dislikedMeals = allFeedback.filter(f => f.feedback === "dislike");
      const avoidIngredients = allIngPrefs.filter(p => p.preference === "avoid");
      const preferIngredients = allIngPrefs.filter(p => p.preference === "prefer");

      return res.json({ likedMeals, dislikedMeals, avoidIngredients, preferIngredients });
    } catch (err) {
      log(`Preferences fetch error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to load preferences" });
    }
  });

  // ACTIVE — delete a saved meal feedback record
  app.delete("/api/preferences/meal/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const deleted = await storage.deleteMealFeedback(req.params.id as string, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Meal feedback not found" });
      }
      return res.json({ ok: true });
    } catch (err) {
      log(`Delete meal feedback error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to delete meal feedback" });
    }
  });

  // ACTIVE — delete a saved ingredient preference record
  app.delete("/api/preferences/ingredient/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const deleted = await storage.deleteIngredientPreference(req.params.id as string, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Ingredient preference not found" });
      }
      return res.json({ ok: true });
    } catch (err) {
      log(`Delete ingredient preference error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to delete ingredient preference" });
    }
  });

  // ACTIVE — fetch meal feedback map (fingerprint→reaction) for a given plan
  app.get("/api/feedback/plan/:planId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const feedbacks = await storage.getMealFeedbackForPlan(userId, req.params.planId as string);
      const feedbackMap: Record<string, "like" | "dislike"> = {};
      for (const f of feedbacks) {
        feedbackMap[f.mealFingerprint] = f.feedback as "like" | "dislike";
      }
      return res.json(feedbackMap);
    } catch (err) {
      log(`Feedback fetch error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to load feedback" });
    }
  });

  // ACTIVE — web calendar meal aggregation used by plan-calendar.tsx
  app.get("/api/calendar/all", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const scheduledPlans = await storage.getScheduledPlans(userId);

      const SLOT_ORDER: Record<string, number> = { breakfast: 1, lunch: 2, dinner: 3, snack: 4 };
      const allSlots = new Set<string>();
      const dayMap = new Map<string, { date: string; meals: Record<string, any>; planIds: string[] }>();

      for (const plan of scheduledPlans) {
        const planJson = plan.planJson as PlanOutput;
        const prefs = plan.preferencesJson as Preferences;
        const startDate = plan.planStartDate!;

        const mealSlots = (prefs.mealsPerDay === 2 && prefs.mealSlots && prefs.mealSlots.length === 2)
          ? prefs.mealSlots
          : (prefs.mealsPerDay === 2 ? ["lunch", "dinner"] : ["breakfast", "lunch", "dinner"]);
        for (const s of mealSlots) allSlots.add(s);

        for (let i = 0; i < planJson.days.length; i++) {
          const day = planJson.days[i];
          const date = new Date(startDate + "T00:00:00");
          date.setDate(date.getDate() + i);
          const dateStr = date.toISOString().slice(0, 10);

          if (!dayMap.has(dateStr)) {
            dayMap.set(dateStr, { date: dateStr, meals: {}, planIds: [] });
          }
          const entry = dayMap.get(dateStr)!;
          if (!entry.planIds.includes(plan.id)) entry.planIds.push(plan.id);

          for (const slot of mealSlots) {
            const meal = (day.meals as any)[slot];
            if (meal && !entry.meals[slot]) {
              entry.meals[slot] = meal;
            }
          }
        }
      }

      const sortedSlots = Array.from(allSlots).sort((a, b) => (SLOT_ORDER[a] || 99) - (SLOT_ORDER[b] || 99));
      const days = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

      return res.json({ mealSlots: sortedSlots, days });
    } catch (err) {
      log(`Calendar all error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to load calendar data" });
    }
  });

  // ACTIVE — returns occupied date ranges for meal and workout plans; used by iOS scheduling UI
  app.get("/api/availability", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const excludeGoalId = req.query.excludeGoalId as string | undefined;

      const mealDates = new Set<string>();
      const workoutDates = new Set<string>();

      const mealPlans = await storage.getScheduledPlans(userId);
      for (const plan of mealPlans) {
        if (excludeGoalId) {
          const goalPlans = await storage.getGoalPlansByUser(userId);
          const parentGoal = goalPlans.find(g => g.mealPlanId === plan.id);
          if (parentGoal && parentGoal.id === excludeGoalId) continue;
        }
        const planJson = plan.planJson as PlanOutput;
        const startDate = plan.planStartDate!;
        for (let i = 0; i < planJson.days.length; i++) {
          const date = new Date(startDate + "T00:00:00");
          date.setDate(date.getDate() + i);
          mealDates.add(date.toISOString().slice(0, 10));
        }
      }

      const workoutPlansList = await storage.getScheduledWorkoutPlans(userId);
      for (const plan of workoutPlansList) {
        if (!plan.planStartDate || !plan.planJson) continue;
        if (excludeGoalId) {
          const goalPlans = await storage.getGoalPlansByUser(userId);
          const parentGoal = goalPlans.find(g => g.workoutPlanId === plan.id);
          if (parentGoal && parentGoal.id === excludeGoalId) continue;
        }
        const planJson = plan.planJson as WorkoutPlanOutput;
        for (let i = 0; i < planJson.days.length; i++) {
          const date = new Date(plan.planStartDate + "T00:00:00");
          date.setDate(date.getDate() + i);
          workoutDates.add(date.toISOString().slice(0, 10));
        }
      }

      return res.json({
        mealDates: Array.from(mealDates),
        workoutDates: Array.from(workoutDates),
        allDates: Array.from(new Set([...mealDates, ...workoutDates])),
      });
    } catch (err) {
      log(`Availability error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to load availability" });
    }
  });

  // ACTIVE — record like/dislike feedback for a workout session
  app.post("/api/feedback/workout", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = workoutFeedbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid feedback data" });
      }
      const userId = req.userId!;
      const record = await storage.upsertWorkoutFeedback(userId, parsed.data);
      return res.json({ record, feedback: parsed.data.feedback });
    } catch (err) {
      log(`Workout feedback error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to save workout feedback" });
    }
  });

  // ACTIVE — fetch workout feedback map (sessionKey→reaction) for a given plan
  app.get("/api/feedback/workout/:planId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const feedbacks = await storage.getWorkoutFeedbackForPlan(userId, req.params.planId as string);
      const feedbackMap: Record<string, "like" | "dislike"> = {};
      for (const f of feedbacks) {
        feedbackMap[f.sessionKey] = f.feedback as "like" | "dislike";
      }
      return res.json(feedbackMap);
    } catch (err) {
      log(`Workout feedback fetch error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to load workout feedback" });
    }
  });

  // ACTIVE — fetch liked/disliked/avoided exercise preferences
  app.get("/api/preferences/exercise", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const prefs = await storage.getExercisePreferences(userId);
      const liked = prefs.filter(p => p.status === "liked");
      const disliked = prefs.filter(p => p.status === "disliked");
      const avoided = prefs.filter(p => p.status === "avoided");
      return res.json({ liked, disliked, avoided });
    } catch (err) {
      log(`Exercise preferences fetch error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to load exercise preferences" });
    }
  });

  // ACTIVE — upsert an exercise preference (liked/disliked/avoided)
  app.post("/api/preferences/exercise", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = exercisePreferenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid data" });
      }
      const userId = req.userId!;
      const { exerciseKey, exerciseName, status } = parsed.data;
      const record = await storage.upsertExercisePreference(userId, exerciseKey, exerciseName, status);
      return res.json(record);
    } catch (err) {
      log(`Exercise preference upsert error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to save exercise preference" });
    }
  });

  // ACTIVE — delete an exercise preference by record ID
  app.delete("/api/preferences/exercise/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const deleted = await storage.deleteExercisePreferenceById(req.params.id as string, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Exercise preference not found" });
      }
      return res.json({ ok: true });
    } catch (err) {
      log(`Exercise preference delete error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to delete exercise preference" });
    }
  });

  // ACTIVE — delete an exercise preference by exercise key
  app.delete("/api/preferences/exercise/key/:key", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const deleted = await storage.deleteExercisePreference(userId, req.params.key as string);
      if (!deleted) {
        return res.status(404).json({ message: "Exercise preference not found" });
      }
      return res.json({ ok: true });
    } catch (err) {
      log(`Exercise preference delete error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to delete exercise preference" });
    }
  });

  // DEPRECATED — bare Wellness Plan creation without AI generation; superseded by POST /api/goal-plans/generate
  app.post("/api/goal-plans", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = goalPlanCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid goal plan data" });
      }
      const userId = req.userId!;
      const plan = await storage.createGoalPlan(userId, parsed.data.goalType, parsed.data.startDate);
      return res.json(plan);
    } catch (err) {
      log(`Goal plan creation error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to create goal plan" });
    }
  });

  // ACTIVE — primary Wellness Plan AI generation flow; creates goal_plan + meal plan + workout plan
  app.post("/api/goal-plans/generate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;

      const bodyParsed = goalGenerateInputSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: bodyParsed.error.flatten().fieldErrors });
      }
      const { goalType, planType, startDate, pace, globalInputs, mealPreferences, workoutPreferences } = bodyParsed.data;

      // Normalize legacy goal types to new taxonomy
      const GOAL_TYPE_MAP: Record<string, string> = {
        performance: "athletic_performance",
        maintenance: "general_fitness",
        energy: "general_fitness",
        mobility: "general_fitness",
        endurance: "general_fitness",
        strength: "muscle_gain",
      };
      const normalizedGoalType: string = GOAL_TYPE_MAP[goalType] || goalType;

      const aiCalls = await storage.getAiCallCountToday(userId);
      if (aiCalls >= 10) {
        return res.status(429).json({ message: "Daily AI call limit reached (10/day). Try again tomorrow." });
      }

      const validStartDate = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : undefined;
      const resolvedPlanType = planType || "both";
      const needsWorkout = resolvedPlanType === "both" || resolvedPlanType === "workout";
      const needsMeal = resolvedPlanType === "both" || resolvedPlanType === "meal";

      const GOAL_TITLE_PREFIXES: Record<string, string[]> = {
        weight_loss: ["Lean Start", "Cut Phase", "Slim Down"],
        muscle_gain: ["Build Phase", "Gain Mode", "Mass Drive"],
        body_recomposition: ["Recomp Phase", "Transform Mode", "Shape Shift"],
        general_fitness: ["Fresh Start", "New Chapter", "Kickoff"],
        athletic_performance: ["Peak Performance", "Level Up", "Go Mode"],
        // legacy fallbacks
        performance: ["Peak Performance", "Level Up", "Go Mode"],
        maintenance: ["Steady State", "Stay Strong", "Balance"],
        energy: ["Energy Boost", "Power Up", "Recharge"],
        mobility: ["Flex Flow", "Move Better", "Limber Up"],
        endurance: ["Long Game", "Mile Maker", "Stay Going"],
        strength: ["Iron Path", "Power Phase", "Lift Off"],
      };
      const prefixes = GOAL_TITLE_PREFIXES[normalizedGoalType] || GOAL_TITLE_PREFIXES["general_fitness"];
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const goalTitle = prefix;

      const initialProgress = {
        stage: needsWorkout ? "TRAINING" : (needsMeal ? "NUTRITION" : "FINALIZING"),
        stageStatuses: {
          TRAINING: needsWorkout ? "PENDING" : "SKIPPED",
          NUTRITION: needsMeal ? "PENDING" : "SKIPPED",
          SCHEDULING: "PENDING",
          FINALIZING: "PENDING",
        },
      };

      const userProfile = await storage.getUserProfile(userId);
      if (!userProfile) {
        return res.status(400).json({ message: "Profile is required before creating a plan. Please set up your Performance Blueprint first." });
      }

      const planKind: PlanKind = resolvedPlanType === "both" ? "both" : resolvedPlanType === "meal" ? "meal" : "workout";
      const [scheduledMealDates, scheduledWorkoutDates] = await Promise.all([
        storage.getScheduledMealPlanDates(userId),
        storage.getScheduledWorkoutPlanDates(userId),
      ]);

      const ruleCtx: RuleContext = {
        profile: userProfile,
        planKind,
        startDate: validStartDate,
        mealPreferences: mealPreferences,
        workoutPreferences: workoutPreferences,
        existingScheduledMealDates: scheduledMealDates,
        existingScheduledWorkoutDates: scheduledWorkoutDates,
      };

      const constraintResult = evaluateConstraints(ruleCtx);
      log(`Constraint engine: ${constraintResult.violations.length} violation(s), blocked=${constraintResult.blocked}`, "plan");

      if (constraintResult.blocked) {
        const blockViolations = constraintResult.violations.filter(v => v.severity === "BLOCK");
        await storage.createConstraintViolations(
          constraintResult.violations.map(v => ({
            userId,
            planType: planKind,
            stage: "pre",
            ruleKey: v.ruleKey,
            severity: v.severity,
            message: v.message,
            metaJson: v.metadata || null,
          }))
        );
        return res.status(400).json({
          message: blockViolations[0]?.message || "Plan generation blocked by safety constraints.",
          blocked: true,
          violations: constraintResult.violations.map(v => ({
            ruleKey: v.ruleKey,
            severity: v.severity,
            message: v.message,
            category: v.category,
          })),
        });
      }

      if (constraintResult.violations.length > 0) {
        await storage.createConstraintViolations(
          constraintResult.violations.map(v => ({
            userId,
            planType: planKind,
            stage: "pre",
            ruleKey: v.ruleKey,
            severity: v.severity,
            message: v.message,
            metaJson: v.metadata || null,
          }))
        );
      }

      let constraintPromptBlock = buildConstraintPromptBlock(constraintResult.safeSpec, planKind, userProfile.nextWeekPlanBias);

      const adaptive = await computeAdaptiveForUser(userId, pace);
      constraintPromptBlock += adaptive.promptBlock;

      // Validate preferences before writing to storage (Task 2 hardening)
      let validatedMealPrefs: Preferences | undefined;
      if (needsMeal && mealPreferences) {
        const mp = { ...mealPreferences } as any;
        if (mp.goal === "fat_loss") mp.goal = "weight_loss";
        const parsed = preferencesSchema.safeParse(mp);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid meal preferences", errors: parsed.error.flatten().fieldErrors });
        }
        validatedMealPrefs = parsed.data;
      }

      let validatedWorkoutPrefs: ReturnType<typeof workoutPreferencesSchema.parse> | undefined;
      if (needsWorkout && workoutPreferences) {
        const parsed = workoutPreferencesSchema.safeParse(workoutPreferences);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid workout preferences", errors: parsed.error.flatten().fieldErrors });
        }
        validatedWorkoutPrefs = parsed.data;
      }

      const goalPlan = await storage.createGoalPlanFull(userId, {
        goalType: normalizedGoalType,
        planType: resolvedPlanType,
        startDate: validStartDate,
        endDate: validStartDate ? (() => {
          const d = new Date(validStartDate + "T00:00:00");
          d.setDate(d.getDate() + 6);
          return d.toISOString().split("T")[0];
        })() : undefined,
        pace: pace || undefined,
        title: goalTitle,
        globalInputs: { ...(globalInputs || {}), type: "standard" },
        nutritionInputs: needsMeal ? (validatedMealPrefs ?? null) : undefined,
        trainingInputs: needsWorkout ? (validatedWorkoutPrefs ?? null) : undefined,
        status: "generating",
        progress: initialProgress,
        profileSnapshot: userProfile || undefined,
        adaptiveSnapshot: adaptive.snapshot,
      });

      (async () => {
        try {
          let workoutPlanId: string | null = null;
          let mealPlanId: string | null = null;

          const parsedWorkoutForCtx = needsWorkout && workoutPreferences ? workoutPreferencesSchema.safeParse(workoutPreferences) : null;
          const parsedMealForCtx = needsMeal && mealPreferences ? (() => { const mp = { ...mealPreferences }; if (mp.goal === "fat_loss") mp.goal = "weight_loss"; return preferencesSchema.safeParse(mp); })() : null;

          const wellnessCtx = buildWellnessContext({
            goalType: normalizedGoalType,
            secondaryFocus: (userProfile as any).secondaryFocus ?? undefined,
            startDate: validStartDate,
            endDate: validStartDate ? (() => { const d = new Date(validStartDate + "T00:00:00"); d.setDate(d.getDate() + 6); return d.toISOString().split("T")[0]; })() : undefined,
            mealPrefs: parsedMealForCtx?.success ? parsedMealForCtx.data : undefined,
            workoutPrefs: parsedWorkoutForCtx?.success ? parsedWorkoutForCtx.data : undefined,
            globalInputs: globalInputs || undefined,
          });

          if (needsWorkout && workoutPreferences) {
            await storage.updateGoalPlan(goalPlan.id, {
              progress: { ...initialProgress, stage: "TRAINING", stageStatuses: { ...initialProgress.stageStatuses, TRAINING: "RUNNING" } },
            });

            const parsedWorkout = workoutPreferencesSchema.safeParse(workoutPreferences);
            if (!parsedWorkout.success) {
              throw new Error("Invalid workout preferences");
            }
            const wIdempotencyKey = crypto.randomUUID();
            const pendingWorkout = await storage.createPendingWorkoutPlan(userId, wIdempotencyKey, parsedWorkout.data, validStartDate, userProfile, adaptive.snapshot, goalPlan.id);
            workoutPlanId = pendingWorkout.id;
            await storage.updateGoalPlan(goalPlan.id, { workoutPlanId });

            log(`Goal gen: generating workout plan ${pendingWorkout.id}`, "openai");
            const goalPrefContext = await storage.getUserPreferenceContext(userId);
            const goalExerciseCtx = { avoidedExercises: goalPrefContext.avoidedExercises, dislikedExercises: goalPrefContext.dislikedExercises };
            const goalFormEquip = (parsedWorkout.data as any).equipmentAvailable as string[] | undefined;
            const goalWorkoutCtx = buildUserContextForGeneration(userProfile, goalFormEquip && goalFormEquip.length > 0 ? { equipmentAvailable: goalFormEquip } : undefined);
            const goalConstraintBlock = constraintPromptBlock + goalWorkoutCtx.workoutPromptBlock;
            const result = await generateWorkoutPlan(parsedWorkout.data, goalExerciseCtx, wellnessCtx, goalConstraintBlock, goalWorkoutCtx.profileExtras);

            const workoutPostCheck = postValidateWorkoutPlan(result, constraintResult.safeSpec);
            let finalWorkoutResult = result;
            if (workoutPostCheck.fixedPlan && !workoutPostCheck.needsRegen) {
              finalWorkoutResult = workoutPostCheck.fixedPlan;
              log(`Goal gen: workout post-validation auto-fixed ${workoutPostCheck.violations.length} violation(s)`, "plan");
            } else if (workoutPostCheck.needsRegen) {
              log(`Goal gen: workout post-validation requires regen (${workoutPostCheck.violations.length} violations)`, "plan");
              const regenResult = await generateWorkoutPlan(parsedWorkout.data, goalExerciseCtx, wellnessCtx, goalConstraintBlock + "\nSTRICT MODE: Previous generation contained banned exercises. Absolutely do NOT include any banned exercises.", goalWorkoutCtx.profileExtras);
              finalWorkoutResult = regenResult;
            }
            if (workoutPostCheck.violations.length > 0) {
              await storage.createConstraintViolations(
                workoutPostCheck.violations.map(v => ({
                  userId, planType: "workout", planId: pendingWorkout.id, goalPlanId: goalPlan.id,
                  stage: "post", ruleKey: v.ruleKey, severity: v.severity, message: v.message, metaJson: v.metadata || null,
                }))
              );
            }

            await storage.updateWorkoutPlanStatus(pendingWorkout.id, "ready", finalWorkoutResult);
            await storage.logAction(userId, "ai_call_generate_plan", { planId: pendingWorkout.id, type: "workout" });
            log(`Goal gen: workout plan ${pendingWorkout.id} ready`, "openai");

            const progressAfterTraining = {
              stage: needsMeal ? "NUTRITION" : "SCHEDULING",
              stageStatuses: {
                ...initialProgress.stageStatuses,
                TRAINING: "DONE" as const,
                ...(needsMeal ? { NUTRITION: "RUNNING" as const } : { SCHEDULING: "RUNNING" as const }),
              },
            };
            await storage.updateGoalPlan(goalPlan.id, { progress: progressAfterTraining });
          }

          if (needsMeal && mealPreferences) {
            if (!needsWorkout) {
              await storage.updateGoalPlan(goalPlan.id, {
                progress: { ...initialProgress, stage: "NUTRITION", stageStatuses: { ...initialProgress.stageStatuses, NUTRITION: "RUNNING" } },
              });
            }

            const mealPrefs = { ...mealPreferences };
            if (mealPrefs.goal === "fat_loss") mealPrefs.goal = "weight_loss";
            const parsedMeal = preferencesSchema.safeParse(mealPrefs);
            if (!parsedMeal.success) {
              throw new Error("Invalid meal preferences");
            }
            const mealIdempotencyKey = crypto.randomUUID();
            const pendingMeal = await storage.createPendingMealPlan(userId, mealIdempotencyKey, parsedMeal.data, validStartDate, userProfile, adaptive.snapshot, goalPlan.id);
            mealPlanId = pendingMeal.id;
            await storage.updateGoalPlan(goalPlan.id, { mealPlanId });

            const prefCtx = await storage.getUserPreferenceContext(userId);
            const workoutDays = parsedMeal.data.workoutDays || undefined;
            log(`Goal gen: generating meal plan ${pendingMeal.id}`, "openai");
            const goalMealCtx = buildUserContextForGeneration(userProfile);
            const mealConstraintBlock = constraintPromptBlock + goalMealCtx.mealPromptBlock;
            const planJson = await generateFullPlan(parsedMeal.data, prefCtx, workoutDays, wellnessCtx, mealConstraintBlock, goalMealCtx.profileExtras);

            const mealPostCheck = postValidateMealPlan(planJson, constraintResult.safeSpec);
            let finalMealJson = planJson;
            if (mealPostCheck.fixedPlan && !mealPostCheck.needsRegen) {
              finalMealJson = mealPostCheck.fixedPlan;
              log(`Goal gen: meal post-validation auto-fixed ${mealPostCheck.violations.length} violation(s)`, "plan");
            } else if (mealPostCheck.needsRegen) {
              log(`Goal gen: meal post-validation requires regen (${mealPostCheck.violations.length} violations)`, "plan");
              const regenPlan = await generateFullPlan(parsedMeal.data, prefCtx, workoutDays, wellnessCtx, mealConstraintBlock + "\nSTRICT MODE: Previous generation contained banned ingredients. Absolutely do NOT include any banned ingredients.", goalMealCtx.profileExtras);
              finalMealJson = regenPlan;
            }
            if (mealPostCheck.violations.length > 0) {
              await storage.createConstraintViolations(
                mealPostCheck.violations.map(v => ({
                  userId, planType: "meal", planId: pendingMeal.id, goalPlanId: goalPlan.id,
                  stage: "post", ruleKey: v.ruleKey, severity: v.severity, message: v.message, metaJson: v.metadata || null,
                }))
              );
            }

            await storage.updatePlanStatus(pendingMeal.id, "ready", finalMealJson);
            await storage.logAction(userId, "ai_call_generate_plan", { planId: pendingMeal.id, type: "meal" });
            log(`Goal gen: meal plan ${pendingMeal.id} ready`, "openai");

          }

          await storage.updateGoalPlan(goalPlan.id, {
            progress: {
              stage: "SCHEDULING",
              stageStatuses: {
                TRAINING: needsWorkout ? "DONE" : "SKIPPED",
                NUTRITION: needsMeal ? "DONE" : "SKIPPED",
                SCHEDULING: "RUNNING",
                FINALIZING: "PENDING",
              },
            },
          });

          if (validStartDate) {
            if (mealPlanId) {
              await storage.updatePlanStartDate(mealPlanId, validStartDate);
            }
            if (workoutPlanId) {
              await storage.updateWorkoutStartDate(workoutPlanId, validStartDate);
            }
          }

          await storage.updateGoalPlan(goalPlan.id, {
            progress: {
              stage: "FINALIZING",
              stageStatuses: {
                TRAINING: needsWorkout ? "DONE" : "SKIPPED",
                NUTRITION: needsMeal ? "DONE" : "SKIPPED",
                SCHEDULING: "DONE",
                FINALIZING: "RUNNING",
              },
            },
          });

          await storage.updateGoalPlan(goalPlan.id, {
            status: "ready",
            progress: {
              stage: "FINALIZING",
              stageStatuses: {
                TRAINING: needsWorkout ? "DONE" : "SKIPPED",
                NUTRITION: needsMeal ? "DONE" : "SKIPPED",
                SCHEDULING: "DONE",
                FINALIZING: "DONE",
              },
            },
          });

          log(`Goal gen: goal plan ${goalPlan.id} completed`, "openai");
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          log(`Goal gen: goal plan ${goalPlan.id} failed: ${errMsg}`, "openai");
          const currentGoal = await storage.getGoalPlan(goalPlan.id);
          const currentProgress = (currentGoal?.progress as any) || initialProgress;
          await storage.updateGoalPlan(goalPlan.id, {
            status: "failed",
            progress: {
              ...currentProgress,
              stageStatuses: {
                ...currentProgress.stageStatuses,
                [currentProgress.stage]: "FAILED",
              },
              errorMessage: errMsg,
            },
          });
        }
      })();

      return res.json({
        goalPlanId: goalPlan.id,
        mealPlanId: null,
        workoutPlanId: null,
      });
    } catch (err) {
      log(`Goal generation error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to start goal generation" });
    }
  });

  // ACTIVE — poll Wellness Plan generation progress (TRAINING → NUTRITION → SCHEDULING → FINALIZING)
  app.get("/api/goal-plans/:id/generation-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const goalPlan = await storage.getGoalPlan(req.params.id as string);
      if (!goalPlan || goalPlan.userId !== req.userId || goalPlan.deletedAt) {
        return res.status(404).json({ message: "Goal plan not found" });
      }

      const result: any = {
        goalPlanId: goalPlan.id,
        status: goalPlan.status || "generating",
        progress: goalPlan.progress || null,
        planType: goalPlan.planType || "both",
      };

      if (goalPlan.mealPlanId) {
        const mp = await storage.getMealPlan(goalPlan.mealPlanId);
        result.mealPlan = mp ? { id: mp.id, status: mp.status, errorMessage: mp.errorMessage } : null;
      }

      if (goalPlan.workoutPlanId) {
        const wp = await storage.getWorkoutPlan(goalPlan.workoutPlanId);
        result.workoutPlan = wp ? { id: wp.id, status: wp.status, errorMessage: wp.errorMessage } : null;
      }

      return res.json(result);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get generation status" });
    }
  });

  // ACTIVE — list all Wellness Plans for the authenticated user
  app.get("/api/goal-plans", requireAuth, async (req: Request, res: Response) => {
    try {
      const plans = await storage.getGoalPlansByUser(req.userId!);
      return res.json(plans);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load goal plans" });
    }
  });

  // ACTIVE — fetch a single Wellness Plan with embedded meal/workout plan details
  app.get("/api/goal-plans/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getGoalPlan(req.params.id as string);
      if (!plan || plan.userId !== req.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Goal plan not found" });
      }
      const [embeddedMealPlan, embeddedWorkoutPlan] = await Promise.all([
        plan.mealPlanId ? storage.getMealPlan(plan.mealPlanId) : Promise.resolve(null),
        plan.workoutPlanId ? storage.getWorkoutPlan(plan.workoutPlanId) : Promise.resolve(null),
      ]);
      return res.json({
        ...plan,
        mealPlan: embeddedMealPlan || null,
        workoutPlan: embeddedWorkoutPlan || null,
        overview: buildGoalPlanOverview(plan, embeddedMealPlan || null, embeddedWorkoutPlan || null),
      });
    } catch (err) {
      return res.status(500).json({ message: "Failed to load goal plan" });
    }
  });

  // ACTIVE — update Wellness Plan fields including startDate/endDate rescheduling; enforces conflict check on date changes
  app.patch("/api/goal-plans/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getGoalPlan(req.params.id as string);
      if (!plan || plan.userId !== req.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Goal plan not found" });
      }
      const { startDate } = req.body;
      let updated: typeof plan | undefined;

      if (startDate !== undefined) {
        if (startDate) {
          // Server-side conflict check when rescheduling to a new date
          const endDate = (() => {
            const d = new Date(startDate + "T00:00:00");
            d.setDate(d.getDate() + 6);
            return d.toISOString().split("T")[0];
          })();
          const allPlans = await storage.getGoalPlansByUser(req.userId!);
          for (const other of allPlans) {
            if (other.id === plan.id) continue;
            if (!other.startDate || !other.endDate) continue;
            if (startDate <= other.endDate && endDate >= other.startDate) {
              return res.status(409).json({
                message: "Requested schedule overlaps with an existing scheduled wellness plan.",
                code: "PLAN_SCHEDULE_CONFLICT",
                conflictingPlanId: other.id,
                conflictingStartDate: other.startDate,
                conflictingEndDate: other.endDate,
              });
            }
          }
          // Atomically write new dates to goal_plan + child plans
          updated = await storage.scheduleGoalPlan(plan.id, startDate, endDate, plan.mealPlanId ?? null, plan.workoutPlanId ?? null);
        } else {
          // startDate is null — clear the schedule atomically
          updated = await storage.unscheduleGoalPlan(plan.id, plan.mealPlanId ?? null, plan.workoutPlanId ?? null);
        }
      } else {
        // No date change — apply other field updates normally
        updated = await storage.updateGoalPlan(plan.id, {});
      }

      const [embeddedMealPlan, embeddedWorkoutPlan] = await Promise.all([
        updated?.mealPlanId ? storage.getMealPlan(updated.mealPlanId) : Promise.resolve(null),
        updated?.workoutPlanId ? storage.getWorkoutPlan(updated.workoutPlanId) : Promise.resolve(null),
      ]);
      return res.json({
        ...updated,
        mealPlan: embeddedMealPlan || null,
        workoutPlan: embeddedWorkoutPlan || null,
      });
    } catch (err) {
      return res.status(500).json({ message: "Failed to update goal plan" });
    }
  });

  // ACTIVE — soft-delete a Wellness Plan and its child meal/workout plans
  app.delete("/api/goal-plans/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getGoalPlan(req.params.id as string);
      if (!plan || plan.userId !== req.userId) {
        return res.status(404).json({ message: "Goal plan not found" });
      }
      if (plan.mealPlanId) {
        await storage.softDeletePlan(plan.mealPlanId);
      }
      if (plan.workoutPlanId) {
        await storage.softDeleteWorkoutPlan(plan.workoutPlanId);
      }
      await storage.softDeleteGoalPlan(plan.id);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete goal plan" });
    }
  });

  // ACTIVE — schedule a Wellness Plan to a specific week; enforces server-side conflict check (409 on overlap) and writes atomically
  app.post("/api/goal-plans/:id/schedule", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getGoalPlan(req.params.id as string);
      if (!plan || plan.userId !== req.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Goal plan not found" });
      }
      const { startDate } = req.body;
      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ message: "startDate is required (YYYY-MM-DD)" });
      }
      const endDate = (() => {
        const d = new Date(startDate + "T00:00:00");
        d.setDate(d.getDate() + 6);
        return d.toISOString().split("T")[0];
      })();

      // Server-side conflict check: reject if any other scheduled Wellness Plan overlaps this date range
      const allPlans = await storage.getGoalPlansByUser(req.userId!);
      for (const other of allPlans) {
        if (other.id === plan.id) continue; // exclude self
        if (!other.startDate || !other.endDate) continue; // skip unscheduled
        // Overlap condition: requested range intersects existing range
        if (startDate <= other.endDate && endDate >= other.startDate) {
          return res.status(409).json({
            message: "Requested schedule overlaps with an existing scheduled wellness plan.",
            code: "PLAN_SCHEDULE_CONFLICT",
            conflictingPlanId: other.id,
            conflictingStartDate: other.startDate,
            conflictingEndDate: other.endDate,
          });
        }
      }

      // Atomically update goal_plan + child meal/workout plan start dates in a single transaction
      const updated = await storage.scheduleGoalPlan(plan.id, startDate, endDate, plan.mealPlanId ?? null, plan.workoutPlanId ?? null);
      const [embeddedMealPlan, embeddedWorkoutPlan] = await Promise.all([
        updated?.mealPlanId ? storage.getMealPlan(updated.mealPlanId) : Promise.resolve(null),
        updated?.workoutPlanId ? storage.getWorkoutPlan(updated.workoutPlanId) : Promise.resolve(null),
      ]);
      return res.json({
        ...updated,
        mealPlan: embeddedMealPlan || null,
        workoutPlan: embeddedWorkoutPlan || null,
      });
    } catch (err) {
      return res.status(500).json({ message: "Failed to schedule goal plan" });
    }
  });

  // ACTIVE — remove a Wellness Plan from the schedule; clears dates atomically on goal_plan and child plans
  app.post("/api/goal-plans/:id/unschedule", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getGoalPlan(req.params.id as string);
      if (!plan || plan.userId !== req.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Goal plan not found" });
      }
      // Atomically clear goal_plan + child meal/workout plan start dates in a single transaction
      const updated = await storage.unscheduleGoalPlan(plan.id, plan.mealPlanId ?? null, plan.workoutPlanId ?? null);
      return res.json({
        ...updated,
        mealPlan: null,
        workoutPlan: null,
      });
    } catch (err) {
      return res.status(500).json({ message: "Failed to unschedule goal plan" });
    }
  });

  // ACTIVE — generate an AI-powered recovery week Wellness Plan when performance signals show decline
  app.post("/api/performance/apply-recovery-week", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { weekStart, activeWellnessPlanId } = req.body;

      if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return res.status(400).json({ message: "weekStart is required (YYYY-MM-DD)" });
      }

      const aiCalls = await storage.getAiCallCountToday(userId);
      if (aiCalls >= 10) {
        return res.status(429).json({ message: "Daily AI call limit reached (10/day). Try again tomorrow." });
      }

      const userProfile = await storage.getUserProfile(userId);
      if (!userProfile) {
        return res.status(400).json({ message: "Profile is required." });
      }

      const allMealPlans = await storage.getMealPlansByUser(userId);
      const allWorkoutPlans = await storage.getWorkoutPlansByUser(userId);

      const weekStartDate = new Date(weekStart + "T00:00:00");
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekStartDate.getDate() + 6);
      const startStr = weekStartDate.toISOString().slice(0, 10);
      const endStr = weekEndDate.toISOString().slice(0, 10);

      const currentWeek = await computeWeekScore(userId, startStr, endStr, allMealPlans, allWorkoutPlans);

      const priorWeekScores: (number | null)[] = [];
      for (let w = 3; w >= 1; w--) {
        const pStart = new Date(weekStartDate);
        pStart.setDate(weekStartDate.getDate() - w * 7);
        const pEnd = new Date(pStart);
        pEnd.setDate(pStart.getDate() + 6);
        const ps = pStart.toISOString().slice(0, 10);
        const pe = pEnd.toISOString().slice(0, 10);
        const wd = await computeWeekScore(userId, ps, pe, allMealPlans, allWorkoutPlans);
        priorWeekScores.push(wd.score);
      }
      priorWeekScores.push(currentWeek.score);

      const validScores = priorWeekScores.filter((s): s is number => s != null);
      const previousWeekScore = priorWeekScores[2] ?? null;
      const streakDays = await computeStreakDays(userId, endStr);

      if (currentWeek.score == null) {
        return res.status(409).json({ message: "No scheduled items for this week. Cannot assess performance state." });
      }

      const perfInput = {
        currentWeekOverallScore: currentWeek.score,
        previousWeekOverallScore: previousWeekScore,
        last4WeeksOverallScores: validScores.length > 0 ? validScores : [currentWeek.score],
        streakDays,
      };
      const perfState = computePerformanceState(perfInput);

      if (perfState.label !== "declining" && perfState.label !== "at_risk") {
        return res.status(409).json({
          message: "Recovery week not recommended for current state.",
          currentLabel: perfState.label,
          pcs: perfState.pcs,
        });
      }

      let sourceGoalPlan: any = null;
      if (activeWellnessPlanId) {
        sourceGoalPlan = await storage.getGoalPlan(activeWellnessPlanId);
      }
      if (!sourceGoalPlan) {
        const goalPlans = await storage.getGoalPlansByUser(userId);
        const readyPlans = goalPlans.filter(gp => gp.status === "ready" && !gp.deletedAt);
        if (readyPlans.length > 0) {
          sourceGoalPlan = readyPlans[0];
        }
      }

      if (!sourceGoalPlan) {
        return res.status(409).json({ message: "No active wellness plan found to base recovery week on." });
      }

      const targetWeekStart = new Date(weekStartDate);
      targetWeekStart.setDate(targetWeekStart.getDate() + 7);
      const targetStartStr = targetWeekStart.toISOString().slice(0, 10);
      const targetEndDate = new Date(targetWeekStart);
      targetEndDate.setDate(targetWeekStart.getDate() + 6);
      const targetEndStr = targetEndDate.toISOString().slice(0, 10);

      const sourceTraining = (sourceGoalPlan.trainingInputs as any) || {};
      const sourceNutrition = (sourceGoalPlan.nutritionInputs as any) || {};

      const origDays: string[] = sourceTraining.daysOfWeek || ["Mon", "Wed", "Fri"];
      const origSessionLength: number = sourceTraining.sessionLength || 45;
      const origTrainingMode: string = sourceTraining.trainingMode || "both";

      const reducedDays = origDays.length > 2 ? origDays.slice(0, origDays.length - 1) : [...origDays];
      const reducedSessionLength = Math.max(25, origSessionLength - 15);

      let intensityFrom = origTrainingMode;
      let intensityTo = origTrainingMode;
      if (origTrainingMode === "strength" || origTrainingMode === "both") {
        intensityTo = "mobility+strength";
      }

      const recoveryWorkoutPrefs = {
        ...sourceTraining,
        daysOfWeek: reducedDays,
        sessionLength: reducedSessionLength,
        trainingMode: intensityTo === "mobility+strength" ? "both" : origTrainingMode,
        recoveryMode: true,
      };

      const origPrepStyle: string = sourceNutrition.prepStyle || "cook_daily";
      const recoveryMealPrefs = {
        ...sourceNutrition,
        nutritionSimplicity: "high",
        cookingTime: "quick",
        recoveryMode: true,
      };
      if (recoveryMealPrefs.goal === "fat_loss") recoveryMealPrefs.goal = "weight_loss";

      const needsWorkout = sourceGoalPlan.planType === "both" || sourceGoalPlan.planType === "workout";
      const needsMeal = sourceGoalPlan.planType === "both" || sourceGoalPlan.planType === "meal";

      const goalTitle = "Recovery Week";

      const adaptive = await computeAdaptiveForUser(userId);
      const planKind: PlanKind = sourceGoalPlan.planType === "both" ? "both" : sourceGoalPlan.planType === "meal" ? "meal" : "workout";

      const [scheduledMealDates, scheduledWorkoutDates] = await Promise.all([
        storage.getScheduledMealPlanDates(userId),
        storage.getScheduledWorkoutPlanDates(userId),
      ]);

      for (let d = 0; d < 7; d++) {
        const checkDate = new Date(targetWeekStart);
        checkDate.setDate(targetWeekStart.getDate() + d);
        const checkStr = checkDate.toISOString().split("T")[0];
        if ((needsMeal && scheduledMealDates.includes(checkStr)) || (needsWorkout && scheduledWorkoutDates.includes(checkStr))) {
          return res.status(409).json({ message: `Schedule conflict: ${checkStr} already has a plan. Remove or reschedule the existing plan first.` });
        }
      }

      const ruleCtx: RuleContext = {
        profile: userProfile,
        planKind,
        startDate: targetStartStr,
        mealPreferences: needsMeal ? recoveryMealPrefs : undefined,
        workoutPreferences: needsWorkout ? recoveryWorkoutPrefs : undefined,
        existingScheduledMealDates: scheduledMealDates,
        existingScheduledWorkoutDates: scheduledWorkoutDates,
      };
      const constraintResult = evaluateConstraints(ruleCtx);
      let constraintPromptBlock = buildConstraintPromptBlock(constraintResult.safeSpec, planKind, userProfile.nextWeekPlanBias);
      constraintPromptBlock += adaptive.promptBlock;
      constraintPromptBlock += "\n\n[RECOVERY WEEK MODE] This is a recovery/deload week. Reduce intensity and volume. Prioritize mobility, flexibility, and recovery exercises. Keep meals simple with fewer ingredients and shorter prep times.";

      // Validate recovery preferences before writing to storage (Task 2 hardening)
      if (needsWorkout) {
        const parsed = workoutPreferencesSchema.safeParse(recoveryWorkoutPrefs);
        if (!parsed.success) {
          return res.status(500).json({ message: "Internal error: invalid recovery workout preferences" });
        }
      }
      if (needsMeal) {
        const parsed = preferencesSchema.safeParse(recoveryMealPrefs);
        if (!parsed.success) {
          return res.status(500).json({ message: "Internal error: invalid recovery meal preferences" });
        }
      }

      const initialProgress = {
        stage: needsWorkout ? "TRAINING" : (needsMeal ? "NUTRITION" : "FINALIZING"),
        stageStatuses: {
          TRAINING: needsWorkout ? "PENDING" : "SKIPPED",
          NUTRITION: needsMeal ? "PENDING" : "SKIPPED",
          SCHEDULING: "PENDING",
          FINALIZING: "PENDING",
        },
      };

      const goalPlan = await storage.createGoalPlanFull(userId, {
        goalType: sourceGoalPlan.goalType,
        planType: sourceGoalPlan.planType,
        startDate: targetStartStr,
        endDate: targetEndStr,
        title: goalTitle,
        globalInputs: {
          ...(sourceGoalPlan.globalInputs as any || {}),
          type: "recovery_week",
          adjustmentApplied: {
            type: "recovery_week_v1",
            appliedAt: new Date().toISOString(),
            basedOnWeekStart: weekStart,
            performanceLabel: perfState.label,
            pcs: perfState.pcs,
          },
        },
        nutritionInputs: needsMeal ? recoveryMealPrefs : undefined,
        trainingInputs: needsWorkout ? recoveryWorkoutPrefs : undefined,
        status: "generating",
        progress: initialProgress,
        profileSnapshot: userProfile,
        adaptiveSnapshot: adaptive.snapshot,
      });

      const changes = {
        training: [] as { label: string; from: any; to: any }[],
        nutrition: [] as { label: string; from: any; to: any }[],
        reason: perfState.explanation,
      };

      if (needsWorkout) {
        if (origDays.length !== reducedDays.length) {
          changes.training.push({ label: "Training days", from: origDays.length, to: reducedDays.length });
        }
        if (origSessionLength !== reducedSessionLength) {
          changes.training.push({ label: "Session duration", from: origSessionLength, to: reducedSessionLength });
        }
        if (intensityFrom !== intensityTo) {
          changes.training.push({ label: "Intensity focus", from: intensityFrom, to: intensityTo });
        }
      }

      if (needsMeal) {
        changes.nutrition.push({ label: "Dinner complexity", from: "standard", to: "simplified" });
        changes.nutrition.push({ label: "Meal prep load", from: origPrepStyle === "cook_daily" ? "normal" : origPrepStyle, to: "lower" });
      }

      (async () => {
        try {
          let workoutPlanId: string | null = null;
          let mealPlanId: string | null = null;

          const parsedWorkoutForCtx = needsWorkout ? workoutPreferencesSchema.safeParse(recoveryWorkoutPrefs) : null;
          const parsedMealForCtx = needsMeal ? (() => { const mp = { ...recoveryMealPrefs }; return preferencesSchema.safeParse(mp); })() : null;

          const wellnessCtx = buildWellnessContext({
            goalType: sourceGoalPlan.goalType,
            startDate: targetStartStr,
            endDate: targetEndStr,
            mealPrefs: parsedMealForCtx?.success ? parsedMealForCtx.data : undefined,
            workoutPrefs: parsedWorkoutForCtx?.success ? parsedWorkoutForCtx.data : undefined,
            globalInputs: sourceGoalPlan.globalInputs || undefined,
          });

          if (needsWorkout) {
            await storage.updateGoalPlan(goalPlan.id, {
              progress: { ...initialProgress, stage: "TRAINING", stageStatuses: { ...initialProgress.stageStatuses, TRAINING: "RUNNING" } },
            });

            const parsedWorkout = workoutPreferencesSchema.safeParse(recoveryWorkoutPrefs);
            if (!parsedWorkout.success) throw new Error("Invalid recovery workout preferences");

            const wIdempotencyKey = crypto.randomUUID();
            const pendingWorkout = await storage.createPendingWorkoutPlan(userId, wIdempotencyKey, parsedWorkout.data, targetStartStr, userProfile, adaptive.snapshot, goalPlan.id);
            workoutPlanId = pendingWorkout.id;
            await storage.updateGoalPlan(goalPlan.id, { workoutPlanId });

            log(`Recovery gen: generating workout plan ${pendingWorkout.id}`, "openai");
            const goalPrefContext = await storage.getUserPreferenceContext(userId);
            const goalExerciseCtx = { avoidedExercises: goalPrefContext.avoidedExercises, dislikedExercises: goalPrefContext.dislikedExercises };
            const goalFormEquip = (parsedWorkout.data as any).equipmentAvailable as string[] | undefined;
            const goalWorkoutCtx = buildUserContextForGeneration(userProfile, goalFormEquip && goalFormEquip.length > 0 ? { equipmentAvailable: goalFormEquip } : undefined);
            const goalConstraintBlock = constraintPromptBlock + goalWorkoutCtx.workoutPromptBlock;
            const result = await generateWorkoutPlan(parsedWorkout.data, goalExerciseCtx, wellnessCtx, goalConstraintBlock, goalWorkoutCtx.profileExtras);

            await storage.updateWorkoutPlanStatus(pendingWorkout.id, "ready", result);
            await storage.logAction(userId, "ai_call_generate_plan", { planId: pendingWorkout.id, type: "workout", recovery: true });
            log(`Recovery gen: workout plan ${pendingWorkout.id} ready`, "openai");

            await storage.updateGoalPlan(goalPlan.id, {
              progress: {
                stage: needsMeal ? "NUTRITION" : "SCHEDULING",
                stageStatuses: { ...initialProgress.stageStatuses, TRAINING: "DONE", ...(needsMeal ? { NUTRITION: "RUNNING" as const } : { SCHEDULING: "RUNNING" as const }) },
              },
            });
          }

          if (needsMeal) {
            if (!needsWorkout) {
              await storage.updateGoalPlan(goalPlan.id, {
                progress: { ...initialProgress, stage: "NUTRITION", stageStatuses: { ...initialProgress.stageStatuses, NUTRITION: "RUNNING" } },
              });
            }

            const parsedMeal = preferencesSchema.safeParse(recoveryMealPrefs);
            if (!parsedMeal.success) throw new Error("Invalid recovery meal preferences");

            const mealIdempotencyKey = crypto.randomUUID();
            const pendingMeal = await storage.createPendingMealPlan(userId, mealIdempotencyKey, parsedMeal.data, targetStartStr, userProfile, adaptive.snapshot, goalPlan.id);
            mealPlanId = pendingMeal.id;
            await storage.updateGoalPlan(goalPlan.id, { mealPlanId });

            const prefCtx = await storage.getUserPreferenceContext(userId);
            const workoutDays = parsedMeal.data.workoutDays || undefined;
            log(`Recovery gen: generating meal plan ${pendingMeal.id}`, "openai");
            const goalMealCtx = buildUserContextForGeneration(userProfile);
            const mealConstraintBlock = constraintPromptBlock + goalMealCtx.mealPromptBlock;
            const planJson = await generateFullPlan(parsedMeal.data, prefCtx, workoutDays, wellnessCtx, mealConstraintBlock, goalMealCtx.profileExtras);

            await storage.updatePlanStatus(pendingMeal.id, "ready", planJson);
            await storage.logAction(userId, "ai_call_generate_plan", { planId: pendingMeal.id, type: "meal", recovery: true });
            log(`Recovery gen: meal plan ${pendingMeal.id} ready`, "openai");
          }

          if (targetStartStr) {
            if (mealPlanId) await storage.updatePlanStartDate(mealPlanId, targetStartStr);
            if (workoutPlanId) await storage.updateWorkoutStartDate(workoutPlanId, targetStartStr);
          }

          await storage.updateGoalPlan(goalPlan.id, {
            status: "ready",
            progress: {
              stage: "FINALIZING",
              stageStatuses: {
                TRAINING: needsWorkout ? "DONE" : "SKIPPED",
                NUTRITION: needsMeal ? "DONE" : "SKIPPED",
                SCHEDULING: "DONE",
                FINALIZING: "DONE",
              },
            },
          });

          log(`Recovery gen: goal plan ${goalPlan.id} completed`, "openai");
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          log(`Recovery gen: goal plan ${goalPlan.id} failed: ${errMsg}`, "openai");
          await storage.updateGoalPlan(goalPlan.id, {
            status: "failed",
            progress: { stage: "FAILED", error: errMsg },
          });
        }
      })();

      return res.json({
        status: "ok",
        goalPlanId: goalPlan.id,
        changes,
        newPlanIds: {
          wellnessPlanId: goalPlan.id,
        },
      });
    } catch (err: any) {
      log(`Recovery week error: ${err?.message || err}`, "error");
      return res.status(500).json({ message: "Failed to apply recovery week" });
    }
  });

  // ACTIVE — fetch pending ingredient avoid proposals derived from meal dislikes
  app.get("/api/ingredient-proposals", requireAuth, async (req: Request, res: Response) => {
    try {
      const proposals = await storage.getPendingProposals(req.userId!);
      return res.json(proposals);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load proposals" });
    }
  });

  // ACTIVE — accept or decline an ingredient avoid proposal; accepted entries become permanent avoid preferences
  app.post("/api/ingredient-proposals/:id/resolve", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = ingredientProposalResolveSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid resolve data" });
      }
      const userId = req.userId!;
      const { chosenIngredients, action } = parsed.data;
      const proposal = await storage.resolveProposal(req.params.id as string, userId, chosenIngredients, action);
      if (!proposal) {
        return res.status(404).json({ message: "Proposal not found" });
      }
      if (action === "accepted" && chosenIngredients.length > 0) {
        for (const ing of chosenIngredients) {
          await storage.upsertIngredientPreference(userId, ing, "avoid", "derived");
        }
      }
      return res.json(proposal);
    } catch (err) {
      log(`Resolve proposal error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to resolve proposal" });
    }
  });

  // ACTIVE — submit weekly check-in; triggers performance summary computation and adaptive plan bias update
  app.post("/api/check-ins", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = weeklyCheckInSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid check-in data" });
      }
      const userId = req.userId!;
      const checkIn = await storage.createWeeklyCheckIn(userId, parsed.data);

      let performanceSummary = null;
      try {
        performanceSummary = await computeWeeklySummary(userId, checkIn.weekStartDate);
        log(`Performance summary computed for user ${userId}, week ${checkIn.weekStartDate}: score=${performanceSummary.adherenceScore}, momentum=${performanceSummary.momentumState}`, "plan");
      } catch (perfErr) {
        log(`Performance summary computation error: ${perfErr}`, "plan");
      }

      let weeklyAdaptation = null;
      try {
        const profile = await storage.getUserProfile(userId);
        if (profile) {
          const summaries = await storage.getRecentPerformanceSummaries(userId, 4);
          const { signals, params, summaryText } = computeWeeklyAdaptation(profile, summaries);
          weeklyAdaptation = await storage.upsertWeeklyAdaptation(userId, checkIn.weekStartDate, signals, params, summaryText);
          if (params.adjustmentAction !== "maintain") {
            await storage.updateUserProfile(userId, { nextWeekPlanBias: params.adjustmentAction } as any);
          }
          log(`Weekly adaptation computed for user ${userId}: action=${params.adjustmentAction}, trend=${signals.trend}`, "plan");
        }
      } catch (adaptErr) {
        log(`Weekly adaptation computation error: ${adaptErr}`, "plan");
      }

      return res.json({ checkIn, performanceSummary, weeklyAdaptation });
    } catch (err) {
      log(`Check-in creation error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to save check-in" });
    }
  });

  // ACTIVE — list weekly check-ins, optionally filtered by goalPlanId
  app.get("/api/check-ins", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const goalPlanId = req.query.goalPlanId as string | undefined;
      const checkIns = await storage.getWeeklyCheckIns(userId, goalPlanId);
      return res.json(checkIns);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load check-ins" });
    }
  });

  // ACTIVE — fetch the most recent performance summary for the user
  app.get("/api/performance/latest", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const summary = await storage.getLatestPerformanceSummary(userId);
      return res.json(summary || null);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load performance summary" });
    }
  });

  // ACTIVE — list performance summaries, optionally filtered by date range
  app.get("/api/performance", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      if (from && to) {
        const summaries = await storage.getPerformanceSummariesByRange(userId, from, to);
        return res.json(summaries);
      }
      const summaries = await storage.getRecentPerformanceSummaries(userId, 10);
      return res.json(summaries);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load performance summaries" });
    }
  });

  // ACTIVE — manually trigger weekly adaptation signal computation; auto-runs on check-in as well
  app.post("/api/weekly-adaptation/compute", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const profile = await storage.getUserProfile(userId);
      if (!profile) return res.status(400).json({ message: "Profile required" });

      const summaries = await storage.getRecentPerformanceSummaries(userId, 4);
      const { signals, params, summaryText } = computeWeeklyAdaptation(profile, summaries);

      const now = new Date();
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const weekStartDate = monday.toISOString().slice(0, 10);

      const adaptation = await storage.upsertWeeklyAdaptation(
        userId,
        weekStartDate,
        signals,
        params,
        summaryText,
      );

      if (params.adjustmentAction !== "maintain") {
        await storage.updateUserProfile(userId, {
          nextWeekPlanBias: params.adjustmentAction,
        } as any);
      }

      return res.json(adaptation);
    } catch (err) {
      log(`Weekly adaptation compute error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to compute weekly adaptation" });
    }
  });

  // ACTIVE — fetch the most recent weekly adaptation record
  app.get("/api/weekly-adaptation/latest", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const adaptation = await storage.getLatestWeeklyAdaptation(userId);
      return res.json(adaptation || null);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load weekly adaptation" });
    }
  });

  // ACTIVE — web calendar workout day list used by plan-calendar.tsx
  app.get("/api/calendar/workouts", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const plans = await storage.getScheduledWorkoutPlans(userId);

      const allDays: any[] = [];
      for (const plan of plans) {
        const startDate = plan.planStartDate;
        if (!startDate || !plan.planJson) continue;
        const planJson = plan.planJson as WorkoutPlanOutput;
        planJson.days.forEach((day, i) => {
          const date = new Date(startDate + "T00:00:00");
          date.setDate(date.getDate() + i);
          const dateStr = date.toISOString().slice(0, 10);
          allDays.push({
            date: dateStr,
            dayIndex: day.dayIndex,
            isWorkoutDay: day.isWorkoutDay,
            session: day.session,
            workoutPlanId: plan.id,
          });
        });
      }

      return res.json({ days: allDays });
    } catch (err) {
      log(`Calendar workouts fetch error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to load workout calendar data" });
    }
  });

  // ── Daily Meal Planning ──
  // ACTIVE — generate a daily meal plan for a specific date (single-day, AI-powered)
  app.post("/api/daily-meal", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const profile = await storage.getUserProfile(userId);
      if (!profile) {
        return res.status(400).json({ message: "Profile required", profileRequired: true });
      }

      const { date, mealsPerDay } = req.body;
      if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Valid date (YYYY-MM-DD) is required" });
      }
      const requestedDate = new Date(date + "T00:00:00");
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (requestedDate < today) {
        return res.status(400).json({ message: "Cannot create plans for past dates" });
      }
      if (![2, 3].includes(Number(mealsPerDay))) {
        return res.status(400).json({ message: "mealsPerDay must be 2 or 3" });
      }

      const existing = await storage.getDailyMealByDate(userId, date);
      if (existing && existing.status !== "failed") {
        return res.status(409).json({ message: "A daily meal already exists for this date", existing });
      }

      const profileSnapshot = { ...profile };
      const adaptive = await computeAdaptiveForUser(userId);
      const record = await storage.createDailyMeal(userId, date, mealsPerDay, profileSnapshot, adaptive.snapshot);

      res.json({ id: record.id, status: "generating" });

      (async () => {
        try {
          const prefCtx = await storage.getUserPreferenceContext(userId);
          const dailyMealCtx = buildUserContextForGeneration(profile);
          const dailyMealConstraint = (adaptive.promptBlock || "") + dailyMealCtx.mealPromptBlock;
          const result = await generateSingleDayMeals({
            date,
            mealsPerDay: mealsPerDay as 2 | 3,
            goal: profile.primaryGoal || "general_fitness",
            dietStyles: [],
            foodsToAvoid: (profile.foodsToAvoid as string[]) || [],
            allergiesIntolerances: (profile.allergiesIntolerances as string[]) || [],
            spiceLevel: profile.spicePreference || "medium",
            age: profile.age || undefined,
            currentWeight: profile.weightKg ? Number(profile.weightKg) : undefined,
            targetWeight: profile.targetWeightKg ? Number(profile.targetWeightKg) : undefined,
            weightUnit: profile.unitSystem === "metric" ? "kg" : "lb",
            constraintBlock: dailyMealConstraint || undefined,
          }, prefCtx);

          const groceryItems: any[] = [];
          for (const [, meal] of Object.entries(result.meals)) {
            if (meal.ingredients) {
              for (const ing of meal.ingredients) {
                groceryItems.push({ item: ing, quantity: ing });
              }
            }
          }

          await storage.updateDailyMealStatus(record.id, "ready", result, { sections: [{ name: "Ingredients", items: groceryItems }] }, result.title);
          log(`Daily meal generated for ${date} (user ${userId})`, "openai");
        } catch (err) {
          log(`Daily meal generation failed for ${date}: ${err instanceof Error ? err.message : String(err)}`, "openai");
          await storage.updateDailyMealStatus(record.id, "failed");
        }
      })();
    } catch (err) {
      log(`Daily meal creation error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to create daily meal" });
    }
  });

  // ACTIVE — fetch daily meal record for a given date
  app.get("/api/daily-meal/:date", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const meal = await storage.getDailyMealByDate(userId, req.params.date);
      if (!meal) return res.status(404).json({ message: "No daily meal for this date" });
      return res.json(meal);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load daily meal" });
    }
  });

  // ACTIVE — list daily meal records for a date range
  app.get("/api/daily-meals", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { start, end } = req.query;
      if (!start || !end) return res.status(400).json({ message: "start and end query params required" });
      const meals = await storage.getDailyMealsByDateRange(userId, start as string, end as string);
      return res.json(meals);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load daily meals" });
    }
  });

  // ── Daily Workout Planning ──
  // ACTIVE — generate a daily workout for a specific date (single-day, AI-powered)
  app.post("/api/daily-workout", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const profile = await storage.getUserProfile(userId);
      if (!profile) {
        return res.status(400).json({ message: "Profile required", profileRequired: true });
      }

      const { date } = req.body;
      if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Valid date (YYYY-MM-DD) is required" });
      }
      const requestedDate = new Date(date + "T00:00:00");
      const todayWk = new Date();
      todayWk.setHours(0, 0, 0, 0);
      if (requestedDate < todayWk) {
        return res.status(400).json({ message: "Cannot create plans for past dates" });
      }

      const existing = await storage.getDailyWorkoutByDate(userId, date);
      if (existing && existing.status !== "failed") {
        return res.status(409).json({ message: "A daily workout already exists for this date", existing });
      }

      const profileSnapshot = { ...profile };
      const adaptive = await computeAdaptiveForUser(userId);
      const record = await storage.createDailyWorkout(userId, date, profileSnapshot, adaptive.snapshot);

      res.json({ id: record.id, status: "generating" });

      (async () => {
        try {
          const exercisePrefs = await storage.getExercisePreferences(userId);
          const exerciseContext = {
            avoidedExercises: exercisePrefs.filter(p => p.preference === "avoid").map(p => p.exerciseName),
            dislikedExercises: exercisePrefs.filter(p => p.preference === "dislike").map(p => p.exerciseName),
          };

          const dailyWorkoutCtx = buildUserContextForGeneration(profile);
          const dailyWConstraint = (adaptive.promptBlock || "") + dailyWorkoutCtx.workoutPromptBlock;
          const result = await generateSingleDayWorkout({
            date,
            goal: profile.primaryGoal || "general_fitness",
            secondaryFocus: (profile as any).secondaryFocus ?? null,
            location: profile.workoutLocationDefault || "gym",
            trainingMode: "both",
            focusAreas: ["full_body"],
            sessionLength: profile.sessionDurationMinutes || 45,
            experienceLevel: profile.trainingExperience || "intermediate",
            healthConstraints: (profile.healthConstraints as string[]) || [],
            constraintBlock: dailyWConstraint || undefined,
          }, exerciseContext, dailyWorkoutCtx.profileExtras);

          const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
          const title = `Daily Workout — ${dateLabel}`;
          await storage.updateDailyWorkoutStatus(record.id, "ready", result, title);
          log(`Daily workout generated for ${date} (user ${userId})`, "openai");
        } catch (err) {
          log(`Daily workout generation failed for ${date}: ${err instanceof Error ? err.message : String(err)}`, "openai");
          await storage.updateDailyWorkoutStatus(record.id, "failed");
        }
      })();
    } catch (err) {
      log(`Daily workout creation error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to create daily workout" });
    }
  });

  // ACTIVE — fetch daily workout record for a given date
  app.get("/api/daily-workout/:date", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const workout = await storage.getDailyWorkoutByDate(userId, req.params.date);
      if (!workout) return res.status(404).json({ message: "No daily workout for this date" });
      return res.json(workout);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load daily workout" });
    }
  });

  // ACTIVE — list daily workout records for a date range
  app.get("/api/daily-workouts", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { start, end } = req.query;
      if (!start || !end) return res.status(400).json({ message: "start and end query params required" });
      const workouts = await storage.getDailyWorkoutsByDateRange(userId, start as string, end as string);
      return res.json(workouts);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load daily workouts" });
    }
  });

  // ── Daily Plan Regeneration ──
  // ACTIVE — regenerate a failed or existing daily meal plan for the given date
  app.post("/api/daily-meal/:date/regenerate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { date } = req.params;
      const profile = await storage.getUserProfile(userId);
      if (!profile) return res.status(400).json({ message: "Profile required", profileRequired: true });

      const existing = await storage.getDailyMealByDate(userId, date);
      if (!existing) return res.status(404).json({ message: "No daily meal found for this date" });

      const mealsPerDay = existing.mealsPerDay || 3;
      await storage.updateDailyMealStatus(existing.id, "generating");
      res.json({ id: existing.id, status: "generating" });

      (async () => {
        try {
          const prefCtx = await storage.getUserPreferenceContext(userId);
          const regenMealCtx = buildUserContextForGeneration(profile);
          const result = await generateSingleDayMeals({
            date,
            mealsPerDay: mealsPerDay as 2 | 3,
            goal: profile.primaryGoal || "general_fitness",
            dietStyles: [],
            foodsToAvoid: (profile.foodsToAvoid as string[]) || [],
            allergiesIntolerances: (profile.allergiesIntolerances as string[]) || [],
            spiceLevel: profile.spicePreference || "medium",
            age: profile.age || undefined,
            currentWeight: profile.weightKg ? Number(profile.weightKg) : undefined,
            targetWeight: profile.targetWeightKg ? Number(profile.targetWeightKg) : undefined,
            weightUnit: profile.unitSystem === "metric" ? "kg" : "lb",
            constraintBlock: regenMealCtx.mealPromptBlock || undefined,
          }, prefCtx);

          const groceryItems: any[] = [];
          for (const [, meal] of Object.entries(result.meals)) {
            if (meal.ingredients) {
              for (const ing of meal.ingredients) {
                groceryItems.push({ item: ing, quantity: ing });
              }
            }
          }

          await storage.updateDailyMealStatus(existing.id, "ready", result, { sections: [{ name: "Ingredients", items: groceryItems }] }, result.title);
          log(`Daily meal regenerated for ${date} (user ${userId})`, "openai");
        } catch (err) {
          log(`Daily meal regeneration failed for ${date}: ${err instanceof Error ? err.message : String(err)}`, "openai");
          await storage.updateDailyMealStatus(existing.id, "failed");
        }
      })();
    } catch (err) {
      log(`Daily meal regeneration error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to regenerate daily meal" });
    }
  });

  // ACTIVE — regenerate a failed or existing daily workout for the given date
  app.post("/api/daily-workout/:date/regenerate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { date } = req.params;
      const profile = await storage.getUserProfile(userId);
      if (!profile) return res.status(400).json({ message: "Profile required", profileRequired: true });

      const existing = await storage.getDailyWorkoutByDate(userId, date);
      if (!existing) return res.status(404).json({ message: "No daily workout found for this date" });

      await storage.updateDailyWorkoutStatus(existing.id, "generating");
      res.json({ id: existing.id, status: "generating" });

      (async () => {
        try {
          const exercisePrefs = await storage.getExercisePreferences(userId);
          const exerciseContext = {
            avoidedExercises: exercisePrefs.filter((p: any) => p.status === "avoided" || p.preference === "avoid").map((p: any) => p.exerciseName),
            dislikedExercises: exercisePrefs.filter((p: any) => p.status === "disliked" || p.preference === "dislike").map((p: any) => p.exerciseName),
          };

          const regenWorkoutCtx = buildUserContextForGeneration(profile);
          const result = await generateSingleDayWorkout({
            date,
            goal: profile.primaryGoal || "general_fitness",
            secondaryFocus: (profile as any).secondaryFocus ?? null,
            location: profile.workoutLocationDefault || "gym",
            trainingMode: "both",
            focusAreas: ["full_body"],
            sessionLength: profile.sessionDurationMinutes || 45,
            experienceLevel: profile.trainingExperience || "intermediate",
            healthConstraints: (profile.healthConstraints as string[]) || [],
            constraintBlock: regenWorkoutCtx.workoutPromptBlock || undefined,
          }, exerciseContext, regenWorkoutCtx.profileExtras);

          const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
          const title = `Daily Workout — ${dateLabel}`;
          await storage.updateDailyWorkoutStatus(existing.id, "ready", result, title);
          log(`Daily workout regenerated for ${date} (user ${userId})`, "openai");
        } catch (err) {
          log(`Daily workout regeneration failed for ${date}: ${err instanceof Error ? err.message : String(err)}`, "openai");
          await storage.updateDailyWorkoutStatus(existing.id, "failed");
        }
      })();
    } catch (err) {
      log(`Daily workout regeneration error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to regenerate daily workout" });
    }
  });

  // ── Daily Coverage Check ──
  // ACTIVE — returns which dates in a range have ready daily meal or workout plans
  app.get("/api/daily-coverage", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { start, end } = req.query;
      if (!start || !end) return res.status(400).json({ message: "start and end required" });
      const meals = await storage.getDailyMealsByDateRange(userId, start as string, end as string);
      const workouts = await storage.getDailyWorkoutsByDateRange(userId, start as string, end as string);
      const coverage: Record<string, { meal: boolean; workout: boolean }> = {};
      for (const m of meals) {
        if (!coverage[m.date]) coverage[m.date] = { meal: false, workout: false };
        coverage[m.date].meal = m.status === "ready";
      }
      for (const w of workouts) {
        if (!coverage[w.date]) coverage[w.date] = { meal: false, workout: false };
        coverage[w.date].workout = w.status === "ready";
      }
      return res.json(coverage);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load coverage" });
    }
  });

  // ── Activity Completions ──
  // ACTIVE — fetch activity completion records by date range or source plan
  app.get("/api/completions", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { start, end, sourceType, sourceId } = req.query;

      if (sourceType && sourceId) {
        const completions = await storage.getCompletionsBySource(userId, sourceType as string, sourceId as string);
        return res.json(completions);
      }

      if (!start || !end) return res.status(400).json({ message: "start and end query params required" });
      const completions = await storage.getCompletionsByDateRange(userId, start as string, end as string);
      return res.json(completions);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load completions" });
    }
  });

  // ACTIVE — toggle meal or workout item completion status
  app.post("/api/completions/toggle", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const parsed = toggleCompletionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      }
      const { date, itemType, sourceType, sourceId, itemKey, completed } = parsed.data;

      const completion = await storage.upsertActivityCompletion(userId, date, itemType, sourceType, sourceId, itemKey, completed);
      return res.json(completion);
    } catch (err) {
      return res.status(500).json({ message: "Failed to toggle completion" });
    }
  });

  // ACTIVE — compute adherence score (meals + workouts completed vs scheduled) for a date range
  app.get("/api/completions/adherence", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { start, end } = req.query;
      if (!start || !end) return res.status(400).json({ message: "start and end required" });

      const startStr = start as string;
      const endStr = end as string;

      let scheduledMeals = 0;
      let scheduledWorkouts = 0;

      const mealPlans = await storage.getMealPlansByUser(userId);
      for (const mp of mealPlans) {
        if (!mp.planStartDate || mp.deletedAt) continue;
        const plan = mp.planJson as any;
        if (!plan?.days) continue;
        for (let d = 0; d < (plan.days?.length || 7); d++) {
          const dayDate = new Date(mp.planStartDate + "T00:00:00");
          dayDate.setDate(dayDate.getDate() + d);
          const ds = dayDate.toISOString().split("T")[0];
          if (ds >= startStr && ds <= endStr) {
            const dayMeals = plan.days[d]?.meals;
            if (dayMeals) {
              scheduledMeals += Object.keys(dayMeals).length;
            }
          }
        }
      }

      const workoutPlans = await storage.getWorkoutPlansByUser(userId);
      for (const wp of workoutPlans) {
        if (!wp.planStartDate || wp.deletedAt) continue;
        const plan = wp.planJson as any;
        if (!plan?.days) continue;
        for (let d = 0; d < plan.days.length; d++) {
          const day = plan.days[d];
          if (!day || day.isWorkoutDay === false) continue;
          const dayDate = new Date(wp.planStartDate + "T00:00:00");
          dayDate.setDate(dayDate.getDate() + d);
          const ds = dayDate.toISOString().split("T")[0];
          if (ds >= startStr && ds <= endStr) {
            scheduledWorkouts++;
          }
        }
      }

      const dailyMeals = await storage.getDailyMealsByDateRange(userId, startStr, endStr);
      for (const dm of dailyMeals) {
        if (dm.status !== "ready" || !dm.planJson) continue;
        const meals = (dm.planJson as any)?.meals;
        if (meals) scheduledMeals += Object.keys(meals).length;
      }

      const dailyWorkouts = await storage.getDailyWorkoutsByDateRange(userId, startStr, endStr);
      for (const dw of dailyWorkouts) {
        if (dw.status !== "ready" || !dw.planJson) continue;
        scheduledWorkouts++;
      }

      const completions = await storage.getCompletionsByDateRange(userId, startStr, endStr);
      const completedMeals = completions.filter(c => c.itemType === "meal" && c.completed).length;
      const completedWorkouts = completions.filter(c => c.itemType === "workout" && c.completed).length;

      const mealPct = scheduledMeals > 0 ? Math.round((completedMeals / scheduledMeals) * 100) : null;
      const workoutPct = scheduledWorkouts > 0 ? Math.round((completedWorkouts / scheduledWorkouts) * 100) : null;

      let overallScore: number | null = null;
      if (mealPct != null && workoutPct != null) {
        overallScore = Math.round(mealPct * 0.5 + workoutPct * 0.5);
      } else if (mealPct != null) {
        overallScore = mealPct;
      } else if (workoutPct != null) {
        overallScore = workoutPct;
      }

      return res.json({
        scheduledMeals,
        completedMeals,
        scheduledWorkouts,
        completedWorkouts,
        mealPct,
        workoutPct,
        overallScore,
      });
    } catch (err: any) {
      log(`Adherence computation error: ${err?.message || err}`, "error");
      console.error("Adherence error stack:", err);
      return res.status(500).json({ message: "Failed to compute adherence" });
    }
  });

  // ── Mobile Aggregation Routes ──
  // Note: computeWeekScore and computeStreakDays are internal helpers, not routes

  async function computeWeekScore(
    userId: string,
    startStr: string,
    endStr: string,
    allMealPlans: any[],
    allWorkoutPlans: any[],
  ): Promise<{ scheduledMeals: number; scheduledWorkouts: number; completedMeals: number; completedWorkouts: number; mealPct: number | null; workoutPct: number | null; score: number | null }> {
    let scheduledMeals = 0;
    let scheduledWorkouts = 0;

    for (const mp of allMealPlans) {
      if (!mp.planStartDate || mp.deletedAt) continue;
      const plan = mp.planJson as any;
      if (!plan?.days) continue;
      for (let d = 0; d < (plan.days.length || 7); d++) {
        const dayDate = new Date(mp.planStartDate + "T00:00:00");
        dayDate.setDate(dayDate.getDate() + d);
        const ds = dayDate.toISOString().split("T")[0];
        if (ds >= startStr && ds <= endStr) {
          const dayMeals = plan.days[d]?.meals;
          if (dayMeals) scheduledMeals += Object.keys(dayMeals).length;
        }
      }
    }

    for (const wp of allWorkoutPlans) {
      if (!wp.planStartDate || wp.deletedAt) continue;
      const plan = wp.planJson as any;
      if (!plan?.days) continue;
      for (let d = 0; d < plan.days.length; d++) {
        const day = plan.days[d];
        if (!day || day.isWorkoutDay === false) continue;
        const dayDate = new Date(wp.planStartDate + "T00:00:00");
        dayDate.setDate(dayDate.getDate() + d);
        const ds = dayDate.toISOString().split("T")[0];
        if (ds >= startStr && ds <= endStr) scheduledWorkouts++;
      }
    }

    const dailyMeals = await storage.getDailyMealsByDateRange(userId, startStr, endStr);
    for (const dm of dailyMeals) {
      if (dm.status !== "ready" || !dm.planJson) continue;
      const meals = (dm.planJson as any)?.meals;
      if (meals) scheduledMeals += Object.keys(meals).length;
    }

    const dailyWorkouts = await storage.getDailyWorkoutsByDateRange(userId, startStr, endStr);
    for (const dw of dailyWorkouts) {
      if (dw.status !== "ready" || !dw.planJson) continue;
      scheduledWorkouts++;
    }

    const completions = await storage.getCompletionsByDateRange(userId, startStr, endStr);
    const completedMeals = completions.filter(c => c.itemType === "meal" && c.completed).length;
    const completedWorkouts = completions.filter(c => c.itemType === "workout" && c.completed).length;

    const mealPct = scheduledMeals > 0 ? Math.round((completedMeals / scheduledMeals) * 100) : null;
    const workoutPct = scheduledWorkouts > 0 ? Math.round((completedWorkouts / scheduledWorkouts) * 100) : null;
    let score: number | null = null;
    if (mealPct != null && workoutPct != null) {
      score = Math.round(mealPct * 0.5 + workoutPct * 0.5);
    } else if (mealPct != null) {
      score = mealPct;
    } else if (workoutPct != null) {
      score = workoutPct;
    }

    return { scheduledMeals, scheduledWorkouts, completedMeals, completedWorkouts, mealPct, workoutPct, score };
  }

  async function computeStreakDays(userId: string, endDate: string): Promise<number> {
    const end = new Date(endDate + "T00:00:00");
    let streak = 0;
    for (let i = 0; i < 30; i++) {
      const checkDate = new Date(end);
      checkDate.setDate(end.getDate() - i);
      const ds = checkDate.toISOString().split("T")[0];
      const dayCompletions = await storage.getCompletionsByDateRange(userId, ds, ds);
      const hasScheduled = dayCompletions.length > 0;
      if (!hasScheduled) {
        if (i === 0) continue;
        break;
      }
      const allCompleted = dayCompletions.every(c => c.completed);
      if (allCompleted) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  // ACTIVE — weekly performance summary (scores, adherence, performance state) for the current or a given week
  app.get("/api/weekly-summary", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const weekStartsOn: 0 | 1 = (req.query.weekStartsOn === "1") ? 1 : 0;
      const weekStartParam = req.query.weekStart as string | undefined;

      let weekStart: Date;
      if (weekStartParam && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)) {
        weekStart = new Date(weekStartParam + "T00:00:00");
      } else {
        const now = new Date();
        const day = now.getDay();
        const diff = (day < weekStartsOn ? day + 7 - weekStartsOn : day - weekStartsOn);
        weekStart = new Date(now);
        weekStart.setDate(now.getDate() - diff);
        weekStart.setHours(0, 0, 0, 0);
      }
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      const startStr = weekStart.toISOString().slice(0, 10);
      const endStr = weekEnd.toISOString().slice(0, 10);

      const allMealPlans = await storage.getMealPlansByUser(userId);
      const allWorkoutPlans = await storage.getWorkoutPlansByUser(userId);

      const current = await computeWeekScore(userId, startStr, endStr, allMealPlans, allWorkoutPlans);

      const priorWeekScores: (number | null)[] = [];
      for (let w = 3; w >= 1; w--) {
        const pStart = new Date(weekStart);
        pStart.setDate(weekStart.getDate() - w * 7);
        const pEnd = new Date(pStart);
        pEnd.setDate(pStart.getDate() + 6);
        const ps = pStart.toISOString().slice(0, 10);
        const pe = pEnd.toISOString().slice(0, 10);
        const weekData = await computeWeekScore(userId, ps, pe, allMealPlans, allWorkoutPlans);
        priorWeekScores.push(weekData.score);
      }
      priorWeekScores.push(current.score);

      const validScores = priorWeekScores.filter((s): s is number => s != null);

      const previousWeekScore = priorWeekScores[2] ?? null;

      const streakDays = await computeStreakDays(userId, endStr);

      let performanceState = null;
      if (current.score != null) {
        const input: PerformanceStateInput = {
          currentWeekOverallScore: current.score,
          previousWeekOverallScore: previousWeekScore,
          last4WeeksOverallScores: validScores.length > 0 ? validScores : [current.score],
          streakDays,
        };
        performanceState = computePerformanceState(input);
      }

      return res.json({
        weekStart: startStr,
        weekEnd: endStr,
        score: current.score,
        overallScore: current.score,
        mealsCompleted: current.completedMeals,
        mealsTotal: current.scheduledMeals,
        workoutsCompleted: current.completedWorkouts,
        workoutsTotal: current.scheduledWorkouts,
        scheduledMeals: current.scheduledMeals,
        completedMeals: current.completedMeals,
        scheduledWorkouts: current.scheduledWorkouts,
        completedWorkouts: current.completedWorkouts,
        mealPct: current.mealPct,
        workoutPct: current.workoutPct,
        performanceState,
      });
    } catch (err: any) {
      log(`Weekly summary error: ${err?.message || err}`, "error");
      return res.status(500).json({ message: "Failed to compute weekly summary" });
    }
  });

  // ACTIVE — primary iOS aggregation endpoint; returns full week with meals, workouts, daily plans, and completions
  app.get("/api/week-data", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const weekStartParam = req.query.weekStart as string | undefined;
      const weekStartsOn: 0 | 1 = (req.query.weekStartsOn === "1") ? 1 : 0;

      let weekStart: Date;
      if (weekStartParam && /^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)) {
        weekStart = new Date(weekStartParam + "T00:00:00");
      } else {
        const now = new Date();
        const day = now.getDay();
        const diff = (day < weekStartsOn ? day + 7 - weekStartsOn : day - weekStartsOn);
        weekStart = new Date(now);
        weekStart.setDate(now.getDate() - diff);
        weekStart.setHours(0, 0, 0, 0);
      }

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const startStr = weekStart.toISOString().slice(0, 10);
      const endStr = weekEnd.toISOString().slice(0, 10);

      const scheduledPlans = await storage.getScheduledPlans(userId);
      const workoutScheduled = await storage.getScheduledWorkoutPlans(userId);
      const dailyMeals = await storage.getDailyMealsByDateRange(userId, startStr, endStr);
      const dailyWorkouts = await storage.getDailyWorkoutsByDateRange(userId, startStr, endStr);
      const completions = await storage.getCompletionsByDateRange(userId, startStr, endStr);

      const allMealSlots = new Set<string>();
      const days: any[] = [];

      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);

        const meals: Record<string, any> = {};
        const planIds: string[] = [];
        for (const plan of scheduledPlans) {
          const planJson = plan.planJson as any;
          const planStart = plan.planStartDate!;
          if (!planJson?.days) continue;
          for (let j = 0; j < planJson.days.length; j++) {
            const dd = new Date(planStart + "T00:00:00");
            dd.setDate(dd.getDate() + j);
            if (dd.toISOString().slice(0, 10) === dateStr) {
              const dayMeals = planJson.days[j]?.meals;
              if (dayMeals) {
                for (const [slot, meal] of Object.entries(dayMeals)) {
                  if (!meals[slot]) {
                    meals[slot] = meal;
                    allMealSlots.add(slot);
                  }
                }
                if (!planIds.includes(String(plan.id))) {
                  planIds.push(String(plan.id));
                }
              }
            }
          }
        }

        let workout: any = null;
        let workoutPlanId: string | null = null;
        let isWorkoutDay = false;
        for (const wp of workoutScheduled) {
          const planJson = wp.planJson as any;
          const planStart = wp.planStartDate;
          if (!planStart || !planJson?.days) continue;
          for (let j = 0; j < planJson.days.length; j++) {
            const dd = new Date(planStart + "T00:00:00");
            dd.setDate(dd.getDate() + j);
            if (dd.toISOString().slice(0, 10) === dateStr && planJson.days[j]?.isWorkoutDay) {
              workout = planJson.days[j].session || planJson.days[j];
              workoutPlanId = String(wp.id);
              isWorkoutDay = true;
            }
          }
        }

        const dm = dailyMeals.find(m => m.date === dateStr && m.status === "ready");
        const dailyMealObj = dm ? { id: String(dm.id), planJson: dm.planJson, generatedTitle: (dm as any).generatedTitle || null } : null;

        const dw = dailyWorkouts.find(w => w.date === dateStr && w.status === "ready");
        const dailyWorkoutObj = dw ? { id: String(dw.id), planJson: dw.planJson, generatedTitle: (dw as any).generatedTitle || null } : null;

        if (!workout && dw && dw.planJson) {
          workout = dw.planJson;
        }

        const dayCompletions = completions.filter(c => c.date === dateStr);

        days.push({
          date: dateStr,
          meals,
          planIds,
          workout,
          workoutPlanId,
          isWorkoutDay,
          dailyMeal: dailyMealObj,
          dailyWorkout: dailyWorkoutObj,
          hasDailyMeal: !!dm,
          hasDailyWorkout: !!dw,
          completions: dayCompletions,
        });
      }

      const mealSlots = Array.from(allMealSlots);

      return res.json({ weekStart: startStr, weekEnd: endStr, mealSlots, days });
    } catch (err: any) {
      log(`Week data error: ${err?.message || err}`, "error");
      return res.status(500).json({ message: "Failed to load week data" });
    }
  });

  // ACTIVE — primary iOS single-day endpoint; returns meals, workout, daily plans, and completions for one date
  app.get("/api/day-data/:date", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const dateStr = req.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
      }

      const meals: Record<string, any> = {};
      const scheduledPlans = await storage.getScheduledPlans(userId);
      for (const plan of scheduledPlans) {
        const planJson = plan.planJson as any;
        const planStart = plan.planStartDate!;
        if (!planJson?.days) continue;
        for (let j = 0; j < planJson.days.length; j++) {
          const dd = new Date(planStart + "T00:00:00");
          dd.setDate(dd.getDate() + j);
          if (dd.toISOString().slice(0, 10) === dateStr) {
            const dayMeals = planJson.days[j]?.meals;
            if (dayMeals) {
              for (const [slot, meal] of Object.entries(dayMeals)) {
                if (!meals[slot]) meals[slot] = meal;
              }
            }
          }
        }
      }

      const dailyMeal = await storage.getDailyMealByDate(userId, dateStr);
      if (dailyMeal && dailyMeal.status === "ready" && dailyMeal.planJson) {
        const dmMeals = (dailyMeal.planJson as any)?.meals;
        if (dmMeals) {
          for (const [slot, meal] of Object.entries(dmMeals)) {
            if (!meals[slot]) meals[slot] = meal;
          }
        }
      }

      let workout: any = null;
      const workoutScheduled = await storage.getScheduledWorkoutPlans(userId);
      for (const wp of workoutScheduled) {
        const planJson = wp.planJson as any;
        const planStart = wp.planStartDate;
        if (!planStart || !planJson?.days) continue;
        for (let j = 0; j < planJson.days.length; j++) {
          const dd = new Date(planStart + "T00:00:00");
          dd.setDate(dd.getDate() + j);
          if (dd.toISOString().slice(0, 10) === dateStr && planJson.days[j]?.isWorkoutDay) {
            workout = planJson.days[j].session || planJson.days[j];
          }
        }
      }

      const dailyWorkout = await storage.getDailyWorkoutByDate(userId, dateStr);
      if (dailyWorkout && dailyWorkout.status === "ready" && dailyWorkout.planJson && !workout) {
        workout = dailyWorkout.planJson;
      }

      const completions = await storage.getCompletionsByDateRange(userId, dateStr, dateStr);

      const coverage = await storage.getDailyMealsByDateRange(userId, dateStr, dateStr);
      const workoutCoverage = await storage.getDailyWorkoutsByDateRange(userId, dateStr, dateStr);

      return res.json({
        date: dateStr,
        meals,
        workout,
        completions,
        hasDailyMeal: coverage.some(m => m.status === "ready"),
        hasDailyWorkout: workoutCoverage.some(w => w.status === "ready"),
      });
    } catch (err: any) {
      log(`Day data error: ${err?.message || err}`, "error");
      return res.status(500).json({ message: "Failed to load day data" });
    }
  });

  // ACTIVE — fetch grocery list for a meal plan; no goal-plan equivalent for raw grocery access
  app.get("/api/plan/:id/grocery", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const mealPlan = await storage.getMealPlan(req.params.id);
      if (!mealPlan || mealPlan.userId !== userId || mealPlan.deletedAt || !mealPlan.planJson) {
        return res.status(404).json({ message: "Plan not found" });
      }
      const planJson = mealPlan.planJson as PlanOutput;
      return res.json(planJson.groceryList || { sections: [] });
    } catch { return res.status(500).json({ message: "Failed to load grocery list" }); }
  });

  app.use("/api/{*path}", (_req: Request, res: Response) => {
    res.status(404).json({ message: "Not found" });
  });

  return httpServer;
}
