import { useState, useRef, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { preferencesSchema, workoutPreferencesSchema, type Preferences, type WorkoutPreferences, type UserProfile } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Loader2, Sparkles, X, Plus, ChefHat, User, Home, Target, Clock, Crosshair, AlertTriangle, ArrowLeft, ArrowRight, Check, ExternalLink, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EQUIPMENT_CATEGORIES, getPreselectForLocation } from "@/lib/equipment-constants";
import { Label } from "@/components/ui/label";

const COMMON_FOODS_TO_AVOID = [
  "Pork", "Shellfish", "Dairy", "Gluten", "Soy", "Eggs", "Nuts", "Red Meat", "Fish", "Mushrooms",
  "Chicken", "Beans/Legumes", "Spicy Foods", "Garlic/Onion",
];

const DIET_STYLES = [
  "No Preference", "Nigerian", "Mediterranean", "Vegetarian", "Vegan",
  "Keto", "Paleo", "Indian", "Chinese", "Mexican", "Japanese", "Korean", "Thai", "Italian", "American",
];

const GOAL_OPTIONS = [
  { value: "weight_loss", label: "Weight Loss" },
  { value: "muscle_gain", label: "Muscle Gain" },
  { value: "body_recomposition", label: "Body Recomposition" },
  { value: "general_fitness", label: "General Fitness" },
  { value: "athletic_performance", label: "Athletic Performance" },
];

const PLAN_TYPE_OPTIONS = [
  { value: "both", label: "Meal + Workout" },
  { value: "meal", label: "Meal Only" },
  { value: "workout", label: "Workout Only" },
];

const PACE_OPTIONS = [
  { value: "gentle", label: "Gentle" },
  { value: "steady", label: "Steady" },
  { value: "aggressive", label: "Aggressive" },
];

const LOCATION_OPTIONS = [
  { value: "gym", label: "Gym" },
  { value: "home", label: "Home" },
  { value: "outdoors", label: "Outdoors" },
];

const TRAINING_MODE_OPTIONS = [
  { value: "strength", label: "Strength" },
  { value: "cardio", label: "Cardio" },
  { value: "both", label: "Both" },
];

const STRENGTH_FOCUS_AREAS = [
  "Full Body", "Upper Body", "Lower Body", "Core", "Back", "Chest", "Arms", "Shoulders", "Glutes", "Legs",
];

const CARDIO_FOCUS_AREAS = [
  "Full Body", "Core", "Endurance", "Conditioning", "Mobility", "Lower Body",
];

