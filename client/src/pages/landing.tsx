import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sparkles, CalendarDays, ShoppingCart, Dumbbell, TrendingUp, Zap, Zap as ZapIcon } from "lucide-react";

export default function Landing() {
  const { user } = useAuth();

  const features = [
    {
      icon: Sparkles,
      title: "AI-Powered Plans",
      description: "Get personalized meal and workout plans tailored to your goals and lifestyle using advanced AI.",
      accentClass: "text-meal-accent",
      bgClass: "bg-meal-accent-bg",
    },
    {
      icon: CalendarDays,
      title: "Weekly Organization",
      description: "View your entire week at a glance with meals and workouts planned for every day.",
      accentClass: "text-primary",
      bgClass: "bg-primary/10",
    },
    {
      icon: ShoppingCart,
      title: "Smart Grocery Lists",
      description: "Auto-generated, organized grocery lists grouped by section for efficient shopping trips.",
      accentClass: "text-meal-accent",
      bgClass: "bg-meal-accent-bg",
    },
    {
      icon: Dumbbell,
      title: "Workout Programs",
      description: "Structured workout routines designed to complement your nutrition and match your fitness level.",
      accentClass: "text-workout-accent",
      bgClass: "bg-workout-accent-bg",
    },
    {
      icon: TrendingUp,
      title: "Progress Tracking",
      description: "Monitor your performance metrics and see how meals and workouts impact your results.",
      accentClass: "text-workout-accent",
      bgClass: "bg-workout-accent-bg",
    },
    {
      icon: Zap,
      title: "Smart Adaptation",
      description: "Plans automatically adjust based on your feedback, preferences, and performance data.",
      accentClass: "text-primary",
      bgClass: "bg-primary/10",
    },
  ];

  const steps = [
    { step: "1", title: "Set Preferences", desc: "Define your goals, dietary preferences, fitness level, and schedule." },
    { step: "2", title: "Generate Plans", desc: "AI creates personalized meal and workout plans tailored to you." },
    { step: "3", title: "Execute", desc: "Follow your daily plans with clear instructions and flexible options." },
    { step: "4", title: "Track Progress", desc: "Monitor your performance and let AI adapt your plans over time." },
  ];

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold text-lg">Perform AI</span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <Link href="/dashboard">
                <Button data-testid="button-go-dashboard">Dashboard</Button>
              </Link>
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

      <section className="py-24 md:py-32 px-4 relative">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full -mr-48 -mt-48" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary/5 rounded-full -ml-40 -mb-40" />
        </div>
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-3 py-1.5 text-sm font-medium text-primary mb-6 border border-primary/10">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Powered by AI</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Your Personal<br />
            <span className="text-primary">Performance System</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            AI-powered meal planning and workout programming designed to work together. Get personalized nutrition and fitness plans tailored to your goals, all in one unified system.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {user ? (
              <Link href="/dashboard">
                <Button size="lg" data-testid="button-get-started">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Go to Dashboard
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

      <section className="py-20 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Everything you need to perform
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Unified meal and workout planning with seamless integration and intelligent adaptation.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <Card key={f.title} className="hover-elevate border-0 bg-background">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className={`rounded-md ${f.bgClass} p-2.5 shrink-0`}>
                      <f.icon className={`h-5 w-5 ${f.accentClass}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2 text-base">{f.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">How it works</h2>
          <p className="text-lg text-muted-foreground mb-16 max-w-2xl mx-auto">
            Four simple steps to transform your performance through coordinated nutrition and fitness.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {steps.map((s, index) => (
              <div key={s.step} className="flex flex-col items-center gap-4 relative">
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-5 -right-4 w-8 h-0.5 bg-border" />
                )}
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary font-semibold text-lg border border-primary/20">
                  {s.step}
                </div>
                <div>
                  <h3 className="font-semibold text-base mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t py-12 px-4 bg-background/50">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold text-lg">Perform AI</span>
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Your unified performance operating system.
            </p>
          </div>
          <div className="border-t border-border pt-6">
            <p className="text-xs text-muted-foreground text-center">
              AI-generated plans. Always consult professionals for medical or specialized dietary and fitness needs.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
