import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { GoalPlan } from "@shared/schema";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard, CalendarDays, UtensilsCrossed, Dumbbell, Target, Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { title: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { title: "Calendar", icon: CalendarDays, href: "/calendar" },
  { title: "Nutrition", icon: UtensilsCrossed, href: "/nutrition" },
  { title: "Training", icon: Dumbbell, href: "/training" },
  { title: "Goals", icon: Target, href: "/goals" },
  { title: "Settings", icon: Settings, href: "/settings" },
];

export function AppSidebar() {
  const [location, navigate] = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  function handleNav(href: string) {
    navigate(href);
    if (isMobile) setOpenMobile(false);
  }

  return (
    <Sidebar collapsible="icon" data-testid="app-sidebar">
      <SidebarHeader className="flex items-center justify-center py-4">
        <div
          className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center cursor-pointer"
          onClick={() => handleNav("/dashboard")}
          data-testid="link-logo"
        >
          <span className="text-primary-foreground font-bold text-sm">P</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu className="gap-2 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.href ||
              (item.href === "/nutrition" && location === "/plans") ||
              (item.href === "/nutrition" && location.startsWith("/plan/")) ||
              (item.href === "/nutrition" && location === "/new-plan") ||
              (item.href === "/training" && location.startsWith("/workout")) ||
              (item.href === "/training" && location === "/workouts/new") ||
              (item.href === "/settings" && location === "/preferences") ||
              (item.href === "/settings" && location === "/check-ins");
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  isActive={isActive}
                  tooltip={item.title}
                  onClick={() => handleNav(item.href)}
                  data-testid={`nav-${item.title.toLowerCase()}`}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}

export function ActiveGoalBar() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: goalPlans } = useQuery<GoalPlan[]>({
    queryKey: ["/api/goal-plans"],
    enabled: !!user,
  });

  const activeGoal = goalPlans?.find(g => !g.deletedAt);

  const GOAL_LABELS: Record<string, string> = {
    weight_loss: "Weight Loss",
    muscle_gain: "Muscle Gain",
    performance: "Performance",
    maintenance: "Maintenance",
    energy: "Energy & Focus",
    general_fitness: "General Fitness",
  };

  if (!activeGoal) return null;

  return (
    <div className="h-12 border-b bg-background flex items-center justify-between px-3 sm:px-6 shrink-0 overflow-hidden" data-testid="active-goal-bar">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">Active Goal</span>
        <span className="text-sm font-semibold truncate">{GOAL_LABELS[activeGoal.goalType] || activeGoal.goalType}</span>
        {activeGoal.startDate && (
          <span className="text-xs text-muted-foreground hidden sm:inline shrink-0">
            Target: {new Date(activeGoal.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        )}
      </div>
      <span
        className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
        onClick={() => navigate("/goals")}
        data-testid="link-view-progress"
      >
        View Progress
      </span>
    </div>
  );
}
