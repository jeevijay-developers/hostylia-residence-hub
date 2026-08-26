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
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
  User,
  UserRoundPen,
  X,
  type LucideIcon,
} from "lucide-react";

import { SignOutDialog } from "@/components/dashboard/SignOutDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { adminProfileEditSchema } from "@/schemas/profile";
import { changePasswordSchema } from "@/schemas/auth";

export const Route = createFileRoute("/_authenticated/admin/profile/")({
  head: () => ({ meta: [{ title: "My Profile — Hostylia" }] }),
  component: AdminProfilePage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

/** Two top-level modes: read-only view or editable edit. */
type Mode = "view" | "edit";

// ─── Shared sub-components ────────────────────────────────────────────────────

/**
 * Read-only display field — label + value inside a subtle card tile.
 * Used identically in view mode and for read-only fields inside edit mode.
 */
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

/** Labelled form field wrapper used in edit mode. */
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
      <Label htmlFor={htmlFor} className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Section card header with a coloured icon dot. */
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

// ─── Page component ───────────────────────────────────────────────────────────

function AdminProfilePage() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Page mode: view (default) or edit ──
  const [mode, setMode] = useState<Mode>("view");
  const [signOutOpen, setSignOutOpen] = useState(false);

  // ── Inline password form (only available during edit mode) ──
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // ── Edit-form field state ──
  const [uploading, setUploading] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactNumber, setEmergencyContactNumber] = useState("");
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // ── Inline password field state ──
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});

  // ─── Data queries ─────────────────────────────────────────────────────────

  const profileQ = useQuery({
    queryKey: ["admin-profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, phone, email, avatar_path, alternate_phone, date_of_birth, gender, blood_group, emergency_contact_name, emergency_contact_number",
        )
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const assignmentQ = useQuery({
    queryKey: ["admin-assignment", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_assignments")
        .select("employee_id, property_id, is_active, properties(name)")
        .eq("user_id", userId!)
        .eq("role", "HOSTEL_ADMIN")
        .eq("is_active", true)
        .order("granted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const authUserQ = useQuery({
    queryKey: ["admin-auth-user", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });

  // ─── Sync edit-form from fresh profile data ──────────────────────────────

  useEffect(() => {
    const p = profileQ.data;
    if (!p) return;
    setFullName(p.full_name ?? "");
    setPhone(p.phone ?? "");
    setAlternatePhone(p.alternate_phone ?? "");
    setDateOfBirth(p.date_of_birth ?? "");
    setGender(p.gender ?? "");
    setBloodGroup(p.blood_group ?? "");
    setEmergencyContactName(p.emergency_contact_name ?? "");
    setEmergencyContactNumber(p.emergency_contact_number ?? "");
    setAvatarPath(p.avatar_path);
  }, [profileQ.data]);

  // ─── Avatar upload ───────────────────────────────────────────────────────

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

  // ─── Save profile mutation ────────────────────────────────────────────────

  const save = useMutation({
    mutationFn: async () => {
      const parsed = adminProfileEditSchema.safeParse({
        fullName,
        phone,
        alternatePhone,
        dateOfBirth,
        gender: gender || undefined,
        bloodGroup: bloodGroup || undefined,
        emergencyContactName,
        emergencyContactNumber,
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
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: d.fullName,
          phone: d.phone || null,
          alternate_phone: d.alternatePhone || null,
          date_of_birth: d.dateOfBirth || null,
          gender: d.gender ?? null,
          blood_group: d.bloodGroup ?? null,
          emergency_contact_name: d.emergencyContactName || null,
          emergency_contact_number: d.emergencyContactNumber || null,
          avatar_path: avatarPath,
        })
        .eq("id", userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated successfully");
      qc.invalidateQueries({ queryKey: ["admin-profile", userId] });
      qc.invalidateQueries({ queryKey: ["own-profile"] });
      setMode("view");
      setShowPasswordForm(false);
    },
    onError: (e) => {
      if (e instanceof Error && e.message !== "Please fix the highlighted fields") {
        toast.error(e.message);
      }
    },
  });

  // ─── Change password mutation ─────────────────────────────────────────────

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
      // Clear fields & collapse — remain in edit mode
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwErrors({});
      setShowPasswordForm(false);
    },
    onError: (e) => {
      const message = e instanceof Error ? e.message : "Could not change password";
      if (message !== "Please fix the highlighted fields") toast.error(message);
    },
  });

  // ─── Cancel edit ──────────────────────────────────────────────────────────

  function cancelEdit() {
    const p = profileQ.data;
    if (p) {
      setFullName(p.full_name ?? "");
      setPhone(p.phone ?? "");
      setAlternatePhone(p.alternate_phone ?? "");
      setDateOfBirth(p.date_of_birth ?? "");
      setGender(p.gender ?? "");
      setBloodGroup(p.blood_group ?? "");
      setEmergencyContactName(p.emergency_contact_name ?? "");
      setEmergencyContactNumber(p.emergency_contact_number ?? "");
      setAvatarPath(p.avatar_path);
    }
    setEditErrors({});
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPwErrors({});
    setShowPasswordForm(false);
    setMode("view");
  }

  // ─── Loading / error guards ───────────────────────────────────────────────

  if (profileQ.isLoading || assignmentQ.isLoading) {
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
  const a = assignmentQ.data;
  const propertyName = (a?.properties as { name: string } | null)?.name ?? "All properties";
  const isActive = a?.is_active ?? true;

  const initial = (mode === "edit" ? fullName : p.full_name).trim()[0]?.toUpperCase() ?? "A";
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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 pb-8">

      {/* ════════════════════════════════════════════════════
          PROFILE HEADER CARD
      ════════════════════════════════════════════════════ */}
      <Card className="overflow-hidden rounded-2xl border-border/80 py-0 shadow-card-ambient">
        <CardContent className="relative flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
          {/* gradient wash */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent"
          />

          {/* Avatar + identity */}
          <div className="relative flex min-w-0 items-center gap-4 sm:gap-5">
            {/* Avatar with camera overlay in edit mode */}
            <div className="relative shrink-0">
              <Avatar className="h-16 w-16 ring-2 ring-primary/30 sm:h-20 sm:w-20">
                <AvatarImage src={displayAvatarUrl} alt={p.full_name} />
                <AvatarFallback className="bg-primary/15 text-xl font-bold text-primary sm:text-2xl">
                  {initial}
                </AvatarFallback>
              </Avatar>

              {mode === "edit" && (
                <>
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
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Change profile photo"
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
                  >
                    {uploading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                    ) : (
                      <Camera className="h-5 w-5 text-white" />
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Name / role / property */}
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-foreground sm:text-xl">
                {p.full_name}
              </p>
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted-foreground">
                Hostel Admin
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
              <p className="text-sm text-muted-foreground">{propertyName}</p>
            </div>
          </div>

          {/* ── Header action buttons ── */}
          <div className="relative flex shrink-0 gap-2">
            {mode === "view" ? (
              /* READ-ONLY: single Edit Profile button */
              <Button
                size="sm"
                id="admin-profile-edit-btn"
                onClick={() => setMode("edit")}
              >
                <UserRoundPen className="h-4 w-4" />
                Edit Profile
              </Button>
            ) : (
              /* EDIT MODE: Cancel + Save Changes */
              <>
                <Button variant="outline" size="sm" onClick={cancelEdit}>
                  <X className="h-4 w-4" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  id="admin-profile-save-btn"
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

      {/* ════════════════════════════════════════════════════
          THREE-COLUMN SECTION GRID
          Contact & Identity | Additional Details | Account & Security
      ════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* ── CONTACT & IDENTITY ── */}
        <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
          <SectionHeader icon={User} title="Contact & Identity" tone="info" />
          <CardContent className="flex flex-col divide-y divide-border/40 px-5 pb-4 pt-1">
            {mode === "edit" ? (
              <>
                <EditField label="Full Name" htmlFor="ap-name" error={editErrors.fullName} className="py-2">
                  <Input
                    id="ap-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>

                {/* Read-only system fields */}
                <FieldRow icon={Lock} label="Employee ID" value={a?.employee_id} />
                <FieldRow icon={Lock} label="Role" value="Hostel Admin" />
                <FieldRow icon={Building2} label="Assigned Property" value={propertyName} />

                <EditField label="Phone Number" htmlFor="ap-phone" error={editErrors.phone} className="py-2">
                  <Input
                    id="ap-phone"
                    placeholder="Enter phone number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>

                {/* Email — read-only (auth-controlled) */}
                <FieldRow icon={Mail} label="Email" value={p.email} />
              </>
            ) : (
              <>
                <FieldRow icon={UserRoundPen} label="Full Name" value={p.full_name} />
                <FieldRow icon={Lock} label="Employee ID" value={a?.employee_id} />
                <FieldRow icon={Lock} label="Role" value="Hostel Admin" />
                <FieldRow icon={Building2} label="Assigned Property" value={propertyName} />
                <FieldRow icon={Phone} label="Phone Number" value={p.phone} />
                <FieldRow icon={Mail} label="Email" value={p.email} />
              </>
            )}
          </CardContent>
        </Card>

        {/* ── ADDITIONAL DETAILS ── */}
        <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
          <SectionHeader icon={FileText} title="Additional Details" tone="primary" />
          <CardContent className="flex flex-col divide-y divide-border/40 px-5 pb-4 pt-1">
            {mode === "edit" ? (
              <>
                <EditField label="Alternate Phone" htmlFor="ap-altphone" error={editErrors.alternatePhone} className="py-2">
                  <Input
                    id="ap-altphone"
                    placeholder="Enter alternate phone"
                    value={alternatePhone}
                    onChange={(e) => setAlternatePhone(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>

                <EditField label="Date of Birth" htmlFor="ap-dob" error={editErrors.dateOfBirth} className="py-2">
                  <Input
                    id="ap-dob"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>

                <EditField label="Gender" htmlFor="ap-gender" error={editErrors.gender} className="py-2">
                  <Select value={gender} onValueChange={setGender}>
                    <SelectTrigger id="ap-gender" className="h-8 text-sm">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">Male</SelectItem>
                      <SelectItem value="FEMALE">Female</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </EditField>

                <EditField label="Blood Group" htmlFor="ap-blood" error={editErrors.bloodGroup} className="py-2">
                  <Select value={bloodGroup} onValueChange={setBloodGroup}>
                    <SelectTrigger id="ap-blood" className="h-8 text-sm">
                      <SelectValue placeholder="Select blood group" />
                    </SelectTrigger>
                    <SelectContent>
                      {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                        <SelectItem key={bg} value={bg}>
                          {bg}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </EditField>

                <EditField label="Emergency Contact Name" htmlFor="ap-ecname" error={editErrors.emergencyContactName} className="py-2">
                  <Input
                    id="ap-ecname"
                    placeholder="Enter contact name"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>

                <EditField label="Emergency Contact Number" htmlFor="ap-ecnumber" error={editErrors.emergencyContactNumber} className="py-2">
                  <Input
                    id="ap-ecnumber"
                    placeholder="Enter contact number"
                    value={emergencyContactNumber}
                    onChange={(e) => setEmergencyContactNumber(e.target.value)}
                    className="h-8 text-sm"
                  />
                </EditField>
              </>
            ) : (
              <>
                <FieldRow icon={Phone} label="Alternate Phone" value={p.alternate_phone} />
                <FieldRow
                  icon={Calendar}
                  label="Date of Birth"
                  value={
                    p.date_of_birth
                      ? new Date(p.date_of_birth).toLocaleDateString()
                      : undefined
                  }
                />
                <FieldRow icon={User} label="Gender" value={p.gender} />
                <FieldRow icon={Droplet} label="Blood Group" value={p.blood_group} />
                <FieldRow icon={User} label="Emergency Contact Name" value={p.emergency_contact_name} />
                <FieldRow icon={Phone} label="Emergency Contact Number" value={p.emergency_contact_number} />
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
                {p.email}
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
              value={isActive ? "Active" : "Pending"}
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

              {mode === "view" ? (
                /* Read-only hint */
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Use Edit Profile to change password
                </p>
              ) : (
                /* Edit mode: toggle button */
                <button
                  type="button"
                  id="admin-profile-toggle-pw-btn"
                  onClick={() => setShowPasswordForm((v) => !v)}
                  className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                >
                  {showPasswordForm ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      Hide Password Form
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Change Password
                    </>
                  )}
                </button>
              )}
            </div>

            {/* ── Inline Change Password form (edit mode only) ── */}
            {mode === "edit" && showPasswordForm && (
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

                {/* Password action buttons */}
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
                    id="admin-profile-update-password-btn"
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

      {/* ── Logout ── */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          onClick={() => setSignOutOpen(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>

      <SignOutDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Logout?"
        confirmLabel="Logout"
      />
    </div>
  );
}
