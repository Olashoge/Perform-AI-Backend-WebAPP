import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { SidebarProvider } from "@/components/ui/sidebar";
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
import GoalGenerating from "@/pages/goal-generating";
import CheckIns from "@/pages/check-ins";
import Dashboard from "@/pages/dashboard";
import SettingsPage from "@/pages/settings";
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
      <Route path="/calendar" component={PlanCalendar} />
      <Route path="/workouts/new" component={NewWorkout} />
      <Route path="/workout/:id/generating" component={WorkoutGenerating} />
      <Route path="/workout/:id" component={WorkoutView} />
      <Route path="/goals" component={GoalPlans} />
      <Route path="/goals/:id/generating" component={GoalGenerating} />
      <Route path="/check-ins" component={CheckIns} />
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
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <ActiveGoalBar />
          <main className="flex-1 overflow-auto">
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <AppRouter />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
