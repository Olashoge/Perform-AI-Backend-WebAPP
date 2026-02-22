import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { hash, compare } from "bcryptjs";
import { signupSchema, loginSchema, preferencesSchema, mealFeedbackSchema, workoutPreferencesSchema, workoutFeedbackSchema, goalPlanCreateSchema, weeklyCheckInSchema, ingredientProposalResolveSchema, exercisePreferenceSchema, insertUserProfileSchema, toggleCompletionSchema, type PlanOutput, type Preferences, type GroceryPricing, type WorkoutPlanOutput } from "@shared/schema";
import { generateFullPlan, generateSwapMeal, generateDayMeals, rebuildGroceryList, generateGroceryPricing, generateWorkoutPlan, generateWorkoutSession, generateSingleDayMeals, generateSingleDayWorkout } from "./openai";
import { generateMealFingerprint, extractKeyIngredients, normalizeItemKey } from "./meal-utils";
import { log } from "./index";
import { buildWellnessContext } from "./wellness-context";
import { checkMealSwapAllowed, checkMealRegenAllowed, recordMealSwap, recordMealRegen, checkWorkoutRegenAllowed, recordWorkoutRegen, getAllowanceState, redeemFlexToken, createAllowanceForGoalPlan, computeBehaviorSummary } from "./allowance";
import { evaluateConstraints, buildConstraintPromptBlock } from "./constraints/engine";
import { postValidateMealPlan, postValidateWorkoutPlan } from "./constraints/post-validation";
import type { RuleContext, PlanKind } from "./constraints/types";
import { computeWeeklySummary } from "./performance/computeWeeklySummary";
import { computeAdaptiveModifiers, buildAdaptivePromptBlock, computeWeeklyAdaptation } from "./adaptive";
import type { AdaptiveSnapshot, AdaptiveInputs } from "./adaptive";
import { buildUserContextForGeneration, type ContextOverrides } from "./context-builder";
import connectPgSimple from "connect-pg-simple";

const PgStore = connectPgSimple(session);

declare module "express-session" {
  interface SessionData {
    userId: string;
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

async function runGroceryPricing(planId: string, planJson: PlanOutput, prefs: Preferences): Promise<void> {
  try {
    await storage.updatePricingStatus(planId, "pending");
    log(`Generating grocery pricing for plan ${planId}`, "openai");
    const pricing = await generateGroceryPricing(
      planJson.groceryList.sections,
      prefs.householdSize,
      prefs.prepStyle,
    );
    await storage.updateGroceryPricing(planId, pricing);
    log(`Grocery pricing generated for plan ${planId}`, "openai");
  } catch (err) {
    await storage.updatePricingStatus(planId, "failed");
    log(`Grocery pricing failed for plan ${planId}: ${err instanceof Error ? err.message : String(err)}`, "openai");
  }
}

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
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
      const user = await storage.createUser(parsed.data.email, passwordHash);

