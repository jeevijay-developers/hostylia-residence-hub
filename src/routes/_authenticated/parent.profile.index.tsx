import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BedDouble,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
  UserRoundPen,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { SignOutDialog } from "@/components/dashboard/SignOutDialog";
import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { displayIndianPhone } from "@/schemas/auth";
import { changePasswordSchema } from "@/schemas/auth";
import { guardianSelfEditSchema } from "@/schemas/guardian";

export const Route = createFileRoute("/_authenticated/parent/profile/")({
  head: () => ({ meta: [{ title: "My Profile — Hostylia" }] }),
  component: ParentProfilePage,
});

// ─── Constants & Types ────────────────────────────────────────────────────────

const OPEN_ALLOCATION_STATUSES = [
  "ACTIVE",
  "NOTICE_GIVEN",
  "MOVE_OUT_INSPECTION",
  "PENDING_AGREEMENT",
  "PENDING_PAYMENT",
];

type Mode = "view" | "edit";

// ─── Shared sub-components ────────────────────────────────────────────────────

function FieldRow({
  icon: Icon,
  label,
  value,
  truncate = false,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  truncate?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" />
        {label}
      </p>
      <p className={`text-sm font-medium text-foreground ${truncate ? "truncate" : ""}`}>
        {value ?? "—"}
      </p>
    </div>
  );
}

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

