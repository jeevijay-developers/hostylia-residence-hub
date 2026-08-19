import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { FormSkeleton } from "@/components/dashboard/FormSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { displayIndianPhone } from "@/schemas/auth";
import { guardianSelfEditSchema } from "@/schemas/guardian";

export const Route = createFileRoute("/_authenticated/parent/profile/edit")({
  head: () => ({ meta: [{ title: "Edit Profile — Hostylia" }] }),
  component: ParentProfileEditPage,
});

function ParentProfileEditPage() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const guardianQ = useQuery({
    queryKey: ["own-guardian", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("guardians")
        .select("*")
        .eq("profile_id", userId!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const g = guardianQ.data;
    if (!g) return;
    setFullName(g.full_name ?? "");
    setEmail(g.email ?? "");
  }, [guardianQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!guardianQ.data) throw new Error("Profile not loaded");
      const parsed = guardianSelfEditSchema.safeParse({ fullName, email });
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          fieldErrors[String(issue.path[0])] = issue.message;
        }
        setErrors(fieldErrors);
        throw new Error("Please fix the highlighted fields");
      }
      setErrors({});
      const d = parsed.data;
      const { error } = await supabase
        .from("guardians")
        .update({
          full_name: d.fullName,
          email: d.email || null,
        })
        .eq("id", guardianQ.data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["own-guardian", userId] });
      navigate({ to: "/parent/profile" });
    },
    onError: (e) => {
      if (e instanceof Error && e.message !== "Please fix the highlighted fields") {
        toast.error(e.message);
      }
    },
  });

  if (guardianQ.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit Profile" description="Update your personal details" />
        <FormSkeleton fields={4} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader title="Edit Profile" description="Update your personal details" />

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Guardian details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-3 gap-y-3 px-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="p-name" className="text-xs">
              Full Name
            </Label>
            <Input
              id="p-name"
              className="h-9"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            {errors.fullName ? <p className="text-xs text-destructive">{errors.fullName}</p> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-phone" className="text-xs">
              Mobile Number
            </Label>
            <Input
              id="p-phone"
              className="h-9 bg-muted/50"
              value={guardianQ.data?.phone ? displayIndianPhone(guardianQ.data.phone) : ""}
              disabled
              readOnly
            />
            <p className="text-xs text-muted-foreground">
              Contact hostel staff to change your mobile number.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-email" className="text-xs">
              Email
            </Label>
            <Input
              id="p-email"
              type="email"
              className="h-9"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Button
        className="min-h-10 w-full sm:w-auto"
        disabled={save.isPending || !fullName.trim()}
        onClick={() => save.mutate()}
      >
        {save.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Save changes
      </Button>
    </div>
  );
}
