import { useState } from "react";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { SignOutDialog } from "./SignOutDialog";

interface SidebarSignOutProps {
  collapsed?: boolean;
}

export function SidebarSignOut({ collapsed }: SidebarSignOutProps) {
  const [signOutOpen, setSignOutOpen] = useState(false);

  return (
    <>
      <div className={cn("border-t border-border/80 p-3 shrink-0", collapsed && "px-2")}>
        <button
          type="button"
          onClick={() => setSignOutOpen(true)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
            "text-destructive hover:bg-destructive/10",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? "Sign Out" : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">Sign Out</span>}
        </button>
      </div>

      <SignOutDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Sign Out"
        confirmLabel="Sign Out"
      />
    </>
  );
}
