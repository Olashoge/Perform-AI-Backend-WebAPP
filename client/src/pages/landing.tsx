import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UtensilsCrossed, CalendarDays, ShoppingCart, Sparkles, ChefHat, Clock } from "lucide-react";

export default function Landing() {
  const { user } = useAuth();

  const features = [
    {
      icon: Sparkles,
      title: "AI-Powered Plans",
      description: "Get personalized 7-day meal plans tailored to your goals, diet, and lifestyle using advanced AI.",
    },
    {
      icon: CalendarDays,
      title: "Weekly Organization",
      description: "View your entire week at a glance with breakfast, lunch, and dinner planned for every day.",
    },
    {
      icon: ShoppingCart,
      title: "Smart Grocery Lists",
      description: "Auto-generated, organized grocery lists grouped by section for efficient shopping trips.",
    },
    {
      icon: ChefHat,
      title: "Step-by-Step Recipes",
      description: "Detailed cooking instructions for every meal with ingredients, nutrition info, and tips.",
    },
    {
      icon: UtensilsCrossed,
      title: "Flexible Swaps",
      description: "Not loving a meal? Swap individual meals or regenerate entire days to keep things fresh.",
    },
    {
      icon: Clock,
      title: "Time-Aware Cooking",
      description: "Choose quick or normal prep times. Batch cooking options for busy schedules.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <UtensilsCrossed className="h-5 w-5 text-primary" />
              <span className="font-semibold text-lg">MealPlan AI</span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link href="/new-plan">
                  <Button data-testid="button-new-plan">Create Plan</Button>
                </Link>
                <Link href="/plans">
                  <Button variant="outline" data-testid="button-my-plans">My Plans</Button>
                </Link>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" data-testid="button-login-nav">Log in</Button>
                </Link>
                <Link href="/signup">
                  <Button data-testid="button-signup-nav">Sign up</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1 text-sm text-primary mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            Powered by AI
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Your Personal
            <span className="text-primary"> Meal Planner</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
            Tell us your goals, dietary preferences, and schedule. We'll create a complete 7-day meal plan with recipes, nutrition info, and a ready-to-use grocery list.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {user ? (
              <Link href="/new-plan">
                <Button size="lg" data-testid="button-get-started">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Create New Plan
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/signup">
                  <Button size="lg" data-testid="button-get-started">
                    Get Started Free
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" size="lg" data-testid="button-login-hero">
                    Log in
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="py-16 px-4 bg-card/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold text-center mb-10">
            Everything you need for meal planning
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => (
              <Card key={f.title} className="hover-elevate">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md bg-primary/10 p-2 shrink-0">
                      <f.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium mb-1">{f.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-semibold mb-3">How it works</h2>
          <p className="text-muted-foreground mb-10">Three simple steps to your personalized meal plan</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Set Preferences", desc: "Choose your goal, diet style, household size, and cooking preferences." },
              { step: "2", title: "Generate Plan", desc: "AI creates a 7-day meal plan with recipes, nutrition info, and grocery list." },
              { step: "3", title: "Cook & Enjoy", desc: "Follow step-by-step instructions. Swap meals anytime you want." },
            ].map((s) => (
              <div key={s.step} className="flex flex-col items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-semibold text-lg">
                  {s.step}
                </div>
                <h3 className="font-medium">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t py-8 px-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <UtensilsCrossed className="h-4 w-4" />
            MealPlan AI
          </div>
          <p className="text-xs text-muted-foreground">AI-generated meal plans. Always consult a nutritionist for medical dietary needs.</p>
        </div>
      </footer>
    </div>
  );
}
