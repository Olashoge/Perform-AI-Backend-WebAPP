import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { hash, compare } from "bcryptjs";
import { signupSchema, loginSchema, preferencesSchema, type PlanOutput, type Preferences } from "@shared/schema";
import { generateFullPlan, generateSwapMeal, generateDayMeals, rebuildGroceryList } from "./openai";
import { log } from "./index";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

declare module "express-session" {
  interface SessionData {
    userId: string;
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
          log(`Generating full plan for user ${userId} (plan ${pendingPlan.id})`, "openai");
          const planJson = await generateFullPlan(parsed.data);
          await storage.updatePlanStatus(pendingPlan.id, "ready", planJson);
          await storage.logAction(userId, "ai_call_generate_plan", { planId: pendingPlan.id });
          log(`Plan ${pendingPlan.id} generated successfully`, "openai");
        } catch (err) {
          log(`Plan generation error for ${pendingPlan.id}: ${err}`, "openai");
          await storage.updatePlanStatus(pendingPlan.id, "failed");
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

      const newMeal = await generateSwapMeal(prefs, mealType, dayIndex, existingMeal.name);

      day.meals[mealType as keyof typeof day.meals] = newMeal;
      const updated = await storage.updateMealPlanJson(plan.id, planJson);
      await storage.incrementSwapCount(plan.id);
      await storage.logAction(userId, "ai_call_swap_meal", { planId: plan.id, dayIndex, mealType });

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
      const newDay = await generateDayMeals(prefs, dayIndex);

      const dayIdx = planJson.days.findIndex(d => d.dayIndex === dayIndex);
      if (dayIdx >= 0) {
        planJson.days[dayIdx] = newDay;
      }

      const updated = await storage.updateMealPlanJson(plan.id, planJson);
      await storage.incrementRegenDayCount(plan.id);
      await storage.logAction(userId, "ai_call_regen_day", { planId: plan.id, dayIndex });

      return res.json(updated);
    } catch (err) {
      log(`Regen day error: ${err}`, "openai");
      return res.status(500).json({ message: "Failed to regenerate day" });
    }
  });

  app.post("/api/plan/:id/grocery/regenerate", requireAuth, async (req: Request, res: Response) => {
    try {
      const plan = await storage.getMealPlan(req.params.id as string);
      if (!plan || plan.userId !== req.session.userId) {
        return res.status(404).json({ message: "Plan not found" });
      }

      const planJson = plan.planJson as PlanOutput;
      planJson.groceryList = rebuildGroceryList(planJson);

      const updated = await storage.updateMealPlanJson(plan.id, planJson);
      return res.json(updated);
    } catch (err) {
      log(`Grocery rebuild error: ${err}`, "openai");
      return res.status(500).json({ message: "Failed to rebuild grocery list" });
    }
  });

  return httpServer;
}
