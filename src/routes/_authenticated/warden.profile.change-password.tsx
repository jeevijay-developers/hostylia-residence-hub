import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { supabase } from "@/integrations/supabase/client";
import { changePasswordSchema } from "@/schemas/auth";

export const Route = createFileRoute("/_authenticated/warden/profile/change-password")({
  head: () => ({ meta: [{ title: "Change Password — Hostylia" }] }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const changePassword = useMutation({
    mutationFn: async () => {
      const parsed = changePasswordSchema.safeParse({ currentPassword, password, confirmPassword });
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          fieldErrors[String(issue.path[0])] = issue.message;
        }
        setErrors(fieldErrors);
        throw new Error("Please fix the highlighted fields");
      }
      setErrors({});

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user?.email) {
        throw new Error("Could not verify your account. Please sign in again.");
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: parsed.data.currentPassword,
      });
      if (signInErr) {
        setErrors({ currentPassword: "Current password is incorrect" });
        throw new Error("Current password is incorrect");
      }

      const { error: updateErr } = await supabase.auth.updateUser({ password: parsed.data.password });
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      navigate({ to: "/warden/profile" });
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : "Could not change password";
      if (message !== "Please fix the highlighted fields") toast.error(message);
    },
  });

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader title="Change Password" description="Keep your account secure with a strong password" />

      <Card className="gap-3 py-4">
        <CardHeader className="px-4"><CardTitle className="text-sm">Update your password</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-y-3 px-4">
          <div className="space-y-1">
            <Label htmlFor="cp-current" className="text-xs">Current Password</Label>
            <PasswordInput
              id="cp-current"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            {errors.currentPassword ? <p className="text-xs text-destructive">{errors.currentPassword}</p> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="cp-new" className="text-xs">New Password</Label>
            <PasswordInput
              id="cp-new"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors.password ? <p className="text-xs text-destructive">{errors.password}</p> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="cp-confirm" className="text-xs">Confirm Password</Label>
            <PasswordInput
              id="cp-confirm"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {errors.confirmPassword ? <p className="text-xs text-destructive">{errors.confirmPassword}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Button
        className="min-h-10 w-full sm:w-auto"
        disabled={changePassword.isPending || !currentPassword || !password || !confirmPassword}
        onClick={() => changePassword.mutate()}
      >
        {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Change Password
      </Button>
    </div>
  );
}
