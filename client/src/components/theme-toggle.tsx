import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleTheme}
          data-testid="button-theme-toggle"
        >
          <Sun className={`h-4 w-4 transition-all duration-200 ${isDark ? "scale-0 rotate-90 absolute" : "scale-100 rotate-0"}`} />
          <Moon className={`h-4 w-4 transition-all duration-200 ${isDark ? "scale-100 rotate-0" : "scale-0 -rotate-90 absolute"}`} />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      </TooltipContent>
    </Tooltip>
  );
}
