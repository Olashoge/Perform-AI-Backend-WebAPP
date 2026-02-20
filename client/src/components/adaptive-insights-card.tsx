import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, TrendingUp, TrendingDown, Shield, Minus, Zap, Info } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import type { AdaptiveSnapshot, AdaptiveModifiers } from "@shared/schema";

interface AdaptiveInsightsCardProps {
  snapshot: AdaptiveSnapshot;
  planType: "meal" | "workout" | "both";
}

function getModifierBadges(modifiers: AdaptiveModifiers, planType: string) {
  const badges: { label: string; variant: "default" | "secondary" | "outline"; icon: typeof TrendingUp }[] = [];

  if (modifiers.deloadWeek) {
    badges.push({ label: "Recovery Week", variant: "secondary", icon: Shield });
  }

  if (modifiers.volumeMultiplier < 0.95) {
    badges.push({ label: "Reduced Volume", variant: "secondary", icon: TrendingDown });
  } else if (modifiers.volumeMultiplier > 1.05) {
    badges.push({ label: "Increased Volume", variant: "default", icon: TrendingUp });
  }

  if (modifiers.complexityLevel === "simple") {
    badges.push({ label: "Simplified", variant: "secondary", icon: Minus });
  } else if (modifiers.complexityLevel === "advanced") {
    badges.push({ label: "Advanced", variant: "default", icon: Zap });
  }

  if (planType !== "workout" && modifiers.nutritionCalorieDeltaKcal !== 0) {
    const dir = modifiers.nutritionCalorieDeltaKcal > 0 ? "+" : "";
    badges.push({
      label: `${dir}${modifiers.nutritionCalorieDeltaKcal} kcal`,
      variant: modifiers.nutritionCalorieDeltaKcal > 0 ? "default" : "secondary",
      icon: modifiers.nutritionCalorieDeltaKcal > 0 ? TrendingUp : TrendingDown,
    });
  }

  if (modifiers.recoveryBias === "higher") {
    badges.push({ label: "Recovery Focus", variant: "secondary", icon: Shield });
  }

  return badges;
}

export function AdaptiveInsightsCard({ snapshot, planType }: AdaptiveInsightsCardProps) {
  const [open, setOpen] = useState(false);
  const { modifiers, decisions } = snapshot;

  const isBaseline = decisions.length === 0 || (decisions.length === 1 && decisions[0].code === "BASELINE");
  const badges = getModifierBadges(modifiers, planType);

  return (
    <Card className="border-border/60" data-testid="adaptive-insights-card">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full text-left" data-testid="adaptive-insights-toggle">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Why this plan looks like this</span>
              {!isBaseline && badges.length > 0 && (
                <div className="flex gap-1.5 ml-auto mr-2 flex-wrap">
                  {badges.slice(0, 3).map((b, i) => (
                    <Badge key={i} variant={b.variant} size="sm" data-testid={`badge-modifier-${i}`}>
                      <b.icon className="h-3 w-3 mr-1" />
                      {b.label}
                    </Badge>
                  ))}
                </div>
              )}
              {isBaseline && (
                <span className="text-xs text-muted-foreground ml-auto mr-2">Baseline</span>
              )}
              <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 px-4 pb-4">
            <div className="space-y-3">
              {decisions.length > 0 && decisions[0].code !== "BASELINE" ? (
                <ul className="space-y-1.5" data-testid="adaptive-decisions-list">
                  {decisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${d.severity === "adjust" ? "bg-amber-500" : "bg-emerald-500"}`} />
                      {d.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground" data-testid="adaptive-baseline-message">
                  This plan is based on your profile and goals. As you log check-ins and provide feedback, future plans will adapt automatically.
                </p>
              )}

              {!isBaseline && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {badges.map((b, i) => (
                    <Badge key={i} variant={b.variant} size="sm" data-testid={`badge-expanded-${i}`}>
                      <b.icon className="h-3 w-3 mr-1" />
                      {b.label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
