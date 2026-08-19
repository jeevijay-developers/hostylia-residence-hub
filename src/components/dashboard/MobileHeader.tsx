import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { BrandLockup } from "@/components/BrandLockup";
import { SignOutDialog } from "@/components/dashboard/SignOutDialog";
import { MessagesPanel } from "@/components/warden/MessagesPanel";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";

export function MobileHeader() {
  const { data: resolved } = useResolvedRole();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const isWarden = resolved?.role === "WARDEN";
  const isParent = resolved?.role === "PARENT";
  const isStudent = resolved?.role === "STUDENT";
  const userId = resolved?.userId ?? null;

  // Same key/select as student.profile.tsx's "my-profile-record" query — reuses its cache.
  const studentProfileQ = useQuery({
    queryKey: ["my-profile-record", userId],
    enabled: isStudent && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, tenant_id, property_id, admission_number, status, full_name, phone, email, date_of_birth, gender, academic_institute, course_name, academic_year",
        )
        .eq("profile_id", userId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const studentInitial =
    studentProfileQ.data?.full_name?.trim().charAt(0).toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
      <Link to="/" className="flex items-center gap-2">
        <BrandLockup variant="lockup" className="h-7" />
      </Link>
      <div className="flex items-center gap-1">
        {isWarden && <MessagesPanel />}
        <NotificationBell />
        {!isStudent && <LanguageSwitcher />}
        {isWarden ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="min-h-10">
                <User className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/warden/profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setSignOutOpen(true);
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : isParent ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="min-h-10">
                <User className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/parent/profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setSignOutOpen(true);
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : isStudent ? (
          <Link
            to="/student/profile"
            aria-label="Profile"
            className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary ring-2 ring-primary/40"
          >
            {studentInitial}
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-success" />
          </Link>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="min-h-10"
            onClick={() => setSignOutOpen(true)}
          >
            <LogOut className="mr-1.5 h-4 w-4" />
            Logout
          </Button>
        )}
      </div>
      <SignOutDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title={isParent || isStudent ? "Logout?" : undefined}
        confirmLabel={isParent || isStudent ? "Logout" : undefined}
      />
    </header>
  );
}
