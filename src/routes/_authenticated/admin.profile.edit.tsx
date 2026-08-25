import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2, Save } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { profileUpdateSchema } from "@/schemas/profile";

export const Route = createFileRoute("/_authenticated/admin/profile/edit")({
  head: () => ({ meta: [{ title: "Edit Profile — Hostylia" }] }),
  component: AdminProfileEditPage,
});

function AdminProfileEditPage() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const profileQ = useQuery({
    queryKey: ["admin-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, email, avatar_path")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    const p = profileQ.data;
    if (!p) return;
    setFullName(p.full_name ?? "");
    setPhone(p.phone ?? "");
    setAvatarPath(p.avatar_path);
  }, [profileQ.data]);

  async function handleAvatarUpload(file: File) {
    if (!userId) return;
    setUploading(true);
    try {
      const path = `${userId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      setAvatarPath(path);
      toast.success("Photo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload photo");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemovePhoto() {
    setAvatarPath(null);
  }

  const save = useMutation({
    mutationFn: async () => {
      const parsed = profileUpdateSchema.safeParse({ fullName, phone });
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          fieldErrors[String(issue.path[0])] = issue.message;
        }
        setErrors(fieldErrors);
        throw new Error("Please fix the highlighted fields");
      }
      setErrors({});
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: parsed.data.fullName,
          phone: parsed.data.phone || null,
          avatar_path: avatarPath,
        })
        .eq("id", userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated successfully");
      qc.invalidateQueries({ queryKey: ["admin-profile", userId] });
      qc.invalidateQueries({ queryKey: ["own-profile"] });
      navigate({ to: "/admin/profile" });
    },
    onError: (e) => {
      if (e instanceof Error && e.message !== "Please fix the highlighted fields") {
        toast.error(e.message);
      }
    },
  });

  if (profileQ.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const initial = fullName.trim()[0]?.toUpperCase() ?? "A";
  const avatarUrl = avatarPath
    ? supabase.storage.from("avatars").getPublicUrl(avatarPath).data.publicUrl
    : undefined;

  return (
    <div className="flex h-full flex-col gap-3">
      <Card className="gap-3 py-4">
        <CardContent className="flex items-center gap-4 px-4">
          <Avatar className="h-16 w-16 ring-2 ring-neutral-accent/20 ring-offset-2 ring-offset-card">
            <AvatarImage src={avatarUrl} alt={fullName} />
            <AvatarFallback className="bg-neutral-accent/15 text-lg text-neutral-accent">
              {initial}
            </AvatarFallback>
          </Avatar>
          <div className="flex gap-2">
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {avatarPath ? "Change photo" : "Add photo"}
            </Button>
            {avatarPath && (
              <Button type="button" variant="ghost" size="sm" onClick={handleRemovePhoto}>
                Remove
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Account details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-3 gap-y-3 px-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="a-name" className="text-xs">
              Full Name
            </Label>
            <Input id="a-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            {errors.fullName ? <p className="text-xs text-destructive">{errors.fullName}</p> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="a-phone" className="text-xs">
              Phone
            </Label>
            <Input id="a-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            {errors.phone ? <p className="text-xs text-destructive">{errors.phone}</p> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="a-email" className="text-xs">
              Email
            </Label>
            <Input id="a-email" value={profileQ.data?.email ?? ""} disabled />
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
