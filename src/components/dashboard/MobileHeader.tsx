import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LogOut, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProfileAvatarMenu } from "@/components/dashboard/ProfileAvatarMenu";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
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

  // Same key/select as warden.profile.index.tsx's "warden-profile" query — reuses its cache.
  const wardenProfileQ = useQuery({
    queryKey: ["warden-profile", userId],
    enabled: isWarden && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const wardenInitial = wardenProfileQ.data?.full_name?.trim().charAt(0).toUpperCase() ?? "?";

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
  const studentInitial = studentProfileQ.data?.full_name?.trim().charAt(0).toUpperCase() ?? "?";

  const guardianProfileQ = useQuery({
    queryKey: ["my-guardian-name", userId],
    enabled: isParent && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guardians")
        .select("full_name")
        .eq("profile_id", userId!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const guardianInitial = guardianProfileQ.data?.full_name?.trim().charAt(0).toUpperCase() ?? "?";

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/80 bg-background/90 px-4 backdrop-blur-md">
      <Link to="/" className="flex items-center gap-2">
        <BrandLockup variant="lockup" className="h-7" />
      </Link>
      <div className="flex items-center gap-1">
        {isWarden && <MessagesPanel />}
        {isWarden && <ThemeToggle />}
        <NotificationBell />
        {isParent && (
          <Button variant="ghost" size="icon" className="min-h-10 min-w-10" asChild>
            <Link to="/parent/messages" aria-label="Messages">
              <MessageSquare className="h-4 w-4" />
            </Link>
          </Button>
        )}
        {!isStudent && !isParent && !isWarden && <LanguageSwitcher />}
        {isWarden || isParent || isStudent ? (
          <ProfileAvatarMenu
            avatarInitial={isWarden ? wardenInitial : isParent ? guardianInitial : studentInitial}
            profileHref={
              isWarden ? "/warden/profile" : isParent ? "/parent/profile" : "/student/profile"
            }
            onSignOut={() => setSignOutOpen(true)}
            triggerClassName="h-8 w-8"
          />
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
