import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, LogOut, Loader2, Mail, Phone, Save, User } from "lucide-react";

import { SignOutDialog } from "@/components/dashboard/SignOutDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { profileUpdateSchema } from "@/schemas/profile";
import { fetchOwnProfile } from "@/components/dashboard/EditProfileDialog";

export const Route = createFileRoute("/_authenticated/admin/profile")({
  head: () => ({ meta: [{ title: "My Profile — Hostylia" }] }),
  component: AdminProfilePage,
});

function AdminProfilePage() {
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["own-profile"],
    queryFn: fetchOwnProfile,
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setAvatarPath(profile.avatar_path ?? null);
      setErrors({});
    }
  }, [profile]);

  // Same storage bucket/path convention and update flow as the Warden's
  // "Change photo" (see warden.profile.edit.tsx) — persists immediately on
  // upload rather than waiting for "Save changes".
  async function handleAvatarUpload(file: File) {
    if (!profile) return;
    setUploadingAvatar(true);
    try {
      const path = `${profile.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_path: path })
        .eq("id", profile.id);
      if (updateError) throw updateError;
      setAvatarPath(path);
      qc.invalidateQueries({ queryKey: ["own-profile"] });
      toast.success("Photo updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload photo");
    } finally {
      setUploadingAvatar(false);
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const parsed = profileUpdateSchema.parse({ fullName, phone });
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: parsed.fullName,
          phone: parsed.phone || null,
        })
        .eq("id", profile!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["own-profile"] });
      setErrors({});
    },
    onError: (e: unknown) => {
      const err = e as {
        issues?: { path: (string | number)[]; message: string }[];
        message?: string;
      };
      if (err?.issues) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of err.issues) fieldErrors[String(issue.path[0])] = issue.message;
        setErrors(fieldErrors);
        return;
      }
      toast.error(err?.message ?? "Failed to update profile");
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  const initial = (profile?.full_name ?? "").trim()[0]?.toUpperCase() ?? "?";
  const avatarUrl = avatarPath
    ? supabase.storage.from("avatars").getPublicUrl(avatarPath).data.publicUrl
    : undefined;

  return (
    <div className="flex max-w-4xl flex-col gap-4 pb-6">
      <Card className="overflow-hidden rounded-2xl border-border/80 py-0 shadow-card-ambient">
        <CardContent className="relative flex items-center gap-4 p-5 sm:gap-5 sm:p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleAvatarUpload(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            aria-label="Change profile photo"
            title="Change profile photo"
            className="group relative h-16 w-16 shrink-0 cursor-pointer rounded-full sm:h-20 sm:w-20"
          >
            <Avatar className="h-16 w-16 ring-2 ring-primary/30 sm:h-20 sm:w-20">
              <AvatarImage src={avatarUrl} alt={profile?.full_name ?? "Profile photo"} />
              <AvatarFallback className="bg-primary/15 text-xl font-bold text-primary sm:text-2xl">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              {uploadingAvatar ? (
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              ) : (
                <Camera className="h-5 w-5 text-white" />
              )}
            </span>
            <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-card bg-success sm:h-3.5 sm:w-3.5" />
          </button>
          <div className="relative min-w-0">
            <p className="truncate text-lg font-bold text-foreground sm:text-xl">
              {profile?.full_name ?? "—"}
            </p>
            <p className="text-sm font-medium text-muted-foreground">Hostel Admin</p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
        <CardHeader className="flex-row items-center gap-3 space-y-0 px-5 pt-5 sm:px-6">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <User className="h-4 w-4" aria-hidden="true" />
          </span>
          <CardTitle className="text-base">Contact & Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-4 gap-y-4 px-5 pb-5 pt-4 sm:grid-cols-3 sm:px-6 sm:pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="profile-full-name" className="text-xs text-muted-foreground">
              Full name
            </Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="profile-full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="rounded-xl bg-background pl-9"
              />
            </div>
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-phone" className="text-xs text-muted-foreground">
              Phone
            </Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone"
                className="rounded-xl bg-background pl-9"
              />
            </div>
            {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email" className="text-xs text-muted-foreground">
              Email
            </Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="profile-email"
                value={profile?.email ?? ""}
                disabled
                className="rounded-xl bg-background pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          onClick={() => save.mutate()}
          disabled={!profile || save.isPending}
          className="rounded-full border border-amber-500/90 bg-amber-500/10 px-5 py-2.5 font-bold text-amber-700 shadow-sm shadow-amber-500/10 transition-all hover:bg-amber-500/20 dark:text-amber-400"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setSignOutOpen(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>

      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </div>
  );
}
