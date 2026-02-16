import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { hash, compare } from "bcryptjs";
import { signupSchema, loginSchema, preferencesSchema, mealFeedbackSchema, type PlanOutput, type Preferences, type GroceryPricing } from "@shared/schema";
import { generateFullPlan, generateSwapMeal, generateDayMeals, rebuildGroceryList, generateGroceryPricing } from "./openai";
import { generateMealFingerprint, extractKeyIngredients, normalizeItemKey } from "./meal-utils";
import { log } from "./index";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

async function runGroceryPricing(planId: string, planJson: PlanOutput, prefs: Preferences): Promise<void> {
  try {
    log(`Generating grocery pricing for plan ${planId}`, "openai");
    const pricing = await generateGroceryPricing(
      planJson.groceryList.sections,
      prefs.householdSize,
      prefs.prepStyle,
    );
    await storage.updateGroceryPricing(planId, pricing);
    log(`Grocery pricing generated for plan ${planId}`, "openai");
  } catch (err) {
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
      store: new MemoryStore({ checkPeriod: 86400000 }),
      secret: process.env.SESSION_SECRET || "meal-plan-default-session-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
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

  app.post("/api/plan", requireAuth, async (req: Request, res: Response) => {
    try {
      const { idempotencyKey, ...prefsBody } = req.body;
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

      const pendingPlan = await storage.createPendingMealPlan(userId, idempotencyKey || null, parsed.data);

      res.json(pendingPlan);

      (async () => {
        try {
          const prefCtx = await storage.getUserPreferenceContext(userId);
          log(`Generating full plan for user ${userId} (plan ${pendingPlan.id})`, "openai");
          const planJson = await generateFullPlan(parsed.data, prefCtx);
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
    if (!plan || plan.userId !== req.session.userId) {
      return res.status(404).json({ message: "Plan not found" });
    }
    return res.json({ id: plan.id, status: plan.status });
  });

  app.get("/api/plan/:id", requireAuth, async (req: Request, res: Response) => {
    const plan = await storage.getMealPlan(req.params.id as string);
    if (!plan || plan.userId !== req.session.userId) {
      return res.status(404).json({ message: "Plan not found" });
    }
    return res.json(plan);
  });

  app.get("/api/plans", requireAuth, async (req: Request, res: Response) => {
    const plans = await storage.getMealPlansByUser(req.session.userId!);
    return res.json(plans);
  });

  app.post("/api/plan/:id/swap", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getMealPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId) {
        return res.status(404).json({ message: "Plan not found" });
      }
      if (plan.swapCount >= 3) {
        return res.status(403).json({ message: "Maximum swaps (3) reached for this plan" });
      }

      const userId = req.session.userId!;
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
      log(`Swapping ${mealType} on day ${dayIndex} for plan ${plan.id}`, "openai");

      const prefCtx = await storage.getUserPreferenceContext(userId);
      const newMeal = await generateSwapMeal(prefs, mealType, dayIndex, existingMeal.name, prefCtx);

      day.meals[mealType as keyof typeof day.meals] = newMeal;
      const updated = await storage.updateMealPlanJson(plan.id, planJson);
      await storage.incrementSwapCount(plan.id);
      await storage.logAction(userId, "ai_call_swap_meal", { planId: plan.id, dayIndex, mealType });

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
      if (!plan || plan.userId !== req.session.userId) {
        return res.status(404).json({ message: "Plan not found" });
      }
      if (plan.regenDayCount >= 1) {
        return res.status(403).json({ message: "Maximum day regenerations (1) reached for this plan" });
      }

      const userId = req.session.userId!;
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

      if (feedback === "dislike" && ingredients && ingredients.length > 0) {
        const keyIngredients = extractKeyIngredients(ingredients);
        for (const ing of keyIngredients) {
          await storage.upsertIngredientPreference(userId, ing, "avoid", "derived");
        }
      }

      if (feedback === "like" && ingredients && ingredients.length > 0) {
        const keyIngredients = extractKeyIngredients(ingredients);
        for (const ing of keyIngredients) {
          await storage.upsertIngredientPreference(userId, ing, "prefer", "derived");
        }
      }

      return res.json(record);
    } catch (err) {
      log(`Feedback error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to save feedback" });
    }
  });

  app.get("/api/preferences", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const context = await storage.getUserPreferenceContext(userId);
      return res.json(context);
    } catch (err) {
      log(`Preferences fetch error: ${err}`, "feedback");
      return res.status(500).json({ message: "Failed to load preferences" });
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
      if (!plan || plan.userId !== req.session.userId) {
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
      if (!plan || plan.userId !== req.session.userId) {
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
      if (!plan || plan.userId !== req.session.userId) {
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

  return httpServer;
}
