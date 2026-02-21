import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, ActiveGoalBar } from "@/components/app-sidebar";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Signup from "@/pages/signup";
import NewPlan from "@/pages/new-plan";
import PlanView from "@/pages/plan-view";
import PlanGenerating from "@/pages/plan-generating";
import PlansList from "@/pages/plans-list";
import PreferencesPage from "@/pages/preferences";
import PlanCalendar from "@/pages/plan-calendar";
import NewWorkout from "@/pages/new-workout";
import WorkoutView from "@/pages/workout-view";
import WorkoutGenerating from "@/pages/workout-generating";
import GoalPlans from "@/pages/goal-plans";
import GoalWizard from "@/pages/goal-wizard";
import GoalGenerating from "@/pages/goal-generating";
import GoalReady from "@/pages/goal-ready";
import CheckIns from "@/pages/check-ins";
import Dashboard from "@/pages/dashboard";
import SettingsPage from "@/pages/settings";
import ExercisePreferencesPage from "@/pages/exercise-preferences";
import ProfilePage from "@/pages/profile";
import DailyMealView from "@/pages/daily-meal-view";
import DailyWorkoutView from "@/pages/daily-workout-view";
import NotFound from "@/pages/not-found";

function AuthenticatedRouter() {
  return (
    <Switch>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/new-plan" component={NewPlan} />
      <Route path="/plan/:id/generating" component={PlanGenerating} />
      <Route path="/plan/:id" component={PlanView} />
      <Route path="/plans" component={PlansList} />
      <Route path="/nutrition" component={PlansList} />
      <Route path="/training" component={PlansList} />
      <Route path="/preferences" component={PreferencesPage} />
      <Route path="/preferences/exercise" component={ExercisePreferencesPage} />
      <Route path="/calendar" component={PlanCalendar} />
      <Route path="/workouts/new" component={NewWorkout} />
      <Route path="/workout/:id/generating" component={WorkoutGenerating} />
      <Route path="/workout/:id" component={WorkoutView} />
      <Route path="/goals" component={GoalPlans} />
      <Route path="/goals/new" component={GoalWizard} />
      <Route path="/goals/:id/generating" component={GoalGenerating} />
      <Route path="/goals/:id/ready" component={GoalReady} />
      <Route path="/check-ins" component={CheckIns} />
      <Route path="/daily-meal/:date" component={DailyMealView} />
      <Route path="/daily-workout/:date" component={DailyWorkoutView} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedLayout() {
  const sidebarStyle = {
    "--sidebar-width": "3.5rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties} defaultOpen={false}>
      <div className="flex h-dvh w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="h-12 border-b bg-background flex items-center gap-3 px-3 shrink-0" data-testid="mobile-header">
            <div className="md:hidden">
              <SidebarTrigger data-testid="button-mobile-menu" className="h-10 w-10 [&_svg]:size-5" />
            </div>
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xs">P</span>
            </div>
            <span className="text-sm font-semibold">Perform AI</span>
            <div className="flex-1" />
            <ThemeToggle />
          </header>
          <ActiveGoalBar />
          <main className="flex-1 overflow-auto min-h-0">
            <AuthenticatedRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppRouter() {
  const [location] = useLocation();
  const { user, isLoading } = useAuth();

  const publicRoutes = ["/", "/login", "/signup"];
  const isPublicRoute = publicRoutes.includes(location);

  if (isPublicRoute) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
      </Switch>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <AuthenticatedLayout />;
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <AppRouter />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