function SectionHeader({
  icon: Icon,
  title,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  tone: "info" | "primary" | "warning" | "success";
}) {
  const toneClass = {
    info: "bg-info/15 text-info",
    primary: "bg-primary/15 text-primary",
    warning: "bg-warning/15 text-warning",
    success: "bg-success/15 text-success",
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

// ─── Page ─────────────────────────────────────────────────────────────────────

function ParentProfilePage() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;
  const qc = useQueryClient();

  // ── Page state ──
  const [mode, setMode] = useState<Mode>("view");
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // ── Edit form fields ──
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [occupation, setOccupation] = useState("");
  
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

  const relationsQ = useQuery({
    queryKey: ["own-guardian-relations", guardianQ.data?.id],
    enabled: !!guardianQ.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_guardians")
        .select("relationship, is_emergency_contact, is_primary, student_id, students(id, full_name, admission_number, status, property_id, joined_at)")
        .eq("guardian_id", guardianQ.data!.id)
        .is("unlinked_at", null);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        relationship: string | null;
        is_emergency_contact: boolean;
        is_primary: boolean;
        student_id: string;
        students: {
          id: string;
          full_name: string;
          admission_number: string;
          status: string;
          property_id: string;
          joined_at: string | null;
        } | null;
      }>;
    },
  });

  const authUserQ = useQuery({
    queryKey: ["parent-auth-user", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });

  // ─── Sync edit form from fetched data ─────────────────────────────────────

  useEffect(() => {
    const g = guardianQ.data;
    if (!g) return;

    setFullName(g.full_name ?? "");
    setEmail(g.email ?? "");
    setOccupation(g.occupation ?? "");

    const addr = (g.address ?? null) as {
      line1?: string;
      city?: string;
      state?: string;
      pincode?: string;
    } | null;
    setAddrLine1(addr?.line1 ?? "");
    setAddrCity(addr?.city ?? "");
    setAddrState(addr?.state ?? "");
    setAddrPincode(addr?.pincode ?? "");
  }, [guardianQ.data]);

  // ─── Save profile ─────────────────────────────────────────────────────────

  const save = useMutation({
    mutationFn: async () => {
      const gId = guardianQ.data?.id;
      if (!gId) throw new Error("Missing guardian record");

      const parsed = guardianSelfEditSchema.safeParse({
        fullName,
        email,
        occupation,
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
        .from("guardians")
        .update({
          full_name: d.fullName,
          email: d.email || null,
          occupation: d.occupation || null,
          address: hasAddress ? d.address : null,
        })
        .eq("id", gId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated successfully");
      qc.invalidateQueries({ queryKey: ["own-guardian", userId] });
      setMode("view");
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
    const g = guardianQ.data;
    if (g) {
      setFullName(g.full_name ?? "");
      setEmail(g.email ?? "");
      setOccupation(g.occupation ?? "");

      const addr = (g.address ?? null) as {
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
  }

  // ─── Guards ───────────────────────────────────────────────────────────────

  if (guardianQ.isLoading) {
    return (
      <div className="max-w-4xl space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (!guardianQ.data) {
    return (
      <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-sm text-muted-foreground">
        Could not load your profile.
      </p>
    );
  }

  // ─── Derived values ───────────────────────────────────────────────────────

  const g = guardianQ.data;
  const relations = relationsQ.data ?? [];
  const primaryRelation = relations.find((r) => r.is_primary) ?? relations[0];
  const authUser = authUserQ.data;

  const initial = (mode === "edit" ? fullName : g.full_name).trim()[0]?.toUpperCase() ?? "P";
  const isActive = g.portal_access_enabled && g.status !== "INACTIVE";

  const isEmailVerified = !!authUser?.email_confirmed_at;
  const lastLogin = authUser?.last_sign_in_at
    ? new Date(authUser.last_sign_in_at).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const primaryStudent = primaryRelation?.students ?? null;
  const relationshipLabel = primaryRelation?.relationship ?? "Guardian";

  const addrDisplay = (() => {
    const addr = (g.address ?? null) as {
      line1?: string; city?: string; state?: string; pincode?: string;
    } | null;
    if (!addr) return null;
    return [addr.line1, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ") || null;
  })();

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 pb-8 max-w-[1200px]">

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
            <Avatar className="h-16 w-16 shrink-0 ring-2 ring-primary/30 sm:h-20 sm:w-20">
              <AvatarFallback className="bg-primary/15 text-xl font-bold text-primary sm:text-2xl">
                {initial}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-foreground sm:text-xl">
                {g.full_name}
              </p>
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted-foreground">
                Parent
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
                {primaryStudent && (
                  <p className="flex items-center gap-1.5">
                    <User className="h-3 w-3 shrink-0" />
                    Student: <span className="font-medium text-foreground">{primaryStudent.full_name}</span>
                  </p>
                )}
                {g.phone && (
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span className="font-medium text-foreground">{displayIndianPhone(g.phone)}</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Header buttons */}
          <div className="relative flex shrink-0 gap-2">
            {mode === "view" ? (
              <Button
                size="sm"
                id="parent-profile-edit-btn"
                onClick={() => setMode("edit")}
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
                  id="parent-profile-save-btn"
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
          MULTI-COLUMN SECTION GRID
      ══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        <div className="flex flex-col gap-4">
          {/* ── PERSONAL INFORMATION ── */}
          <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
            <SectionHeader icon={User} title="Personal Information" tone="info" />
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1 px-5 pb-5 pt-1">
              {mode === "edit" ? (
                <>
                  <EditField label="Full Name" htmlFor="p-name" error={editErrors.fullName} className="py-1 col-span-1 sm:col-span-2">
                    <Input id="p-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-8 text-sm" />
                  </EditField>
                  <FieldRow icon={Users} label="Relationship with Student" value={relationshipLabel} />
                  
                  {/* Phone is intentionally read-only as per SSO rules */}
                  <FieldRow icon={Lock} label="Mobile Number" value={g.phone ? displayIndianPhone(g.phone) : "—"} />

                  <EditField label="Occupation" htmlFor="p-occ" error={editErrors.occupation} className="py-1 col-span-1 sm:col-span-2">
                    <Input id="p-occ" value={occupation} onChange={(e) => setOccupation(e.target.value)} className="h-8 text-sm" />
                  </EditField>
                </>
              ) : (
                <>
                  <FieldRow icon={UserRoundPen} label="Full Name" value={g.full_name} />
                  <FieldRow icon={Users} label="Relationship" value={relationshipLabel} />
                  <FieldRow icon={Phone} label="Mobile Number" value={g.phone ? displayIndianPhone(g.phone) : undefined} />
                  <FieldRow icon={User} label="Occupation" value={g.occupation} />
                </>
              )}
            </CardContent>
          </Card>

          {/* ── CONTACT & ADDRESS ── */}
          <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
            <SectionHeader icon={MapPin} title="Contact & Address" tone="primary" />
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1 px-5 pb-5 pt-1">
              {mode === "edit" ? (
                <>
                  <div className="col-span-1 sm:col-span-2">
                    <EditField label="Address" htmlFor="p-addr1" className="py-1">
                      <Input id="p-addr1" placeholder="Street address" value={addrLine1} onChange={(e) => setAddrLine1(e.target.value)} className="h-8 text-sm" />
                    </EditField>
                  </div>
                  
                  <EditField label="City" htmlFor="p-city" className="py-1">
                    <Input id="p-city" value={addrCity} onChange={(e) => setAddrCity(e.target.value)} className="h-8 text-sm" />
                  </EditField>
                  <EditField label="State" htmlFor="p-state" className="py-1">
                    <Input id="p-state" value={addrState} onChange={(e) => setAddrState(e.target.value)} className="h-8 text-sm" />
                  </EditField>
                  <EditField label="Pincode" htmlFor="p-pin" className="py-1">
                    <Input id="p-pin" value={addrPincode} onChange={(e) => setAddrPincode(e.target.value)} className="h-8 text-sm" />
                  </EditField>
                </>
              ) : (
                <div className="col-span-1 sm:col-span-2">
                  <FieldRow icon={MapPin} label="Address" value={addrDisplay} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {/* ── ACCOUNT & SECURITY ── */}
          <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
            <SectionHeader icon={ShieldCheck} title="Account & Security" tone="warning" />
            <CardContent className="flex flex-col divide-y divide-border/40 px-5 pb-4 pt-1">

              {mode === "edit" ? (
                <div className="py-2">
                  <EditField label="Auth Email" htmlFor="p-email" error={editErrors.email} className="py-1">
                    <Input id="p-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 text-sm" />
                  </EditField>
                </div>
              ) : (
                <div className="flex flex-col gap-0.5 py-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" />
                    Auth Email
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                    {g.email ?? "—"}
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
              )}

              <FieldRow icon={Clock} label="Last Login" value={lastLogin} />
              <FieldRow icon={ShieldCheck} label="Account Status" value={<span className={isActive ? "font-semibold text-emerald-500" : "font-semibold text-muted-foreground"}>{isActive ? "Active" : g.status}</span>} />

              {/* Password row */}
              <div className="flex flex-col gap-0.5 py-2">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <KeyRound className="h-3 w-3 shrink-0" />
                  Password
                </p>
                <p className="text-sm font-medium tracking-widest text-foreground">••••••••</p>

                {mode === "view" ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Use Edit Profile to change password
                  </p>
                ) : (
                  <button
                    type="button"
                    id="parent-profile-toggle-pw-btn"
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
              {mode === "edit" && showPasswordForm && (
                <div className="flex flex-col gap-3 py-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <KeyRound className="h-3.5 w-3.5 text-warning" />
                    Change Password
                  </p>

                  <div className="space-y-1">
                    <Label htmlFor="pw-current" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Current Password</Label>
                    <PasswordInput id="pw-current" autoComplete="current-password" placeholder="Enter current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="h-8 text-sm" />
                    {pwErrors.currentPassword && <p className="text-xs text-destructive">{pwErrors.currentPassword}</p>}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="pw-new" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">New Password</Label>
                    <PasswordInput id="pw-new" autoComplete="new-password" placeholder="Enter new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-8 text-sm" />
                    {pwErrors.password && <p className="text-xs text-destructive">{pwErrors.password}</p>}
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="pw-confirm" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Confirm Password</Label>
                    <PasswordInput id="pw-confirm" autoComplete="new-password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-8 text-sm" />
                    {pwErrors.confirmPassword && <p className="text-xs text-destructive">{pwErrors.confirmPassword}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setPwErrors({}); setShowPasswordForm(false); }}>
                      <X className="h-3.5 w-3.5" /> Cancel
                    </Button>
                    <Button size="sm" id="parent-profile-update-password-btn" className="h-8 text-xs" disabled={changePassword.isPending || !currentPassword || !newPassword || !confirmPassword} onClick={() => changePassword.mutate()}>
                      {changePassword.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} Update Password
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── STUDENT DETAILS ── */}
          {relations.length > 0 && (
            <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
              <SectionHeader icon={Users} title="Student Details" tone="success" />
              <CardContent className="flex flex-col gap-4 px-5 pb-5 pt-1">
                {relations.map((rel) => {
                  const stu = rel.students;
                  if (!stu) return null;
                  return (
                    <StudentDetailItem
                      key={rel.student_id}
                      student={stu}
                      relationship={rel.relationship}
                    />
                  );
                })}
              </CardContent>
            </Card>
          )}

        </div>
      </div>

      {/* ── Logout ── */}
      <div className="flex justify-end mt-2">
        <Button variant="ghost" onClick={() => setSignOutOpen(true)} className="text-muted-foreground hover:text-foreground">
          <LogOut className="h-4 w-4" /> Logout
        </Button>
      </div>

      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} title="Logout?" confirmLabel="Logout" />
    </div>
  );
}

// ─── Student Detail Component ───────────────────────────────────────────────────

function StudentDetailItem({
  student,
  relationship,
}: {
  student: {
    id: string;
    full_name: string;
    admission_number: string;
    status: string;
    property_id: string;
    joined_at: string | null;
  };
  relationship: string | null;
}) {
  const propertyQ = useQuery({
    queryKey: ["parent-student-property", student.property_id],
    enabled: !!student.property_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("name")
        .eq("id", student.property_id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const allocQ = useQuery({
    queryKey: ["parent-student-allocation", student.id],
    enabled: !!student.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allocations")
        .select(
          "id, status, bed:beds(code, room:rooms(room_number), block:blocks(name))",
        )
        .eq("student_id", student.id)
        .in("status", OPEN_ALLOCATION_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const bed = allocQ.data?.bed as
    | { code: string; room: { room_number: string } | null; block: { name: string } | null }
    | null
    | undefined;

  const propertyName = propertyQ.data?.name ?? "—";
  const blockName = bed?.block?.name ?? "—";
  const roomNumber = bed?.room?.room_number ?? "—";
  const bedCode = bed?.code ?? "—";

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/40">
        <div>
          <p className="font-semibold text-foreground text-sm">{student.full_name}</p>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{relationship || "Student"}</p>
        </div>
        <Badge
          variant="outline"
          className={
            student.status === "ACTIVE"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-muted-foreground/30 text-muted-foreground"
          }
        >
          {student.status}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3 pt-3">
        <FieldRow icon={User} label="Student ID" value={student.admission_number} truncate />
        <FieldRow icon={Building2} label="Property" value={propertyName} truncate />
        <FieldRow icon={Building2} label="Block & Room" value={bed ? `${blockName} · ${roomNumber}` : "—"} truncate />
        <FieldRow icon={BedDouble} label="Bed" value={bedCode} truncate />
      </div>
    </div>
  );
}