      req.session.userId = user.id;
      req.session.save((err) => {
        if (err) {
          log(`Session save error on signup: ${err}`, "auth");
          return res.status(500).json({ message: "Internal server error" });
        }
        return res.json({ id: user.id, email: user.email });
      });
    } catch (err) {
      log(`Signup error: ${err}`, "auth");
      return res.status(500).json({ message: "Internal server error" });
    }
  });

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
        return res.json({ id: user.id, email: user.email });
      });
    } catch (err) {
      log(`Login error: ${err}`, "auth");
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUserById(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    return res.json({ id: user.id, email: user.email });
  });

  app.get("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const profile = await storage.getUserProfile(req.session.userId!);
      return res.json(profile || null);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load profile" });
    }
  });

  app.post("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertUserProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid profile data", errors: parsed.error.errors });
      }
      const existing = await storage.getUserProfile(req.session.userId!);
      if (existing) {
        return res.status(409).json({ message: "Profile already exists. Use PUT to update." });
      }
      const profile = await storage.createUserProfile(req.session.userId!, parsed.data);
      return res.json(profile);
    } catch (err) {
      console.error("Profile creation error:", err);
      return res.status(500).json({ message: "Failed to create profile" });
    }
  });

  app.put("/api/profile", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertUserProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid profile data", errors: parsed.error.errors });
      }
      const existing = await storage.getUserProfile(req.session.userId!);
      if (!existing) {
        const profile = await storage.createUserProfile(req.session.userId!, parsed.data);
        return res.json(profile);
      }
      const profile = await storage.updateUserProfile(req.session.userId!, parsed.data);
      return res.json(profile);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post("/api/plan", requireAuth, async (req: Request, res: Response) => {
    try {
      const { idempotencyKey, startDate, ...prefsBody } = req.body;
      if (prefsBody.goal === "fat_loss") {
        prefsBody.goal = "weight_loss";
      }
      const parsed = preferencesSchema.safeParse(prefsBody);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid preferences" });
      }

      const userId = req.session.userId!;

      if (idempotencyKey) {
        const existing = await storage.findByIdempotencyKey(userId, idempotencyKey);
        if (existing) {
          return res.json(existing);
        }
      }

      const generating = await storage.findGeneratingPlan(userId);
      if (generating) {
        return res.json(generating);
      }

      const aiCalls = await storage.getAiCallCountToday(userId);
      if (aiCalls >= 10) {
        return res.status(429).json({ message: "Daily AI call limit reached (10/day). Try again tomorrow." });
      }

      const userProfile = await storage.getUserProfile(userId);
      if (!userProfile) {
        return res.status(400).json({ message: "Please complete your Performance Blueprint (profile) before creating a meal plan.", profileRequired: true });
      }

      let standaloneConstraintBlock = "";
      const scheduledDates = await storage.getScheduledMealPlanDates(userId);
      const validSD = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : undefined;
      const ruleCtx: RuleContext = {
        profile: userProfile,
        planKind: "meal",
        startDate: validSD,
        mealPreferences: prefsBody,
        existingScheduledMealDates: scheduledDates,
        existingScheduledWorkoutDates: [],
      };
      const cResult = evaluateConstraints(ruleCtx);
      if (cResult.blocked) {
        return res.status(400).json({
          message: cResult.violations.find(v => v.severity === "BLOCK")?.message || "Plan blocked by safety constraints.",
          blocked: true,
          violations: cResult.violations.map(v => ({ ruleKey: v.ruleKey, severity: v.severity, message: v.message, category: v.category })),
        });
      }
      standaloneConstraintBlock = buildConstraintPromptBlock(cResult.safeSpec, "meal", userProfile.nextWeekPlanBias);

      const adaptive = await computeAdaptiveForUser(userId);
      standaloneConstraintBlock += adaptive.promptBlock;

      const validStartDate = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : undefined;
      const pendingPlan = await storage.createPendingMealPlan(userId, idempotencyKey || null, parsed.data, validStartDate, userProfile, adaptive.snapshot);

      res.json(pendingPlan);

      (async () => {
        try {
          const prefCtx = await storage.getUserPreferenceContext(userId);
          const workoutDays = parsed.data.workoutDays || undefined;
          const standaloneCtx = buildWellnessContext({
            goalType: parsed.data.goal,
            startDate: validStartDate,
            mealPrefs: parsed.data,
          });
          log(`Generating full plan for user ${userId} (plan ${pendingPlan.id})`, "openai");
          const userCtx = buildUserContextForGeneration(userProfile);
          standaloneConstraintBlock += userCtx.mealPromptBlock;
          const planJson = await generateFullPlan(parsed.data, prefCtx, workoutDays, standaloneCtx, standaloneConstraintBlock, userCtx.profileExtras);
          await storage.updatePlanStatus(pendingPlan.id, "ready", planJson);
          await storage.logAction(userId, "ai_call_generate_plan", { planId: pendingPlan.id });
          log(`Plan ${pendingPlan.id} generated successfully`, "openai");
          await runGroceryPricing(pendingPlan.id, planJson, parsed.data);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          log(`Plan generation error for ${pendingPlan.id}: ${errMsg}`, "openai");
          await storage.updatePlanStatus(pendingPlan.id, "failed", undefined, errMsg);
        }
      })();
    } catch (err) {
      log(`Plan creation error: ${err}`, "openai");
      return res.status(500).json({ message: "Failed to generate meal plan. Please try again." });
    }
  });

  app.get("/api/plan/:id/status", requireAuth, async (req: Request, res: Response) => {
    const plan = await storage.getMealPlan(req.params.id as string);
    if (!plan || plan.userId !== req.session.userId || plan.deletedAt) {
      return res.status(404).json({ message: "Plan not found" });
    }
    return res.json({ id: plan.id, status: plan.status, pricingStatus: plan.pricingStatus });
  });

  app.get("/api/plan/:id", requireAuth, async (req: Request, res: Response) => {
    const plan = await storage.getMealPlan(req.params.id as string);
    if (!plan || plan.userId !== req.session.userId || plan.deletedAt) {
      return res.status(404).json({ message: "Plan not found" });
    }
    return res.json(plan);
  });

  app.get("/api/plans", requireAuth, async (req: Request, res: Response) => {
    const plans = await storage.getMealPlansByUser(req.session.userId!);
    return res.json(plans);
  });

  app.delete("/api/plans/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getMealPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId) {
        return res.status(404).json({ message: "Plan not found" });
      }
      if (plan.deletedAt) {
        return res.status(404).json({ message: "Plan not found" });
      }
      await storage.softDeletePlan(plan.id);
      return res.json({ ok: true });
    } catch (err) {
      log(`Delete plan error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to delete plan" });
    }
  });

  app.post("/api/plan/:id/swap", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getMealPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Plan not found" });
      }

      const userId = req.session.userId!;

      const { allowance, result: swapCheck } = await checkMealSwapAllowed(userId, plan.id);
      if (!swapCheck.allowed) {
        return res.status(403).json({ message: swapCheck.reason, nextResetAt: swapCheck.nextResetAt });
      }

      if (!allowance && plan.swapCount >= 3) {
        return res.status(403).json({ message: "Maximum swaps (3) reached for this plan" });
      }

      const aiCalls = await storage.getAiCallCountToday(userId);
      if (aiCalls >= 10) {
        return res.status(429).json({ message: "Daily AI call limit reached" });
      }

      const { dayIndex, mealType } = req.body;
      if (!dayIndex || !mealType || !["breakfast", "lunch", "dinner"].includes(mealType)) {
        return res.status(400).json({ message: "Invalid dayIndex or mealType" });
      }

      const planJson = plan.planJson as PlanOutput;
      const prefs = plan.preferencesJson as Preferences;
      const day = planJson.days.find(d => d.dayIndex === dayIndex);
      if (!day) {
        return res.status(400).json({ message: "Invalid dayIndex" });
      }

      const existingMeal = day.meals[mealType as keyof typeof day.meals];
      if (!existingMeal) {
        return res.status(400).json({ message: "No meal found at that slot" });
      }
      log(`Swapping ${mealType} on day ${dayIndex} for plan ${plan.id}`, "openai");

      const prefCtx = await storage.getUserPreferenceContext(userId);
      const newMeal = await generateSwapMeal(prefs, mealType, dayIndex, existingMeal.name, prefCtx);

      (day.meals as any)[mealType] = newMeal;
      const updated = await storage.updateMealPlanJson(plan.id, planJson);
      await storage.incrementSwapCount(plan.id);
      await storage.logAction(userId, "ai_call_swap_meal", { planId: plan.id, dayIndex, mealType });

      if (allowance) {
        await recordMealSwap(allowance, userId, { planId: plan.id, dayIndex, mealType });
      }

      await storage.updateGroceryPricing(plan.id, null);
      runGroceryPricing(plan.id, planJson, prefs).catch(() => {});

      return res.json(updated);
    } catch (err) {
      log(`Swap error: ${err}`, "openai");
      return res.status(500).json({ message: "Failed to swap meal" });
    }
  });

  app.post("/api/plan/:id/regenerate-day", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getMealPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Plan not found" });
      }

      const userId = req.session.userId!;

      const { allowance, result: regenCheck } = await checkMealRegenAllowed(userId, plan.id);
      if (!regenCheck.allowed) {
        return res.status(403).json({
          message: regenCheck.reason,
          cooldownMinutesRemaining: regenCheck.cooldownMinutesRemaining,
          nextResetAt: regenCheck.nextResetAt,
        });
      }

      if (!allowance && plan.regenDayCount >= 1) {
        return res.status(403).json({ message: "Maximum day regenerations (1) reached for this plan" });
      }

      const aiCalls = await storage.getAiCallCountToday(userId);
      if (aiCalls >= 10) {
        return res.status(429).json({ message: "Daily AI call limit reached" });
      }

      const { dayIndex } = req.body;
      if (!dayIndex || dayIndex < 1 || dayIndex > 7) {
        return res.status(400).json({ message: "Invalid dayIndex (1-7)" });
      }

      const planJson = plan.planJson as PlanOutput;
      const prefs = plan.preferencesJson as Preferences;

      log(`Regenerating day ${dayIndex} for plan ${plan.id}`, "openai");
      const prefCtx = await storage.getUserPreferenceContext(userId);
      const newDay = await generateDayMeals(prefs, dayIndex, prefCtx);

      const dayIdx = planJson.days.findIndex(d => d.dayIndex === dayIndex);
      if (dayIdx >= 0) {
        planJson.days[dayIdx] = newDay;
      }

      const updated = await storage.updateMealPlanJson(plan.id, planJson);
      await storage.incrementRegenDayCount(plan.id);
      await storage.logAction(userId, "ai_call_regen_day", { planId: plan.id, dayIndex });

      if (allowance) {
        await recordMealRegen(allowance, userId, { planId: plan.id, dayIndex });
      }

      await storage.updateGroceryPricing(plan.id, null);
      runGroceryPricing(plan.id, planJson, prefs).catch(() => {});

      return res.json(updated);
    } catch (err) {
      log(`Regen day error: ${err}`, "openai");
      return res.status(500).json({ message: "Failed to regenerate day" });
    }
  });

  app.post("/api/feedback/meal", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = mealFeedbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid feedback data" });
      }

      const userId = req.session.userId!;
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

  app.get("/api/preferences", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  app.delete("/api/preferences/meal/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  app.delete("/api/preferences/ingredient/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  app.get("/api/feedback/plan/:planId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  app.post("/api/plan/:id/grocery/regenerate", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getMealPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Plan not found" });
      }

      const planJson = plan.planJson as PlanOutput;
      const prefs = plan.preferencesJson as Preferences;
      planJson.groceryList = rebuildGroceryList(planJson);

      const updated = await storage.updateMealPlanJson(plan.id, planJson);

      await storage.updateGroceryPricing(plan.id, null);
      runGroceryPricing(plan.id, planJson, prefs).catch(() => {});

      return res.json(updated);
    } catch (err) {
      log(`Grocery rebuild error: ${err}`, "openai");
      return res.status(500).json({ message: "Failed to rebuild grocery list" });
    }
  });

  app.get("/api/plan/:id/grocery", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getMealPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Plan not found" });
      }

      const userId = req.session.userId!;
      const planJson = plan.planJson as PlanOutput;
      const pricing = plan.groceryPricingJson as GroceryPricing | null;
      const ownedItems = await storage.getOwnedGroceryItems(userId, plan.id);
      const ownedMap: Record<string, boolean> = {};
      for (const item of ownedItems) {
        ownedMap[item.itemKey] = item.isOwned === 1;
      }

      let totalMin = 0, totalMax = 0, ownedAdjustedMin = 0, ownedAdjustedMax = 0;
      if (pricing?.items) {
        for (const pi of pricing.items) {
          totalMin += pi.estimatedRange.min;
          totalMax += pi.estimatedRange.max;
          if (!ownedMap[pi.itemKey]) {
            ownedAdjustedMin += pi.estimatedRange.min;
            ownedAdjustedMax += pi.estimatedRange.max;
          }
        }
      }

      return res.json({
        groceryList: planJson?.groceryList || { sections: [] },
        pricing: pricing || null,
        ownedItems: ownedMap,
        totals: {
          totalMin: Math.round(totalMin * 100) / 100,
          totalMax: Math.round(totalMax * 100) / 100,
          ownedAdjustedMin: Math.round(ownedAdjustedMin * 100) / 100,
          ownedAdjustedMax: Math.round(ownedAdjustedMax * 100) / 100,
        },
      });
    } catch (err) {
      log(`Grocery fetch error: ${err}`, "openai");
      return res.status(500).json({ message: "Failed to load grocery data" });
    }
  });

  app.post("/api/plan/:id/grocery/owned", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getMealPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Plan not found" });
      }

      const { itemKey, isOwned } = req.body;
      if (!itemKey || typeof isOwned !== "boolean") {
        return res.status(400).json({ message: "itemKey and isOwned (boolean) are required" });
      }

      const userId = req.session.userId!;
      await storage.upsertOwnedGroceryItem(userId, plan.id, itemKey, isOwned);
      return res.json({ ok: true });
    } catch (err) {
      log(`Owned grocery update error: ${err}`, "openai");
      return res.status(500).json({ message: "Failed to update owned item" });
    }
  });

  app.patch("/api/plan/:id/start-date", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getMealPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Plan not found" });
      }
      const { startDate } = req.body;
      if (startDate === null) {
        const updated = await storage.updatePlanStartDate(plan.id, null);
        return res.json(updated);
      }
      if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return res.status(400).json({ message: "startDate must be YYYY-MM-DD format" });
      }
      const updated = await storage.updatePlanStartDate(plan.id, startDate);
      return res.json(updated);
    } catch (err) {
      log(`Update start date error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to update start date" });
    }
  });

  app.get("/api/calendar/all", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  app.get("/api/calendar/occupied-dates", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const excludePlanId = req.query.excludePlanId as string | undefined;
      const scheduledPlans = await storage.getScheduledPlans(userId);

      const occupiedDates = new Set<string>();
      for (const plan of scheduledPlans) {
        if (excludePlanId && plan.id === excludePlanId) continue;
        const planJson = plan.planJson as PlanOutput;
        const startDate = plan.planStartDate!;

        for (let i = 0; i < planJson.days.length; i++) {
          const date = new Date(startDate + "T00:00:00");
          date.setDate(date.getDate() + i);
          occupiedDates.add(date.toISOString().slice(0, 10));
        }
      }

      return res.json({ occupiedDates: Array.from(occupiedDates) });
    } catch (err) {
      log(`Occupied dates error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to load occupied dates" });
    }
  });

  app.get("/api/goal-plans/conflicts", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const occupiedDates = new Set<string>();

      const mealPlans = await storage.getScheduledPlans(userId);
      for (const plan of mealPlans) {
        const planJson = plan.planJson as PlanOutput;
        const startDate = plan.planStartDate!;
        for (let i = 0; i < planJson.days.length; i++) {
          const date = new Date(startDate + "T00:00:00");
          date.setDate(date.getDate() + i);
          occupiedDates.add(date.toISOString().slice(0, 10));
        }
      }

      const workoutPlans = await storage.getScheduledWorkoutPlans(userId);
      for (const plan of workoutPlans) {
        if (!plan.planStartDate || !plan.planJson) continue;
        const planJson = plan.planJson as WorkoutPlanOutput;
        for (let i = 0; i < planJson.days.length; i++) {
          const date = new Date(plan.planStartDate + "T00:00:00");
          date.setDate(date.getDate() + i);
          occupiedDates.add(date.toISOString().slice(0, 10));
        }
      }

      return res.json({ occupiedDates: Array.from(occupiedDates) });
    } catch (err) {
      log(`Goal conflicts error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to load conflicts" });
    }
  });

  app.get("/api/availability", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  app.get("/api/plan/:id/calendar", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getMealPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId) {
        return res.status(404).json({ message: "Plan not found" });
      }
      if (plan.status !== "ready" || !plan.planJson) {
        return res.status(400).json({ message: "Plan is not ready yet" });
      }

      const planJson = plan.planJson as PlanOutput;
      const prefs = plan.preferencesJson as Preferences;
      const startDate = plan.planStartDate || null;

      const mealSlots = (prefs.mealsPerDay === 2 && prefs.mealSlots && prefs.mealSlots.length === 2)
        ? prefs.mealSlots
        : (prefs.mealsPerDay === 2 ? ["lunch", "dinner"] : ["breakfast", "lunch", "dinner"]);

      if (!startDate) {
        return res.json({
          planId: plan.id,
          startDate: null,
          mealSlots,
          days: [],
        });
      }

      const calendarDays = planJson.days.map((day, i) => {
        const date = new Date(startDate + "T00:00:00");
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().slice(0, 10);
        return {
          date: dateStr,
          dayIndex: day.dayIndex,
          dayName: day.dayName,
          meals: day.meals,
          mealSlots,
        };
      });

      return res.json({
        planId: plan.id,
        startDate,
        mealSlots,
        days: calendarDays,
      });
    } catch (err) {
      log(`Calendar fetch error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to load calendar data" });
    }
  });

  app.post("/api/workout", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const parsed = workoutPreferencesSchema.safeParse(req.body.preferences);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid workout preferences", errors: parsed.error.flatten() });
      }
      const prefs = parsed.data;
      const idempotencyKey = req.body.idempotencyKey || null;
      const startDate = req.body.startDate;
      const validStartDate = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : undefined;

      if (idempotencyKey) {
        const existing = await storage.findByIdempotencyKeyWorkout(userId, idempotencyKey);
        if (existing) {
          return res.json({ id: existing.id, status: existing.status });
        }
      }

      const generating = await storage.findGeneratingWorkoutPlan(userId);
      if (generating) {
        return res.json({ id: generating.id, status: "generating" });
      }

      const userProfile = await storage.getUserProfile(userId);
      if (!userProfile) {
        return res.status(400).json({ message: "Please complete your Performance Blueprint (profile) before creating a workout plan.", profileRequired: true });
      }

      let workoutConstraintBlock = "";
      const scheduledDates = await storage.getScheduledWorkoutPlanDates(userId);
      const ruleCtx: RuleContext = {
        profile: userProfile,
        planKind: "workout",
        startDate: validStartDate,
        workoutPreferences: req.body.preferences,
        existingScheduledMealDates: [],
        existingScheduledWorkoutDates: scheduledDates,
      };
      const cResult = evaluateConstraints(ruleCtx);
      if (cResult.blocked) {
        return res.status(400).json({
          message: cResult.violations.find(v => v.severity === "BLOCK")?.message || "Plan blocked by safety constraints.",
          blocked: true,
          violations: cResult.violations.map(v => ({ ruleKey: v.ruleKey, severity: v.severity, message: v.message, category: v.category })),
        });
      }
      workoutConstraintBlock = buildConstraintPromptBlock(cResult.safeSpec, "workout", userProfile.nextWeekPlanBias);

      const adaptive = await computeAdaptiveForUser(userId);
      workoutConstraintBlock += adaptive.promptBlock;

      const plan = await storage.createPendingWorkoutPlan(userId, idempotencyKey, prefs, validStartDate, userProfile, adaptive.snapshot);

      (async () => {
        try {
          log(`Generating workout plan ${plan.id}`, "openai");
          const prefContext = await storage.getUserPreferenceContext(userId);
          const exerciseContext = { avoidedExercises: prefContext.avoidedExercises, dislikedExercises: prefContext.dislikedExercises };
          const standaloneWCtx = buildWellnessContext({
            goalType: prefs.goal,
            startDate: validStartDate,
            workoutPrefs: prefs,
          });
          const formEquip = (prefs as any).equipmentAvailable as string[] | undefined;
          const workoutUserCtx = buildUserContextForGeneration(userProfile, formEquip && formEquip.length > 0 ? { equipmentAvailable: formEquip } : undefined);
          workoutConstraintBlock += workoutUserCtx.workoutPromptBlock;
          const result = await generateWorkoutPlan(prefs, exerciseContext, standaloneWCtx, workoutConstraintBlock, workoutUserCtx.profileExtras);
          await storage.updateWorkoutPlanStatus(plan.id, "ready", result);
          log(`Workout plan ${plan.id} generated successfully`, "openai");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log(`Workout plan ${plan.id} failed: ${msg}`, "openai");
          await storage.updateWorkoutPlanStatus(plan.id, "failed", undefined, msg);
        }
      })();

      return res.json({ id: plan.id, status: "generating" });
    } catch (err) {
      log(`Workout plan creation error: ${err}`, "openai");
      return res.status(500).json({ message: "Failed to create workout plan" });
    }
  });

  app.get("/api/workout/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getWorkoutPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Workout plan not found" });
      }
      return res.json(plan);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load workout plan" });
    }
  });

  app.get("/api/workout/:id/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getWorkoutPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Workout plan not found" });
      }
      return res.json({ status: plan.status, errorMessage: plan.errorMessage });
    } catch (err) {
      return res.status(500).json({ message: "Failed to load status" });
    }
  });

  app.get("/api/workouts", requireAuth, async (req: Request, res: Response) => {
    try {
      const plans = await storage.getWorkoutPlansByUser(req.session.userId!);
      return res.json(plans);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load workout plans" });
    }
  });

  app.post("/api/workout/:id/start-date", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getWorkoutPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Workout plan not found" });
      }
      const { startDate } = req.body;
      const updated = await storage.updateWorkoutStartDate(plan.id, startDate || null);
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update start date" });
    }
  });

  app.delete("/api/workouts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getWorkoutPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId) {
        return res.status(404).json({ message: "Workout plan not found" });
      }
      await storage.softDeleteWorkoutPlan(plan.id);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete workout plan" });
    }
  });

  app.post("/api/workout/:id/regenerate-session", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getWorkoutPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Workout plan not found" });
      }

      const userId = req.session.userId!;

      const { allowance, result: regenCheck } = await checkWorkoutRegenAllowed(userId, plan.id);
      if (!regenCheck.allowed) {
        return res.status(403).json({
          message: regenCheck.reason,
          cooldownMinutesRemaining: regenCheck.cooldownMinutesRemaining,
          nextResetAt: regenCheck.nextResetAt,
        });
      }

      const aiCalls = await storage.getAiCallCountToday(userId);
      if (aiCalls >= 10) {
        return res.status(429).json({ message: "Daily AI call limit reached" });
      }

      const { dayIndex } = req.body;
      if (!dayIndex || dayIndex < 1 || dayIndex > 7) {
        return res.status(400).json({ message: "Invalid dayIndex (1-7)" });
      }

      const planJson = plan.planJson as WorkoutPlanOutput;
      const prefs = plan.preferencesJson as any;

      const dayData = planJson.days.find(d => d.dayIndex === dayIndex);
      if (!dayData || !dayData.session) {
        return res.status(400).json({ message: "No workout session exists for this day" });
      }

      log(`Regenerating workout session day ${dayIndex} for plan ${plan.id}`, "openai");
      const prefCtx = await storage.getUserPreferenceContext(userId);
      const exerciseContext = {
        avoidedExercises: prefCtx.avoidedExercises,
        dislikedExercises: prefCtx.dislikedExercises,
      };

      const newSession = await generateWorkoutSession(prefs, dayIndex, dayData.session, exerciseContext);

      const updatedDays = planJson.days.map(d =>
        d.dayIndex === dayIndex ? { ...d, session: newSession } : d
      );
      const updatedPlanJson = { ...planJson, days: updatedDays };

      const updated = await storage.updateWorkoutPlanStatus(plan.id, plan.status, updatedPlanJson);
      await storage.logAction(userId, "ai_call_regen_workout_session", { planId: plan.id, dayIndex });

      if (allowance) {
        await recordWorkoutRegen(allowance, userId, { planId: plan.id, dayIndex });
      }

      return res.json(updated);
    } catch (err) {
      log(`Regen workout session error: ${err}`, "openai");
      return res.status(500).json({ message: "Failed to regenerate workout session" });
    }
  });

  app.post("/api/feedback/workout", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = workoutFeedbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid feedback data" });
      }
      const userId = req.session.userId!;
      const record = await storage.upsertWorkoutFeedback(userId, parsed.data);
      return res.json({ record, feedback: parsed.data.feedback });
    } catch (err) {
      log(`Workout feedback error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to save workout feedback" });
    }
  });

  app.get("/api/feedback/workout/:planId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  app.get("/api/preferences/exercise", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  app.post("/api/preferences/exercise", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = exercisePreferenceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid data" });
      }
      const userId = req.session.userId!;
      const { exerciseKey, exerciseName, status } = parsed.data;
      const record = await storage.upsertExercisePreference(userId, exerciseKey, exerciseName, status);
      return res.json(record);
    } catch (err) {
      log(`Exercise preference upsert error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to save exercise preference" });
    }
  });

  app.delete("/api/preferences/exercise/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  app.delete("/api/preferences/exercise/key/:key", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  app.post("/api/goal-plans", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = goalPlanCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid goal plan data" });
      }
      const userId = req.session.userId!;
      const plan = await storage.createGoalPlan(userId, parsed.data.goalType, parsed.data.startDate);
      return res.json(plan);
    } catch (err) {
      log(`Goal plan creation error: ${err}`, "plan");
      return res.status(500).json({ message: "Failed to create goal plan" });
    }
  });

  app.post("/api/goal-plans/generate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { goalType, planType, startDate, pace, globalInputs, mealPreferences, workoutPreferences } = req.body;

      if (!goalType) {
        return res.status(400).json({ message: "goalType is required" });
      }

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
        muscle_gain: ["Strength Sprint", "Build Phase", "Gain Mode"],
        performance: ["Peak Performance", "Level Up", "Go Mode"],
        maintenance: ["Steady State", "Stay Strong", "Balance"],
        energy: ["Energy Boost", "Power Up", "Recharge"],
        general_fitness: ["Fresh Start", "New Chapter", "Kickoff"],
        mobility: ["Flex Flow", "Move Better", "Limber Up"],
        endurance: ["Long Game", "Mile Maker", "Stay Going"],
        strength: ["Iron Path", "Power Phase", "Lift Off"],
      };
      const prefixes = GOAL_TITLE_PREFIXES[goalType] || GOAL_TITLE_PREFIXES["general_fitness"];
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      const goalTitle = validStartDate
        ? `${prefix} · ${new Date(validStartDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
        : prefix;

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

      const goalPlan = await storage.createGoalPlanFull(userId, {
        goalType,
        planType: resolvedPlanType,
        startDate: validStartDate,
        endDate: validStartDate ? (() => {
          const d = new Date(validStartDate + "T00:00:00");
          d.setDate(d.getDate() + 6);
          return d.toISOString().split("T")[0];
        })() : undefined,
        pace: pace || undefined,
        title: goalTitle,
        globalInputs: globalInputs || undefined,
        nutritionInputs: needsMeal ? mealPreferences : undefined,
        trainingInputs: needsWorkout ? workoutPreferences : undefined,
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
            goalType: goalType,
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
            const pendingWorkout = await storage.createPendingWorkoutPlan(userId, wIdempotencyKey, parsedWorkout.data, validStartDate, userProfile, adaptive.snapshot);
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
            const pendingMeal = await storage.createPendingMealPlan(userId, mealIdempotencyKey, parsedMeal.data, validStartDate, userProfile, adaptive.snapshot);
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

            runGroceryPricing(pendingMeal.id, finalMealJson, parsedMeal.data).catch(() => {});
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

          try {
            await createAllowanceForGoalPlan(userId, goalPlan.id, validStartDate || undefined);
            log(`Goal gen: allowance created for goal plan ${goalPlan.id}`, "openai");
          } catch (allowanceErr) {
            log(`Goal gen: allowance creation failed for ${goalPlan.id}: ${allowanceErr}`, "openai");
          }

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

  app.get("/api/goal-plans/:id/generation-status", requireAuth, async (req: Request, res: Response) => {
    try {
      const goalPlan = await storage.getGoalPlan(req.params.id as string);
      if (!goalPlan || goalPlan.userId !== req.session.userId || goalPlan.deletedAt) {
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

  app.get("/api/goal-plans", requireAuth, async (req: Request, res: Response) => {
    try {
      const plans = await storage.getGoalPlansByUser(req.session.userId!);
      return res.json(plans);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load goal plans" });
    }
  });

  app.get("/api/goal-plans/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getGoalPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Goal plan not found" });
      }
      return res.json(plan);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load goal plan" });
    }
  });

  app.patch("/api/goal-plans/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getGoalPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId || plan.deletedAt) {
        return res.status(404).json({ message: "Goal plan not found" });
      }
      const { startDate, mealPlanId, workoutPlanId } = req.body;
      const updates: any = {};
      if (startDate !== undefined) updates.startDate = startDate;
      if (mealPlanId !== undefined) updates.mealPlanId = mealPlanId;
      if (workoutPlanId !== undefined) updates.workoutPlanId = workoutPlanId;
      const updated = await storage.updateGoalPlan(plan.id, updates);
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update goal plan" });
    }
  });

  app.delete("/api/goal-plans/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getGoalPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId) {
        return res.status(404).json({ message: "Goal plan not found" });
      }
      await storage.softDeleteGoalPlan(plan.id);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ message: "Failed to delete goal plan" });
    }
  });

  app.get("/api/allowance/current", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const mealPlanId = req.query.mealPlanId as string | undefined;
      const state = await getAllowanceState(userId, mealPlanId);
      if (!state) {
        return res.json(null);
      }
      return res.json(state);
    } catch (err) {
      return res.status(500).json({ message: "Failed to get allowance state" });
    }
  });

  app.post("/api/allowance/redeem-flex-token", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const result = await redeemFlexToken(userId);
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ message: "Failed to redeem flex token" });
    }
  });

  app.get("/api/ingredient-proposals", requireAuth, async (req: Request, res: Response) => {
    try {
      const proposals = await storage.getPendingProposals(req.session.userId!);
      return res.json(proposals);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load proposals" });
    }
  });

  app.post("/api/ingredient-proposals/:id/resolve", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = ingredientProposalResolveSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid resolve data" });
      }
      const userId = req.session.userId!;
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

  app.post("/api/check-ins", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = weeklyCheckInSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid check-in data" });
      }
      const userId = req.session.userId!;
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

  app.get("/api/check-ins", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const goalPlanId = req.query.goalPlanId as string | undefined;
      const checkIns = await storage.getWeeklyCheckIns(userId, goalPlanId);
      return res.json(checkIns);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load check-ins" });
    }
  });

  app.get("/api/performance/latest", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const summary = await storage.getLatestPerformanceSummary(userId);
      return res.json(summary || null);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load performance summary" });
    }
  });

  app.get("/api/performance", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  app.post("/api/weekly-adaptation/compute", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  app.get("/api/weekly-adaptation/latest", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const adaptation = await storage.getLatestWeeklyAdaptation(userId);
      return res.json(adaptation || null);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load weekly adaptation" });
    }
  });

  app.get("/api/calendar/workout-occupied-dates", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const excludePlanId = req.query.excludePlanId as string | undefined;
      const plans = await storage.getScheduledWorkoutPlans(userId);
      const occupiedDates = new Set<string>();
      for (const plan of plans) {
        if (excludePlanId && plan.id === excludePlanId) continue;
        if (!plan.planStartDate || !plan.planJson) continue;
        const planJson = plan.planJson as WorkoutPlanOutput;
        for (let i = 0; i < planJson.days.length; i++) {
          const date = new Date(plan.planStartDate + "T00:00:00");
          date.setDate(date.getDate() + i);
          occupiedDates.add(date.toISOString().slice(0, 10));
        }
      }
      return res.json({ occupiedDates: Array.from(occupiedDates) });
    } catch (err) {
      return res.status(500).json({ message: "Failed to load occupied dates" });
    }
  });

  app.get("/api/calendar/workouts", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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
  app.post("/api/daily-meal", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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
            goal: profile.primaryGoal || "maintenance",
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

  app.get("/api/daily-meal/:date", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const meal = await storage.getDailyMealByDate(userId, req.params.date);
      if (!meal) return res.status(404).json({ message: "No daily meal for this date" });
      return res.json(meal);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load daily meal" });
    }
  });

  app.get("/api/daily-meals", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { start, end } = req.query;
      if (!start || !end) return res.status(400).json({ message: "start and end query params required" });
      const meals = await storage.getDailyMealsByDateRange(userId, start as string, end as string);
      return res.json(meals);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load daily meals" });
    }
  });

  // ── Daily Workout Planning ──
  app.post("/api/daily-workout", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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
            goal: profile.primaryGoal || "maintenance",
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

  app.get("/api/daily-workout/:date", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const workout = await storage.getDailyWorkoutByDate(userId, req.params.date);
      if (!workout) return res.status(404).json({ message: "No daily workout for this date" });
      return res.json(workout);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load daily workout" });
    }
  });

  app.get("/api/daily-workouts", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { start, end } = req.query;
      if (!start || !end) return res.status(400).json({ message: "start and end query params required" });
      const workouts = await storage.getDailyWorkoutsByDateRange(userId, start as string, end as string);
      return res.json(workouts);
    } catch (err) {
      return res.status(500).json({ message: "Failed to load daily workouts" });
    }
  });

  // ── Daily Plan Regeneration ──
  app.post("/api/daily-meal/:date/regenerate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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
            goal: profile.primaryGoal || "maintenance",
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

  app.post("/api/daily-workout/:date/regenerate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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
            goal: profile.primaryGoal || "maintenance",
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
  app.get("/api/daily-coverage", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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
  app.get("/api/completions", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  app.post("/api/completions/toggle", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  app.get("/api/completions/adherence", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
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

  return httpServer;
}
