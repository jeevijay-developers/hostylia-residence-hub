import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Droplet,
  FileText,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
  UserRoundPen,
  X,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { wardenProfileEditSchema } from "@/schemas/profile";
import { changePasswordSchema } from "@/schemas/auth";

export const Route = createFileRoute("/_authenticated/warden/profile/")({
  head: () => ({ meta: [{ title: "My Profile — Hostylia" }] }),
  component: WardenProfilePage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "view" | "edit";

interface WardenAssignment {
  id: string;
  employee_id: string | null;
  property_id: string | null;
  block_id: string | null;
  granted_at: string;
  is_active: boolean;
  property_name: string | null;
  block_name: string | null;
}

// ─── Shared sub-components ────────────────────────────────────────────────────

/** Read-only label + value row. */
function FieldRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" />
        {label}
      </p>
      <p className="text-sm font-medium text-foreground">{value ?? "—"}</p>
    </div>
  );
}

/** Labelled input wrapper for edit mode. */
function EditField({
  label,
  htmlFor,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <Label
        htmlFor={htmlFor}
        className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Card section header with toned icon circle. */
function SectionHeader({
  icon: Icon,
  title,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  tone: "info" | "primary" | "warning";
}) {
  const toneClass = {
    info: "bg-info/15 text-info",
    primary: "bg-primary/15 text-primary",
    warning: "bg-warning/15 text-warning",
  }[tone];
  return (
    <CardHeader className="flex-row items-center gap-2.5 space-y-0 px-5 pt-5">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${toneClass}`}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <CardTitle className="text-sm font-semibold">{title}</CardTitle>
    </CardHeader>
  );
}

// ─── Assignments data hook ────────────────────────────────────────────────────

function useWardenAssignments(userId: string | null) {
  return useQuery({
    queryKey: ["warden-assignments", userId],
    enabled: !!userId,
    queryFn: async (): Promise<WardenAssignment[]> => {
      const { data: assignments, error } = await supabase
        .from("role_assignments")
        .select("id, employee_id, property_id, block_id, granted_at, is_active, properties(name)")
        .eq("user_id", userId!)
        .eq("role", "WARDEN")
        .eq("is_active", true)
        .order("granted_at", { ascending: false });
      if (error) throw error;

      const blockIds = Array.from(
        new Set((assignments ?? []).map((a) => a.block_id).filter((v): v is string => !!v)),
      );
      const blockNames = new Map<string, string>();
      if (blockIds.length > 0) {
        const { data: blocks } = await supabase
          .from("blocks")
          .select("id, name")
          .in("id", blockIds);
        for (const b of blocks ?? []) blockNames.set(b.id, b.name);
      }

      return (assignments ?? []).map((a) => ({
        id: a.id,
        employee_id: a.employee_id,
        property_id: a.property_id,
        block_id: a.block_id,
        granted_at: a.granted_at,
        is_active: a.is_active,
        property_name: (a.properties as { name: string } | null)?.name ?? null,
        block_name: a.block_id ? (blockNames.get(a.block_id) ?? null) : null,
      }));
    },
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function WardenProfilePage() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Page state ──
  const [mode, setMode] = useState<Mode>("view");
  /** True when edit mode was entered via the photo menu's "Edit" item — only
   * the photo is editable then; every other field stays read-only. */
  const [photoOnlyEdit, setPhotoOnlyEdit] = useState(false);
  const fieldsEditable = mode === "edit" && !photoOnlyEdit;
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // ── Edit form fields ──
  const [uploading, setUploading] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [photoViewOpen, setPhotoViewOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactNumber, setEmergencyContactNumber] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [addrLine1, setAddrLine1] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [addrPincode, setAddrPincode] = useState("");
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // ── Password fields ──
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});

  // ─── Data queries ─────────────────────────────────────────────────────────

  const profileQ = useQuery({
    queryKey: ["warden-profile", userId],
    enabled: !!userId,
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

  const assignmentsQ = useWardenAssignments(userId);

  const authUserQ = useQuery({
    queryKey: ["warden-auth-user", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });

  // ─── Sync edit form from fetched profile ──────────────────────────────────

  useEffect(() => {
    const p = profileQ.data;
    if (!p) return;
    setFullName(p.full_name ?? "");
    setPhone(p.phone ?? "");
    setEmail(p.email ?? "");
    setEmergencyContactName(p.emergency_contact_name ?? "");
    setEmergencyContactNumber(p.emergency_contact_number ?? "");
    setAlternatePhone(p.alternate_phone ?? "");
    setDateOfBirth(p.date_of_birth ?? "");
    setGender(p.gender ?? "");
    setBloodGroup(p.blood_group ?? "");
    setAvatarPath(p.avatar_path);
    const addr = (p.address ?? null) as {
      line1?: string;
      city?: string;
      state?: string;
      pincode?: string;
    } | null;
    setAddrLine1(addr?.line1 ?? "");
    setAddrCity(addr?.city ?? "");
    setAddrState(addr?.state ?? "");
    setAddrPincode(addr?.pincode ?? "");
  }, [profileQ.data]);

  // ─── Avatar upload ────────────────────────────────────────────────────────

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

  // ─── Remove photo (persists immediately) ─────────────────────────────────

  const removePhoto = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_path: null })
        .eq("id", userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      setAvatarPath(null);
      toast.success("Photo removed");
      qc.invalidateQueries({ queryKey: ["warden-profile", userId] });
      qc.invalidateQueries({ queryKey: ["own-profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove photo"),
  });

  // ─── Save profile ─────────────────────────────────────────────────────────

  const save = useMutation({
    mutationFn: async () => {
      const parsed = wardenProfileEditSchema.safeParse({
        fullName,
        phone,
        email,
        emergencyContactName,
        emergencyContactNumber,
        alternatePhone,
        dateOfBirth,
        gender: gender || undefined,
        bloodGroup: bloodGroup || undefined,
        address: { line1: addrLine1, city: addrCity, state: addrState, pincode: addrPincode },
      });
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          fieldErrors[String(issue.path[0])] = issue.message;
        }
        setEditErrors(fieldErrors);
        throw new Error("Please fix the highlighted fields");
      }
      setEditErrors({});
      const d = parsed.data;
      const hasAddress = d.address && Object.values(d.address).some((v) => v);
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: d.fullName,
          phone: d.phone,
          email: d.email,
          emergency_contact_name: d.emergencyContactName,
          emergency_contact_number: d.emergencyContactNumber,
          alternate_phone: d.alternatePhone || null,
          date_of_birth: d.dateOfBirth || null,
          gender: d.gender ?? null,
          blood_group: d.bloodGroup ?? null,
          address: hasAddress ? d.address : null,
          avatar_path: avatarPath,
        })
        .eq("id", userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated successfully");
      qc.invalidateQueries({ queryKey: ["warden-profile", userId] });
      qc.invalidateQueries({ queryKey: ["own-profile"] });
      setMode("view");
      setPhotoOnlyEdit(false);
      setShowPasswordForm(false);
    },
    onError: (e) => {
      if (e instanceof Error && e.message !== "Please fix the highlighted fields") {
        toast.error(e.message);
      }
    },
  });

  // ─── Change password ──────────────────────────────────────────────────────

  const changePassword = useMutation({
    mutationFn: async () => {
      const parsed = changePasswordSchema.safeParse({
        currentPassword,
        password: newPassword,
        confirmPassword,
      });
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          fieldErrors[String(issue.path[0])] = issue.message;
        }
        setPwErrors(fieldErrors);
        throw new Error("Please fix the highlighted fields");
      }
      setPwErrors({});

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user?.email) {
        throw new Error("Could not verify your account. Please sign in again.");
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: parsed.data.currentPassword,
      });
      if (signInErr) {
        setPwErrors({ currentPassword: "Current password is incorrect" });
        throw new Error("Current password is incorrect");
      }

      const { error: updateErr } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwErrors({});
      setShowPasswordForm(false);
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : "Could not change password";
      if (msg !== "Please fix the highlighted fields") toast.error(msg);
    },
  });

  // ─── Cancel edit ──────────────────────────────────────────────────────────

  function cancelEdit() {
    const p = profileQ.data;
    if (p) {
      setFullName(p.full_name ?? "");
      setPhone(p.phone ?? "");
      setEmail(p.email ?? "");
      setEmergencyContactName(p.emergency_contact_name ?? "");
      setEmergencyContactNumber(p.emergency_contact_number ?? "");
      setAlternatePhone(p.alternate_phone ?? "");
      setDateOfBirth(p.date_of_birth ?? "");
      setGender(p.gender ?? "");
      setBloodGroup(p.blood_group ?? "");
      setAvatarPath(p.avatar_path);
      const addr = (p.address ?? null) as {
        line1?: string; city?: string; state?: string; pincode?: string;
      } | null;
      setAddrLine1(addr?.line1 ?? "");
      setAddrCity(addr?.city ?? "");
      setAddrState(addr?.state ?? "");
      setAddrPincode(addr?.pincode ?? "");
    }
    setEditErrors({});
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPwErrors({});
    setShowPasswordForm(false);
    setMode("view");
    setPhotoOnlyEdit(false);
  }

  // ─── Guards ───────────────────────────────────────────────────────────────

  if (profileQ.isLoading || assignmentsQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (!profileQ.data) {
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-sm text-muted-foreground">
        Could not load your profile.
      </p>
    );
  }

  // ─── Derived values ───────────────────────────────────────────────────────

  const p = profileQ.data;
  const assignments = assignmentsQ.data ?? [];
  const primary = assignments[0];

  const propertyLabel = Array.from(
    new Set(assignments.map((a) => a.property_name).filter(Boolean)),
  ).join(", ") || "—";

  const blocksLabel =
    Array.from(new Set(assignments.map((a) => a.block_name).filter(Boolean))).join(", ") ||
    "All Blocks";

  const isActive = primary?.is_active ?? true;

  const initial = (mode === "edit" ? fullName : (p.full_name ?? "W")).trim()[0]?.toUpperCase() ?? "W";
  const displayAvatarUrl =
    mode === "edit"
      ? avatarPath
        ? supabase.storage.from("avatars").getPublicUrl(avatarPath).data.publicUrl
        : undefined
      : p.avatar_path
        ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl
        : undefined;

  const authUser = authUserQ.data;
  const isEmailVerified = !!authUser?.email_confirmed_at;
  const lastLogin = authUser?.last_sign_in_at
    ? new Date(authUser.last_sign_in_at).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const dobFormatted = p.date_of_birth
    ? new Date(p.date_of_birth).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : undefined;

  const genderDisplay =
    p.gender === "MALE" ? "Male"
    : p.gender === "FEMALE" ? "Female"
    : p.gender === "OTHER" ? "Other"
    : (p.gender ?? undefined);

  const addrDisplay = (() => {
    const addr = (p.address ?? null) as {
      line1?: string; city?: string; state?: string; pincode?: string;
    } | null;
    if (!addr) return null;
    return [addr.line1, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ") || null;
  })();

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 pb-8">

      {/* ══════════════════════════════════════════════════
          PROFILE HEADER
      ══════════════════════════════════════════════════ */}
      <Card className="overflow-hidden rounded-2xl border-border/80 py-0 shadow-card-ambient">
        <CardContent className="relative flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent"
          />

          {/* Avatar + identity */}
          <div className="relative flex min-w-0 items-center gap-4 sm:gap-5">
            <div className="relative shrink-0">
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={uploading}
                    aria-label="Profile photo options"
                    className="group relative block rounded-full outline-none"
                  >
                    <Avatar className="h-16 w-16 ring-2 ring-primary/30 sm:h-20 sm:w-20">
                      <AvatarImage src={displayAvatarUrl} alt={p.full_name ?? "Warden"} />
                      <AvatarFallback className="bg-primary/15 text-xl font-bold text-primary sm:text-2xl">
                        {initial}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      {uploading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      ) : (
                        <Camera className="h-5 w-5 text-white" />
                      )}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    disabled={!displayAvatarUrl}
                    onSelect={() => setPhotoViewOpen(true)}
                  >
                    View
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setMode("edit");
                      setPhotoOnlyEdit(true);
                      fileInputRef.current?.click();
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!displayAvatarUrl || removePhoto.isPending}
                    onSelect={() => removePhoto.mutate()}
                    className="text-destructive focus:text-destructive"
                  >
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-foreground sm:text-xl">
                {p.full_name ?? "—"}
              </p>
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted-foreground">
                Warden
                {isActive && (
                  <Badge
                    variant="outline"
                    className="inline-flex items-center gap-1.5 rounded-full border-emerald-500/30 bg-emerald-500/10 px-2 py-0 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                    Active
                  </Badge>
                )}
              </p>
              <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                {propertyLabel !== "—" && (
                  <p className="flex items-center gap-1.5">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="font-medium text-foreground">{propertyLabel}</span>
                  </p>
                )}
                <p className="flex items-center gap-1.5">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span className="font-medium text-foreground">{blocksLabel}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Header buttons */}
          <div className="relative flex shrink-0 gap-2">
            {mode === "view" ? (
              <Button
                size="sm"
                id="warden-profile-edit-btn"
                onClick={() => {
                  setMode("edit");
                  setPhotoOnlyEdit(false);
                }}
              >
                <UserRoundPen className="h-4 w-4" />
                Edit Profile
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={cancelEdit}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  id="warden-profile-save-btn"
                  disabled={save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserRoundPen className="h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════
          THREE-COLUMN SECTION GRID
      ══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* ── CONTACT & IDENTITY ── */}
        <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
          <SectionHeader icon={User} title="Contact & Identity" tone="info" />
          <CardContent className="flex flex-col divide-y divide-border/40 px-5 pb-4 pt-1">
            {fieldsEditable ? (
              <>
                <EditField label="Full Name" htmlFor="wr-name" error={editErrors.fullName} className="py-2">
                  <Input
                    id="wr-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>

                {/* System-controlled — always read-only */}
                <FieldRow icon={Lock} label="Employee ID" value={primary?.employee_id} />
                <FieldRow icon={Lock} label="Role" value="Warden" />
                <FieldRow icon={Building2} label="Assigned Property" value={propertyLabel} />
                <FieldRow icon={Building2} label="Assigned Block(s)" value={blocksLabel} />

                <EditField label="Mobile Number" htmlFor="wr-phone" error={editErrors.phone} className="py-2">
                  <Input
                    id="wr-phone"
                    placeholder="Enter mobile number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>

                <EditField label="Email" htmlFor="wr-email" error={editErrors.email} className="py-2">
                  <Input
                    id="wr-email"
                    type="email"
                    placeholder="Enter email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>

                <EditField label="Emergency Contact Name" htmlFor="wr-ecname" error={editErrors.emergencyContactName} className="py-2">
                  <Input
                    id="wr-ecname"
                    placeholder="Enter contact name"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>

                <EditField label="Emergency Contact Number" htmlFor="wr-ecnumber" error={editErrors.emergencyContactNumber} className="py-2">
                  <Input
                    id="wr-ecnumber"
                    placeholder="Enter contact number"
                    value={emergencyContactNumber}
                    onChange={(e) => setEmergencyContactNumber(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>
              </>
            ) : (
              <>
                <FieldRow icon={UserRoundPen} label="Full Name" value={p.full_name} />
                <FieldRow icon={Lock} label="Employee ID" value={primary?.employee_id} />
                <FieldRow icon={Lock} label="Role" value="Warden" />
                <FieldRow icon={Building2} label="Assigned Property" value={propertyLabel} />
                <FieldRow icon={Building2} label="Assigned Block(s)" value={blocksLabel} />
                <FieldRow icon={Phone} label="Mobile Number" value={p.phone} />
                <FieldRow icon={Mail} label="Email" value={p.email} />
                <FieldRow icon={User} label="Emergency Contact Name" value={p.emergency_contact_name} />
                <FieldRow icon={Phone} label="Emergency Contact Number" value={p.emergency_contact_number} />
              </>
            )}
          </CardContent>
        </Card>

        {/* ── ADDITIONAL DETAILS ── */}
        <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
          <SectionHeader icon={FileText} title="Additional Details" tone="primary" />
          <CardContent className="flex flex-col divide-y divide-border/40 px-5 pb-4 pt-1">
            {fieldsEditable ? (
              <>
                <EditField label="Alternate Mobile Number" htmlFor="wr-altphone" error={editErrors.alternatePhone} className="py-2">
                  <Input
                    id="wr-altphone"
                    placeholder="Enter alternate phone"
                    value={alternatePhone}
                    onChange={(e) => setAlternatePhone(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>

                <EditField label="Date of Birth" htmlFor="wr-dob" error={editErrors.dateOfBirth} className="py-2">
                  <Input
                    id="wr-dob"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>

                <EditField label="Gender" htmlFor="wr-gender" error={editErrors.gender} className="py-2">
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger id="wr-gender" className="h-8 text-sm">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">Male</SelectItem>
                      <SelectItem value="FEMALE">Female</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </EditField>

                <EditField label="Blood Group" htmlFor="wr-blood" error={editErrors.bloodGroup} className="py-2">
                  <Select value={bloodGroup} onValueChange={setBloodGroup}>
                    <SelectTrigger id="wr-blood" className="h-8 text-sm">
                      <SelectValue placeholder="Select blood group" />
                    </SelectTrigger>
                    <SelectContent>
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                        <SelectItem key={bg} value={bg}>{bg}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </EditField>

                <EditField label="Address" htmlFor="wr-addr1" className="py-2">
                  <Input
                    id="wr-addr1"
                    placeholder="Street address"
                    value={addrLine1}
                    onChange={(e) => setAddrLine1(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>

                <div className="grid grid-cols-2 gap-2 py-2">
                  <EditField label="City" htmlFor="wr-city">
                    <Input
                      id="wr-city"
                      placeholder="City"
                      value={addrCity}
                      onChange={(e) => setAddrCity(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </EditField>
                  <EditField label="State" htmlFor="wr-state">
                    <Input
                      id="wr-state"
                      placeholder="State"
                      value={addrState}
                      onChange={(e) => setAddrState(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </EditField>
                </div>

                <EditField label="Pincode" htmlFor="wr-pincode" className="py-2">
                  <Input
                    id="wr-pincode"
                    placeholder="Pincode"
                    value={addrPincode}
                    onChange={(e) => setAddrPincode(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>
              </>
            ) : (
              <>
                <FieldRow icon={Phone} label="Alternate Mobile Number" value={p.alternate_phone} />
                <FieldRow icon={Calendar} label="Date of Birth" value={dobFormatted} />
                <FieldRow icon={User} label="Gender" value={genderDisplay} />
                <FieldRow icon={Droplet} label="Blood Group" value={p.blood_group} />
                <FieldRow icon={MapPin} label="Address" value={addrDisplay} />
              </>
            )}
          </CardContent>
        </Card>

        {/* ── ACCOUNT & SECURITY ── */}
        <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
          <SectionHeader icon={ShieldCheck} title="Account & Security" tone="warning" />
          <CardContent className="flex flex-col divide-y divide-border/40 px-5 pb-4 pt-1">

            {/* Email + verified badge */}
            <div className="flex flex-col gap-0.5 py-2">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Mail className="h-3 w-3 shrink-0" />
                Email
              </p>
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                {p.email ?? "—"}
                {isEmailVerified && (
                  <Badge
                    variant="outline"
                    className="gap-1 rounded-full border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Verified
                  </Badge>
                )}
              </p>
            </div>

            {/* Account Status */}
            <FieldRow
              icon={ShieldCheck}
              label="Account Status"
              value={
                <span className={isActive ? "font-semibold text-emerald-500" : "font-semibold text-muted-foreground"}>
                  {isActive ? "Active" : "Inactive"}
                </span>
              }
            />

            {/* Last Login */}
            <FieldRow icon={Clock} label="Last Login" value={lastLogin} />

            {/* Password row */}
            <div className="flex flex-col gap-0.5 py-2">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <KeyRound className="h-3 w-3 shrink-0" />
                Password
              </p>
              <p className="text-sm font-medium tracking-widest text-foreground">••••••••</p>

              {!fieldsEditable ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Use Edit Profile to change password
                </p>
              ) : (
                <button
                  type="button"
                  id="warden-profile-toggle-pw-btn"
                  onClick={() => setShowPasswordForm((v) => !v)}
                  className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                >
                  {showPasswordForm ? (
                    <><ChevronUp className="h-3.5 w-3.5" /> Hide Password Form</>
                  ) : (
                    <><ChevronDown className="h-3.5 w-3.5" /> Change Password</>
                  )}
                </button>
              )}
            </div>

            {/* ── Inline Change Password form ── */}
            {fieldsEditable && showPasswordForm && (
              <div className="flex flex-col gap-3 py-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <KeyRound className="h-3.5 w-3.5 text-warning" />
                  Change Password
                </p>

                <div className="space-y-1">
                  <Label htmlFor="pw-current" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Current Password
                  </Label>
                  <PasswordInput
                    id="pw-current"
                    autoComplete="current-password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="h-8 text-sm"
                  />
                  {pwErrors.currentPassword && (
                    <p className="text-xs text-destructive">{pwErrors.currentPassword}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="pw-new" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    New Password
                  </Label>
                  <PasswordInput
                    id="pw-new"
                    autoComplete="new-password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-8 text-sm"
                  />
                  {pwErrors.password && (
                    <p className="text-xs text-destructive">{pwErrors.password}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="pw-confirm" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Confirm Password
                  </Label>
                  <PasswordInput
                    id="pw-confirm"
                    autoComplete="new-password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="h-8 text-sm"
                  />
                  {pwErrors.confirmPassword && (
                    <p className="text-xs text-destructive">{pwErrors.confirmPassword}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                      setPwErrors({});
                      setShowPasswordForm(false);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    id="warden-profile-update-password-btn"
                    className="h-8 text-xs"
                    disabled={
                      changePassword.isPending ||
                      !currentPassword ||
                      !newPassword ||
                      !confirmPassword
                    }
                    onClick={() => changePassword.mutate()}
                  >
                    {changePassword.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5" />
                    )}
                    Update Password
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── View Photo dialog ── */}
      <Dialog open={photoViewOpen} onOpenChange={setPhotoViewOpen}>
        <DialogContent className="flex flex-col items-center gap-4">
          <DialogHeader>
            <DialogTitle>Profile photo</DialogTitle>
          </DialogHeader>
          {displayAvatarUrl && (
            <img
              src={displayAvatarUrl}
              alt={p.full_name ?? "Warden"}
              className="max-h-[60vh] w-full rounded-xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