const ALL_FOCUS_AREAS = [
  "Full Body", "Upper Body", "Lower Body", "Core", "Back", "Chest", "Arms", "Shoulders", "Glutes", "Legs", "Flexibility", "Endurance", "Conditioning", "Mobility",
];

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const SESSION_LENGTHS = [
  { value: 20, label: "20 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "60 min" },
];

const EXPERIENCE_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const STEP_INFO = [
  { title: "Wellness Overview", description: "Choose your fitness goal and plan type" },
  { title: "Nutrition Setup", description: "Customize your meal preferences" },
  { title: "Training Setup", description: "Configure your workout preferences" },
  { title: "Review", description: "Review your plan before generating" },
];

function mapGoalForMeal(goalType: string): "weight_loss" | "muscle_gain" | "body_recomposition" | "general_fitness" | "athletic_performance" {
  switch (goalType) {
    case "weight_loss": return "weight_loss";
    case "muscle_gain": return "muscle_gain";
    case "body_recomposition": return "body_recomposition";
    case "athletic_performance": return "athletic_performance";
    // legacy
    case "performance": return "athletic_performance";
    case "maintenance": return "general_fitness";
    case "energy": return "general_fitness";
    case "mobility": return "general_fitness";
    case "endurance": return "general_fitness";
    case "strength": return "muscle_gain";
    default: return "general_fitness";
  }
}

function mapGoalForWorkout(goalType: string): "weight_loss" | "muscle_gain" | "body_recomposition" | "general_fitness" | "athletic_performance" {
  switch (goalType) {
    case "weight_loss": return "weight_loss";
    case "muscle_gain": return "muscle_gain";
    case "body_recomposition": return "body_recomposition";
    case "athletic_performance": return "athletic_performance";
    // legacy
    case "performance": return "athletic_performance";
    case "maintenance": return "general_fitness";
    case "energy": return "general_fitness";
    case "mobility": return "general_fitness";
    case "endurance": return "general_fitness";
    case "strength": return "muscle_gain";
    default: return "general_fitness";
  }
}

export default function GoalWizard() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isPending, setIsPending] = useState(false);
  const submittedRef = useRef(false);
  const [customStyleInput, setCustomStyleInput] = useState("");

  const [goalType, setGoalType] = useState("weight_loss");
  const [planType, setPlanType] = useState<"both" | "meal" | "workout">("both");
  const [startDate, setStartDate] = useState("");
  const [pace, setPace] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const prefillDone = useRef(false);

  const includeMeal = planType === "both" || planType === "meal";
  const includeWorkout = planType === "both" || planType === "workout";

  const { data: availabilityData } = useQuery<{ mealDates: string[], workoutDates: string[], allDates: string[] }>({
    queryKey: ["/api/availability"],
    enabled: !!user,
    staleTime: 0,
  });

  const { data: profileData, isLoading: profileLoading } = useQuery<UserProfile | null>({
    queryKey: ["/api/profile"],
    enabled: !!user,
  });

  const dateConflicts = useMemo(() => {
    if (!startDate || !availabilityData) return { meal: [] as string[], workout: [] as string[] };
    const mealOccupied = new Set(availabilityData.mealDates || []);
    const workoutOccupied = new Set(availabilityData.workoutDates || []);
    const mealConflicts: string[] = [];
    const workoutConflicts: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate + "T00:00:00");
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      if (includeMeal && mealOccupied.has(ds)) mealConflicts.push(ds);
      if (includeWorkout && workoutOccupied.has(ds)) workoutConflicts.push(ds);
    }
    return { meal: mealConflicts, workout: workoutConflicts };
  }, [startDate, availabilityData, includeMeal, includeWorkout]);

  const mealForm = useForm<Preferences>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      goal: "general_fitness",
      dietStyles: ["No Preference"],
      foodsToAvoid: [],
      householdSize: 1,
      prepStyle: "cook_daily",
      budgetMode: "normal",
      cookingTime: "normal",
      mealsPerDay: 3,
      mealSlots: undefined,
      allergies: "",
      age: undefined,
      currentWeight: undefined,
      targetWeight: undefined,
      weightUnit: "lb",
      workoutDaysPerWeek: undefined,
      workoutDays: undefined,
      spiceLevel: "medium",
      authenticityMode: "mixed",
    },
  });

  const workoutForm = useForm<WorkoutPreferences>({
    resolver: zodResolver(workoutPreferencesSchema),
    defaultValues: {
      goal: "general_fitness",
      location: "",
      trainingMode: "both",
      focusAreas: ["Full Body"],
      daysOfWeek: ["Mon", "Wed", "Fri"],
      sessionLength: 45,
      experienceLevel: "intermediate",
      limitations: "",
      equipmentAvailable: [],
    },
  });

  useEffect(() => {
    if (!profileData || prefillDone.current) return;
    prefillDone.current = true;
    const validGoals = GOAL_OPTIONS.map(g => g.value);
    if (validGoals.includes(profileData.primaryGoal)) {
      setGoalType(profileData.primaryGoal);
    }
    const profileFoods = (profileData.foodsToAvoid as string[]) || [];
    if (profileFoods.length > 0) {
      mealForm.setValue("foodsToAvoid", profileFoods);
    }
    const profileAllergies = (profileData.allergiesIntolerances as string[]) || [];
    if (profileAllergies.length > 0) {
      mealForm.setValue("allergies", profileAllergies.join(", "));
    }
    if (profileData.spicePreference) {
      const spiceMap: Record<string, "none" | "mild" | "medium" | "hot"> = { mild: "mild", medium: "medium", spicy: "hot" };
      mealForm.setValue("spiceLevel", spiceMap[profileData.spicePreference] || "medium");
    }
    workoutForm.setValue("experienceLevel", profileData.trainingExperience as "beginner" | "intermediate" | "advanced");
    const profileDays = (profileData.trainingDaysOfWeek as string[]) || [];
    if (profileDays.length > 0) {
      const mapped = profileDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)) as ("Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat")[];
      workoutForm.setValue("daysOfWeek", mapped);
    }
    if (profileData.sessionDurationMinutes) {
      const validLengths = [20, 30, 45, 60] as const;
      const closest = validLengths.reduce((prev, curr) =>
        Math.abs(curr - profileData.sessionDurationMinutes!) < Math.abs(prev - profileData.sessionDurationMinutes!) ? curr : prev
      );
      workoutForm.setValue("sessionLength", closest);
    }
    const healthConstraints = (profileData.healthConstraints as string[]) || [];
    if (healthConstraints.length > 0) {
      workoutForm.setValue("limitations", healthConstraints.join(", "));
    }
    const profileLoc = profileData.workoutLocationDefault as "" | "gym" | "home" | "outdoors";
    if (profileLoc) {
      workoutForm.setValue("location", profileLoc);
    }
    const profileEquip = (profileData.equipmentAvailable as string[]) || [];
    if (profileEquip.length > 0) {
      workoutForm.setValue("equipmentAvailable", profileEquip);
    } else if (profileLoc) {
      workoutForm.setValue("equipmentAvailable", getPreselectForLocation(profileLoc));
    }
  }, [profileData, mealForm, workoutForm]);

  function getVisibleSteps() {
    const steps = [1];
    if (includeMeal) steps.push(2);
    if (includeWorkout) steps.push(3);
    steps.push(4);
    return steps;
  }

  const visibleSteps = getVisibleSteps();

  function getNextStep() {
    const idx = visibleSteps.indexOf(step);
    if (idx < visibleSteps.length - 1) return visibleSteps[idx + 1];
    return step;
  }

  function getPrevStep() {
    const idx = visibleSteps.indexOf(step);
    if (idx > 0) return visibleSteps[idx - 1];
    return step;
  }

  async function handleNext() {
    if (step === 1) {
      if (!goalType) {
        toast({ title: "Please select a goal type", variant: "destructive" });
        return;
      }
      mealForm.setValue("goal", mapGoalForMeal(goalType));
      workoutForm.setValue("goal", mapGoalForWorkout(goalType));
      setStep(getNextStep());
      return;
    }

    if (step === 2) {
      const valid = await mealForm.trigger();
      if (!valid) return;
      setStep(getNextStep());
      return;
    }

    if (step === 3) {
      const valid = await workoutForm.trigger();
      if (!valid) return;
      mealForm.setValue("workoutDays", workoutForm.getValues("daysOfWeek"));
      setStep(getNextStep());
      return;
    }
  }

  function handleBack() {
    setStep(getPrevStep());
  }

  async function handleSubmit() {
    if (!user || isPending || submittedRef.current) return;
    submittedRef.current = true;
    setIsPending(true);

    const mealData = mealForm.getValues();
    if (mealData.workoutDays && mealData.workoutDays.length > 0) {
      mealData.workoutDaysPerWeek = mealData.workoutDays.length;
    }

    const mealPreferences = includeMeal ? {
      ...mealData,
      goal: mapGoalForMeal(goalType),
    } : undefined;

    const workoutPreferences = includeWorkout ? {
      ...workoutForm.getValues(),
      goal: mapGoalForWorkout(goalType),
    } : undefined;

    const globalInputs: Record<string, any> = {};
    const age = mealForm.getValues("age");
    const currentWeight = mealForm.getValues("currentWeight");
    const targetWeight = mealForm.getValues("targetWeight");
    const weightUnit = mealForm.getValues("weightUnit");
    if (age !== undefined && age !== null) globalInputs.age = age;
    if (currentWeight !== undefined && currentWeight !== null) globalInputs.currentWeight = currentWeight;
    if (targetWeight !== undefined && targetWeight !== null) globalInputs.targetWeight = targetWeight;
    if (weightUnit) globalInputs.weightUnit = weightUnit;

    try {
      const res = await apiRequest("POST", "/api/goal-plans/generate", {
        goalType,
        planType,
        startDate: startDate || undefined,
        pace: pace || undefined,
        mealPreferences,
        workoutPreferences,
        ...(Object.keys(globalInputs).length > 0 ? { globalInputs } : {}),
      });
      const data = await res.json();
      navigate(`/goals/${data.goalPlanId}/generating?meal=${includeMeal}&workout=${includeWorkout}`);
    } catch (err: any) {
      submittedRef.current = false;
      setIsPending(false);
      const errMsg = err?.message || "";

      let parsedBody: any = null;
      try {
        const jsonStart = errMsg.indexOf("{");
        if (jsonStart >= 0) {
          parsedBody = JSON.parse(errMsg.slice(jsonStart));
        }
      } catch {}

      if (parsedBody?.blocked && parsedBody?.violations?.length > 0) {
        const violationMessages = parsedBody.violations
          .map((v: any) => v.message)
          .filter(Boolean);
        toast({
          title: "Plan cannot be generated",
          description: violationMessages.join(" "),
          variant: "destructive",
        });
      } else if (errMsg.includes("429")) {
        toast({ title: "Daily AI call limit reached. Try again tomorrow.", variant: "destructive" });
      } else {
        toast({ title: parsedBody?.message || "Failed to create wellness plan. Please try again.", variant: "destructive" });
      }
    }
  }

  if (isLoading || profileLoading || !user) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <Card>
          <CardContent className="p-6 space-y-4">
            <User className="h-10 w-10 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-semibold">Profile Required</h2>
            <p className="text-sm text-muted-foreground">
              Set up your Performance Blueprint before creating a plan. This helps us personalize your meals and workouts.
            </p>
            <Button onClick={() => navigate("/profile")} data-testid="button-go-to-profile">
              Set Up Profile
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  function formatEndDate(start: string) {
    if (!start) return "";
    const d = new Date(start + "T00:00:00");
    d.setDate(d.getDate() + 6);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function formatStartDate(start: string) {
    if (!start) return "";
    const d = new Date(start + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  const goalLabel = GOAL_OPTIONS.find(g => g.value === goalType)?.label || goalType;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-center gap-0 mb-6">
          {visibleSteps.map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors ${
                  step === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : step > s || visibleSteps.indexOf(step) > i
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted-foreground/30 text-muted-foreground"
                }`}
                data-testid={`step-indicator-${s}`}
              >
                {visibleSteps.indexOf(step) > i ? <Check className="h-4 w-4" /> : visibleSteps.indexOf(s) + 1}
              </div>
              {i < visibleSteps.length - 1 && (
                <div
                  className={`w-12 sm:w-16 h-0.5 ${
                    visibleSteps.indexOf(step) > i ? "bg-primary" : "bg-muted-foreground/20"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight mb-1" data-testid="text-step-title">
            {STEP_INFO[step - 1].title}
          </h1>
          <p className="text-muted-foreground text-sm" data-testid="text-step-description">
            {STEP_INFO[step - 1].description}
          </p>
        </div>
      </div>

      {profileData && (
        <section className="mb-8">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Your Profile</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/profile")} type="button" data-testid="link-edit-profile-wizard">
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          </div>
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm" data-testid="profile-summary-wizard">
                <div><span className="text-muted-foreground">Age:</span>{" "}<span className="font-medium">{profileData.age}</span></div>
                <div><span className="text-muted-foreground">Weight:</span>{" "}<span className="font-medium">{profileData.unitSystem === "metric" ? `${profileData.weightKg} kg` : `${Math.round(profileData.weightKg * 2.205)} lbs`}</span></div>
                <div><span className="text-muted-foreground">Goal:</span>{" "}<span className="font-medium capitalize">{profileData.primaryGoal.replace(/_/g, " ")}</span></div>
                <div><span className="text-muted-foreground">Experience:</span>{" "}<span className="font-medium capitalize">{profileData.trainingExperience}</span></div>
                {((profileData.trainingDaysOfWeek as string[]) || []).length > 0 && (
                  <div className="col-span-2"><span className="text-muted-foreground">Training:</span>{" "}<span className="font-medium">{((profileData.trainingDaysOfWeek as string[]) || []).map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")} ({((profileData.trainingDaysOfWeek as string[]) || []).length}/wk)</span></div>
                )}
                {((profileData.allergiesIntolerances as string[]) || []).length > 0 && (
                  <div className="col-span-2 sm:col-span-3"><span className="text-muted-foreground">Allergies & intolerances:</span>{" "}<span className="font-medium">{(profileData.allergiesIntolerances as string[]).join(", ")}</span></div>
                )}
                {((profileData.foodsToAvoid as string[]) || []).length > 0 && (
                  <div className="col-span-2 sm:col-span-3"><span className="text-muted-foreground">Foods to avoid:</span>{" "}<span className="font-medium">{(profileData.foodsToAvoid as string[]).join(", ")}</span></div>
                )}
                {((profileData.healthConstraints as string[]) || []).length > 0 && (
                  <div className="col-span-2 sm:col-span-3"><span className="text-muted-foreground">Health constraints:</span>{" "}<span className="font-medium">{(profileData.healthConstraints as string[]).join(", ")}</span></div>
                )}
                {profileData.favoriteMealsText && (
                  <div className="col-span-2 sm:col-span-3"><span className="text-muted-foreground">Favorites:</span>{" "}<span className="font-medium">{profileData.favoriteMealsText}</span></div>
                )}
                {profileData.bodyContext && (
                  <div className="col-span-2 sm:col-span-3"><span className="text-muted-foreground">Body notes:</span>{" "}<span className="font-medium">{profileData.bodyContext}</span></div>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {step === 1 && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium mb-2 block">What is your primary goal?</label>
                  <div className="grid grid-cols-2 gap-2">
                    {GOAL_OPTIONS.map(opt => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={goalType === opt.value ? "default" : "outline"}
                        className="justify-start"
                        onClick={() => setGoalType(opt.value)}
                        data-testid={`button-goal-${opt.value}`}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-6">
                  <label className="text-sm font-medium mb-2 block">What would you like to create?</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {PLAN_TYPE_OPTIONS.map(opt => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={planType === opt.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPlanType(opt.value as "both" | "meal" | "workout")}
                        data-testid={`button-plan-type-${opt.value}`}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-6">
                  <label className="text-sm font-medium mb-2 block">Start Date</label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    className="max-w-xs"
                    data-testid="input-start-date"
                  />
                  {(dateConflicts.meal.length > 0 || dateConflicts.workout.length > 0) && (
                    <div className="mt-2 flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400" data-testid="text-date-conflict-warning">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <span>
                        {planType === "both" ? (
                          <>
                            {dateConflicts.meal.length > 0 && `${dateConflicts.meal.length} meal day${dateConflicts.meal.length > 1 ? "s" : ""} overlap. `}
                            {dateConflicts.workout.length > 0 && `${dateConflicts.workout.length} workout day${dateConflicts.workout.length > 1 ? "s" : ""} overlap. `}
                          </>
                        ) : (
                          <>
                            {(dateConflicts.meal.length + dateConflicts.workout.length) === 1
                              ? "1 day in this week overlaps with an existing plan."
                              : `${dateConflicts.meal.length + dateConflicts.workout.length} days in this week overlap with existing plans.`}
                          </>
                        )}
                        {" "}You can still proceed, but plans may conflict.
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1.5">You can also schedule this later from the plan details page.</p>
                </div>

                <div className="border-t pt-6">
                  <label className="text-sm font-medium mb-2 block">Pace (optional)</label>
                  <p className="text-xs text-muted-foreground mb-3">Gentle — small, sustainable changes you can stick with long-term. Steady — a balanced approach that keeps you progressing without burning out. Aggressive — pushes harder for faster results; best if you have experience and strong habits.</p>
                  <div className="flex gap-2 flex-wrap">
                    {PACE_OPTIONS.map(opt => (
                      <Button
                        key={opt.value}
                        type="button"
                        variant={pace === opt.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPace(pace === opt.value ? "" : opt.value)}
                        data-testid={`button-pace-${opt.value}`}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 2 && (
        <Form {...mealForm}>
          <div className="space-y-8">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <ChefHat className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Diet & Cuisine</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6 space-y-6">
                  <FormField
                    control={mealForm.control}
                    name="dietStyles"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Diet / Cuisine Styles</FormLabel>
                        <FormDescription>Pick one or more cuisines, or type your own</FormDescription>
                        {(field.value || []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {(field.value || []).map((style: string) => (
                              <Badge
                                key={style}
                                variant="default"
                                className="cursor-pointer gap-1"
                                onClick={() => field.onChange(field.value.filter((s: string) => s !== style))}
                                data-testid={`badge-style-${style.toLowerCase().replace(/\s/g, "-")}`}
                              >
                                {style}
                                <X className="h-3 w-3" />
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                          {DIET_STYLES.filter(s => !(field.value || []).includes(s)).map((style) => (
                            <Button
                              key={style}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="justify-start text-xs"
                              onClick={() => {
                                const current = field.value || [];
                                if (style === "No Preference") {
                                  field.onChange(["No Preference"]);
                                } else {
                                  field.onChange([...current.filter(s => s !== "No Preference"), style]);
                                }
                              }}
                              data-testid={`button-style-${style.toLowerCase().replace(/\s/g, "-")}`}
                            >
                              <Plus className="h-3 w-3 mr-1 shrink-0" />
                              {style}
                            </Button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Input
                            placeholder="Add custom style..."
                            className="flex-1"
                            value={customStyleInput}
                            onChange={(e) => setCustomStyleInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const trimmed = customStyleInput.trim();
                                if (trimmed && !(field.value || []).includes(trimmed)) {
                                  field.onChange([...(field.value || []).filter(s => s !== "No Preference"), trimmed]);
                                  setCustomStyleInput("");
                                }
                              }
                            }}
                            data-testid="input-custom-style"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const trimmed = customStyleInput.trim();
                              if (trimmed && !(field.value || []).includes(trimmed)) {
                                field.onChange([...(field.value || []).filter(s => s !== "No Preference"), trimmed]);
                                setCustomStyleInput("");
                              }
                            }}
                            disabled={!customStyleInput.trim()}
                            data-testid="button-add-custom-style"
                          >
                            Add
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="border-t pt-6">
                    <FormField
                      control={mealForm.control}
                      name="foodsToAvoid"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Foods to Avoid</FormLabel>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2.5 mt-2">
                            {COMMON_FOODS_TO_AVOID.map((food) => (
                              <label key={food} className="flex items-center gap-2.5 text-sm cursor-pointer">
                                <Checkbox
                                  checked={field.value?.includes(food)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      field.onChange([...(field.value || []), food]);
                                    } else {
                                      field.onChange(field.value?.filter((f: string) => f !== food));
                                    }
                                  }}
                                  data-testid={`checkbox-avoid-${food.toLowerCase().replace(/[\s/]/g, "-")}`}
                                />
                                {food}
                              </label>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="border-t pt-6">
                    <FormField
                      control={mealForm.control}
                      name="allergies"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Allergies & Intolerances (optional)</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="List any allergies or additional foods to avoid..."
                              className="resize-none"
                              data-testid="input-allergies"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Meals & Schedule</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6 space-y-6">
                  <FormField
                    control={mealForm.control}
                    name="mealsPerDay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Meals Per Day</FormLabel>
                        <div className="flex gap-2 mt-2">
                          <Button
                            type="button"
                            variant={field.value === 2 ? "default" : "outline"}
                            onClick={() => {
                              field.onChange(2);
                              mealForm.setValue("mealSlots", ["lunch", "dinner"]);
                            }}
                            data-testid="button-meals-2"
                          >
                            2 Meals
                          </Button>
                          <Button
                            type="button"
                            variant={field.value === 3 ? "default" : "outline"}
                            onClick={() => {
                              field.onChange(3);
                              mealForm.setValue("mealSlots", undefined);
                            }}
                            data-testid="button-meals-3"
                          >
                            3 Meals (Full Day)
                          </Button>
                        </div>
                        <FormDescription>
                          {field.value === 2 ? "Pick which 2 meals below" : "Breakfast, lunch, and dinner"}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {mealForm.watch("mealsPerDay") === 2 && (
                    <FormField
                      control={mealForm.control}
                      name="mealSlots"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Which 2 meals? (pick exactly 2)</FormLabel>
                          <div className="flex gap-4 mt-2">
                            {(["breakfast", "lunch", "dinner"] as const).map((slot) => {
                              const checked = (field.value || []).includes(slot);
                              return (
                                <label key={slot} className="flex items-center gap-2 text-sm cursor-pointer capitalize">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(isChecked) => {
                                      const current = field.value || [];
                                      if (isChecked) {
                                        if (current.length >= 2) return;
                                        field.onChange([...current, slot]);
                                      } else {
                                        field.onChange(current.filter((s: string) => s !== slot));
                                      }
                                    }}
                                    disabled={!checked && (field.value || []).length >= 2}
                                    data-testid={`checkbox-slot-${slot}`}
                                  />
                                  {slot}
                                </label>
                              );
                            })}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Home className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Cooking Preferences</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6 space-y-6">
                  <div>
                    <FormField
                      control={mealForm.control}
                      name="prepStyle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Prep Style</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-prep-style">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="cook_daily">Cook Daily</SelectItem>
                              <SelectItem value="batch_2day">Meal Prep (2-day)</SelectItem>
                              <SelectItem value="batch_3to4day">Meal Prep (3-4 day)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="border-t pt-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <FormField
                        control={mealForm.control}
                        name="budgetMode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Budget</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-budget">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="normal">Normal</SelectItem>
                                <SelectItem value="budget_friendly">Budget Friendly</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={mealForm.control}
                        name="cookingTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cooking Time</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-cooking-time">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="quick">Quick (under 30 min)</SelectItem>
                                <SelectItem value="normal">Normal</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <FormField
                        control={mealForm.control}
                        name="spiceLevel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Spice Level</FormLabel>
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {([
                                { value: "none", label: "None" },
                                { value: "mild", label: "Mild" },
                                { value: "medium", label: "Medium" },
                                { value: "hot", label: "Hot" },
                              ] as const).map(opt => (
                                <Button
                                  key={opt.value}
                                  type="button"
                                  variant={field.value === opt.value ? "default" : "outline"}
                                  onClick={() => field.onChange(opt.value)}
                                  data-testid={`button-spice-${opt.value}`}
                                >
                                  {opt.label}
                                </Button>
                              ))}
                            </div>
                            <FormDescription>Applied independently of cuisine choice</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={mealForm.control}
                        name="authenticityMode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Recipe Style</FormLabel>
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {([
                                { value: "traditional", label: "Traditional" },
                                { value: "weeknight", label: "Weeknight Easy" },
                                { value: "mixed", label: "Mixed" },
                              ] as const).map(opt => (
                                <Button
                                  key={opt.value}
                                  type="button"
                                  variant={field.value === opt.value ? "default" : "outline"}
                                  onClick={() => field.onChange(opt.value)}
                                  data-testid={`button-authenticity-${opt.value}`}
                                >
                                  {opt.label}
                                </Button>
                              ))}
                            </div>
                            <FormDescription>Traditional uses authentic methods; Weeknight keeps it simple</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      data-testid="button-toggle-advanced-wizard"
                    >
                      {showAdvanced ? "Hide" : "Show"} advanced options
                    </Button>
                    {showAdvanced && (
                      <div className="mt-4">
                        <FormField
                          control={mealForm.control}
                          name="householdSize"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Household Size</FormLabel>
                              <FormControl>
                                <div className="flex items-center gap-3">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={8}
                                    className="w-24"
                                    data-testid="input-household-size-wizard"
                                    value={field.value}
                                    onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                  />
                                  <span className="text-sm text-muted-foreground">
                                    {field.value === 1 ? "person" : "people"}
                                  </span>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>
        </Form>
      )}

      {step === 3 && (
        <Form {...workoutForm}>
          <div className="space-y-8">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Training Preferences</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6 space-y-6">
                  <FormField
                    control={workoutForm.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Workout Location</FormLabel>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(val);
                            workoutForm.setValue("equipmentAvailable", getPreselectForLocation(val));
                          }}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-location">
                              <SelectValue placeholder="Select location" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {LOCATION_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} data-testid={`option-location-${opt.value}`}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="mt-4">
                    <Label className="mb-2 block">Equipment Available</Label>
                    {EQUIPMENT_CATEGORIES.map((cat) => (
                      <div key={cat.category} className="mb-3">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{cat.category}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {cat.items.map((item) => {
                            const selected = ((workoutForm.watch("equipmentAvailable") as string[]) || []).includes(item);
                            return (
                              <Badge
                                key={item}
                                variant={selected ? "default" : "outline"}
                                className="cursor-pointer select-none text-xs"
                                onClick={() => {
                                  const current = (workoutForm.getValues("equipmentAvailable") as string[]) || [];
                                  workoutForm.setValue("equipmentAvailable", selected ? current.filter(e => e !== item) : [...current, item]);
                                }}
                                data-testid={`chip-equip-${item.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                              >
                                {item}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <FormField
                        control={workoutForm.control}
                        name="trainingMode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Training Mode</FormLabel>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {TRAINING_MODE_OPTIONS.map((opt) => (
                                <Badge
                                  key={opt.value}
                                  className={`cursor-pointer toggle-elevate ${field.value === opt.value ? "toggle-elevated" : ""}`}
                                  variant={field.value === opt.value ? "default" : "outline"}
                                  onClick={() => {
                                    field.onChange(opt.value);
                                    const currentFocus = workoutForm.getValues("focusAreas") || [];
                                    const nextAreas = opt.value === "strength" ? STRENGTH_FOCUS_AREAS
                                      : opt.value === "cardio" ? CARDIO_FOCUS_AREAS
                                      : ALL_FOCUS_AREAS;
                                    const filtered = currentFocus.filter((a: string) => nextAreas.includes(a));
                                    workoutForm.setValue("focusAreas", filtered.length > 0 ? filtered : ["Full Body"]);
                                  }}
                                  data-testid={`badge-mode-${opt.value}`}
                                >
                                  {opt.label}
                                </Badge>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={workoutForm.control}
                        name="experienceLevel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Experience Level</FormLabel>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {EXPERIENCE_OPTIONS.map((opt) => (
                                <Badge
                                  key={opt.value}
                                  className={`cursor-pointer toggle-elevate ${field.value === opt.value ? "toggle-elevated" : ""}`}
                                  variant={field.value === opt.value ? "default" : "outline"}
                                  onClick={() => field.onChange(opt.value)}
                                  data-testid={`badge-exp-${opt.value}`}
                                >
                                  {opt.label}
                                </Badge>
                              ))}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <FormField
                      control={workoutForm.control}
                      name="focusAreas"
                      render={({ field }) => {
                        const mode = workoutForm.watch("trainingMode");
                        const availableAreas = mode === "strength" ? STRENGTH_FOCUS_AREAS
                          : mode === "cardio" ? CARDIO_FOCUS_AREAS
                          : ALL_FOCUS_AREAS;
                        return (
                          <FormItem>
                            <FormLabel>Focus Areas</FormLabel>
                            <FormDescription>Select one or more areas</FormDescription>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {availableAreas.map((area) => {
                                const selected = (field.value || []).includes(area);
                                return (
                                  <Badge
                                    key={area}
                                    className={`cursor-pointer toggle-elevate ${selected ? "toggle-elevated" : ""}`}
                                    variant={selected ? "default" : "outline"}
                                    onClick={() => {
                                      const current = field.value || [];
                                      if (selected) {
                                        field.onChange(current.filter((a: string) => a !== area));
                                      } else {
                                        field.onChange([...current, area]);
                                      }
                                    }}
                                    data-testid={`badge-focus-${area.replace(/\s/g, "-")}`}
                                  >
                                    {area}
                                  </Badge>
                                );
                              })}
                            </div>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Schedule & Duration</h2>
              </div>
              <Card>
                <CardContent className="p-5 sm:p-6 space-y-6">
                  <FormField
                    control={workoutForm.control}
                    name="daysOfWeek"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Workout Days</FormLabel>
                        <FormDescription>Select which days you want to work out</FormDescription>
                        <div className="grid grid-cols-7 gap-1.5 mt-1">
                          {DAYS_OF_WEEK.map((day) => {
                            const selected = (field.value || []).includes(day);
                            return (
                              <Button
                                key={day}
                                type="button"
                                variant={selected ? "default" : "outline"}
                                size="sm"
                                className="text-xs"
                                onClick={() => {
                                  const current = field.value || [];
                                  if (selected) {
                                    field.onChange(current.filter((d: string) => d !== day));
                                  } else {
                                    field.onChange([...current, day]);
                                  }
                                }}
                                data-testid={`badge-day-${day}`}
                              >
                                {day}
                              </Button>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="border-t pt-6">
                    <FormField
                      control={workoutForm.control}
                      name="sessionLength"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Session Length</FormLabel>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {SESSION_LENGTHS.map((opt) => (
                              <Button
                                key={opt.value}
                                type="button"
                                variant={field.value === opt.value ? "default" : "outline"}
                                size="sm"
                                onClick={() => field.onChange(opt.value)}
                                data-testid={`badge-session-${opt.value}`}
                              >
                                {opt.label}
                              </Button>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="border-t pt-6">
                    <FormField
                      control={workoutForm.control}
                      name="limitations"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Injuries, Limitations & Conditions (optional)</FormLabel>
                          <FormDescription>Any conditions the AI should account for</FormDescription>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="e.g. bad knees, lower back pain, recovering from shoulder surgery..."
                              className="resize-none text-sm"
                              rows={3}
                              data-testid="input-limitations"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>
        </Form>
      )}

      {step === 4 && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-5 sm:p-6">
              <h3 className="font-semibold text-base mb-4" data-testid="text-review-goal">Goal Overview</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Goal</span>
                  <span className="font-medium" data-testid="text-review-goal-type">{goalLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan Type</span>
                  <span className="font-medium" data-testid="text-review-plan-type">
                    {PLAN_TYPE_OPTIONS.find(p => p.value === planType)?.label}
                  </span>
                </div>
                {startDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date Range</span>
                    <span className="font-medium" data-testid="text-review-dates">
                      {formatStartDate(startDate)} - {formatEndDate(startDate)}
                    </span>
                  </div>
                )}
                {pace && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pace</span>
                    <span className="font-medium capitalize" data-testid="text-review-pace">{pace}</span>
                  </div>
                )}
                {mealForm.getValues("age") && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Age</span>
                    <span className="font-medium" data-testid="text-review-age">{mealForm.getValues("age")}</span>
                  </div>
                )}
                {mealForm.getValues("currentWeight") && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Weight</span>
                    <span className="font-medium" data-testid="text-review-current-weight">
                      {mealForm.getValues("currentWeight")} {mealForm.getValues("weightUnit")}
                    </span>
                  </div>
                )}
                {mealForm.getValues("targetWeight") && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Target Weight</span>
                    <span className="font-medium" data-testid="text-review-target-weight">
                      {mealForm.getValues("targetWeight")} {mealForm.getValues("weightUnit")}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {includeMeal && (
            <Card>
              <CardContent className="p-5 sm:p-6">
                <h3 className="font-semibold text-base mb-4" data-testid="text-review-nutrition">Nutrition Highlights</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Meals / Day</span>
                    <span className="font-medium" data-testid="text-review-meals-per-day">{mealForm.getValues("mealsPerDay")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Diet Styles</span>
                    <span className="font-medium text-right max-w-[60%]" data-testid="text-review-diet-styles">
                      {(mealForm.getValues("dietStyles") || []).join(", ")}
                    </span>
                  </div>
                  {(mealForm.getValues("foodsToAvoid") || []).length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Foods to Avoid</span>
                      <span className="font-medium text-right max-w-[60%]" data-testid="text-review-foods-avoid">
                        {(mealForm.getValues("foodsToAvoid") || []).join(", ")}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Spice Level</span>
                    <span className="font-medium capitalize" data-testid="text-review-spice">{mealForm.getValues("spiceLevel")}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {includeWorkout && (
            <Card>
              <CardContent className="p-5 sm:p-6">
                <h3 className="font-semibold text-base mb-4" data-testid="text-review-training">Training Highlights</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span className="font-medium" data-testid="text-review-location">
                      {LOCATION_OPTIONS.find(l => l.value === workoutForm.getValues("location"))?.label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Workout Days</span>
                    <span className="font-medium" data-testid="text-review-days">
                      {(workoutForm.getValues("daysOfWeek") || []).join(", ")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Training Mode</span>
                    <span className="font-medium capitalize" data-testid="text-review-mode">
                      {TRAINING_MODE_OPTIONS.find(m => m.value === workoutForm.getValues("trainingMode"))?.label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Session Length</span>
                    <span className="font-medium" data-testid="text-review-session">
                      {SESSION_LENGTHS.find(s => s.value === workoutForm.getValues("sessionLength"))?.label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Focus Areas</span>
                    <span className="font-medium text-right max-w-[60%]" data-testid="text-review-focus">
                      {(workoutForm.getValues("focusAreas") || []).join(", ")}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-8">
        {step > 1 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            disabled={isPending}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
        ) : (
          <div />
        )}

        {step === 4 ? (
          <Button
            type="button"
            size="lg"
            onClick={handleSubmit}
            disabled={isPending}
            data-testid="button-build-plan"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Building...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Build My Plan
              </>
            )}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleNext}
            data-testid="button-next"
          >
            Next
            <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
