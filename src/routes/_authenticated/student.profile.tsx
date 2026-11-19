import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  BedDouble,
  BookOpen,
  Building2,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Droplet,
  FileText,
  GraduationCap,
  Upload,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
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
import { TurnstileWidget, useCaptchaToken } from "@/components/site/TurnstileWidget";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { KycUploadForm } from "@/components/students/KycUploadForm";
import { supabase } from "@/integrations/supabase/client";
import { useAvatarUrl } from "@/lib/avatar";
import { useResolvedRole } from "@/lib/user-role";
import { useStudentPermissions } from "@/lib/staff-scope";
import { StudentModuleGuard } from "@/components/dashboard/RoleGuard";
import {
  changePasswordSchema,
  emailSchema,
  fullNameSchema,
  indianMobileSchema,
  sanitizeIndianPhoneInput,
  sanitizeNameKeystroke,
} from "@/schemas/auth";
import { pincodeSchema } from "@/schemas/profile";
import { studentSelfProfileSchema } from "@/schemas/student";

// ─── Field-level validators (shared by blur and submit) ──────────────────────
// Reuse the same shared schemas the rest of the app already validates these
// field *types* with (fullNameSchema/indianMobileSchema from signup &
// StudentProfileEditDialog, pincodeSchema) — not a new rule invented for
// this page, just applied earlier (typing/blur) than before (previously
// submit-only, and for phone/pincode not applied here at all).
const PLACE_NAME_REGEX = /^\p{L}[\p{L}\s.'-]*$/u;

function requiredNameError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Enter your full name";
  return fullNameSchema.safeParse(trimmed).success
    ? null
    : "Please enter a valid name. Numbers are not allowed.";
}

/** Optional name-type field (Emergency Contact Name) — empty is valid, never
 * flagged before the student has entered anything. */
function optionalNameError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return fullNameSchema.safeParse(trimmed).success
    ? null
    : "Please enter a valid name. Numbers are not allowed.";
}

/** City/State — same "no digits/stray symbols" intent as a name field, but
 * deliberately not reusing fullNameSchema's own length bounds (80 vs this
 * field's existing 80 cap is fine, but a 2-char minimum doesn't fit every
 * real place name) — character class only. */
function placeNameError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return PLACE_NAME_REGEX.test(trimmed)
    ? null
    : "Please enter a valid name using letters only.";
}

function mobileNumberError(value: string, required: boolean): string | null {
  const trimmed = value.trim();
  if (!trimmed) return required ? "Enter your mobile number" : null;
  return indianMobileSchema.safeParse(trimmed).success
    ? null
    : "Please enter a valid 10-digit mobile number.";
}

function pincodeFieldError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return pincodeSchema.safeParse(trimmed).success ? null : "Please enter a valid 6-digit pincode.";
}

function emailFieldError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = emailSchema.safeParse(trimmed);
  return parsed.success ? null : parsed.error.issues[0]?.message ?? "Enter a valid email address";
}

/** Institute/Course names legitimately contain digits sometimes ("B.Tech",
 * "Class 10", "IIT-7") — unlike a name field, so this doesn't strip digits
 * or require letters-only. It only catches the thing actually wrong in the
 * screenshot: a value that's *nothing but* digits, which is never a real
 * institute or course name. Academic Year is deliberately exempt — "2024"
 * or "2023-24" is the normal, correct value there. */
function notPurelyNumericError(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d+$/.test(trimmed) ? `Please enter a valid ${label}.` : null;
}

export const Route = createFileRoute("/_authenticated/student/profile")({
  head: () => ({ meta: [{ title: "My Profile — Hostylia" }] }),
  component: StudentProfilePage,
});

const OPEN_ALLOCATION_STATUSES = [
  "ACTIVE",
  "NOTICE_GIVEN",
  "MOVE_OUT_INSPECTION",
  "PENDING_AGREEMENT",
  "PENDING_PAYMENT",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "view" | "edit";

type KycDoc = { verification_status: string };

// ─── Shared sub-components ────────────────────────────────────────────────────

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

function KycOverallBadge({ docs }: { docs: KycDoc[] }) {
  if (docs.length === 0) return null;
  const hasRejected = docs.some((d) => d.verification_status === "REJECTED");
  const allVerified = docs.every((d) => d.verification_status === "VERIFIED");

  if (hasRejected) {
    return (
      <span className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
        <AlertTriangle className="h-3 w-3" /> Rejected
      </span>
    );
  }
  if (allVerified) {
    return (
      <span className="flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
        <CheckCircle2 className="h-3 w-3" /> Verified
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function StudentProfilePage() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { can } = useStudentPermissions();
  const canEdit = can("profile", "edit");

  // ── Page state ──
  const [mode, setMode] = useState<Mode>("view");
  /** True when edit mode was entered via the photo menu's "Edit" item — only
   * the photo is editable then; every other field stays read-only. */
  const [photoOnlyEdit, setPhotoOnlyEdit] = useState(false);
  const fieldsEditable = mode === "edit" && !photoOnlyEdit;
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [kycDialogOpen, setKycDialogOpen] = useState(false);
  /** Document type picked via a rejected row's "Re-upload" button. */
  const [reuploadType, setReuploadType] = useState<string | undefined>(undefined);
  const [photoViewOpen, setPhotoViewOpen] = useState(false);

  // ── Edit form fields ──
  const [uploading, setUploading] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);

  // Student table fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [academicInstitute, setAcademicInstitute] = useState("");
  const [courseName, setCourseName] = useState("");
  const [academicYear, setAcademicYear] = useState("");

  // Profile table fields
  const [bloodGroup, setBloodGroup] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactNumber, setEmergencyContactNumber] = useState("");
  const [addrLine1, setAddrLine1] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [addrPincode, setAddrPincode] = useState("");

  const [editErrors, setEditErrors] = useState<Record<string, string>>({});

  // Snapshot of the values as last loaded from the DB — the new stricter
  // regex checks below only apply to a field once its value has changed
  // from this snapshot, so a legacy value that predates these rules (e.g.
  // a name containing a digit) never blocks saving an unrelated field.
  const originalRef = useRef({
    fullName: "",
    phone: "",
    email: "",
    academicInstitute: "",
    courseName: "",
    emergencyContactName: "",
    emergencyContactNumber: "",
    city: "",
    state: "",
    pincode: "",
  });

  function setFieldError(key: string, message: string | null) {
    setEditErrors((prev) => {
      if (message === null) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      if (prev[key] === message) return prev;
      return { ...prev, [key]: message };
    });
  }

  // ── Password fields ──
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const captcha = useCaptchaToken();

  // ─── Data queries ─────────────────────────────────────────────────────────

  const studentQ = useQuery({
    queryKey: ["my-profile-record", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, tenant_id, property_id, admission_number, status, full_name, phone, email, date_of_birth, gender, academic_institute, course_name, academic_year, photo_path, joined_at",
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

  const profileQ = useQuery({
    queryKey: ["student-profile-extra", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, blood_group, emergency_contact_name, emergency_contact_number, address, avatar_path, status",
        )
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Called unconditionally here, before the loading/not-found early returns
  // below — the hooks-order rule means this can't live next to
  // `displayAvatarUrl` further down, past those returns.
  const displayAvatarUrl = useAvatarUrl(
    mode === "edit" ? avatarPath : (studentQ.data?.photo_path ?? profileQ.data?.avatar_path),
  );

  const authUserQ = useQuery({
    queryKey: ["student-auth-user", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user;
    },
  });

  const docsQ = useQuery({
    queryKey: ["student-docs", studentQ.data?.id],
    enabled: !!studentQ.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, document_type, original_filename, verification_status, rejection_reason")
        .eq("owner_type", "STUDENT")
        .eq("owner_id", studentQ.data!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // KYC status can change from the Admin/Warden side (approve/reject) while
  // this page is already open — without this, the student would only see
  // the update after a manual reload or the next natural refetch
  // (window refocus past the 30s default staleTime), which reads as
  // "verification isn't working" even though the write succeeded. Also
  // covers a re-upload from another tab/device. Same pattern as
  // useGatePasses in lib/ops.ts.
  const docsChannelId = useId();
  useEffect(() => {
    const sId = studentQ.data?.id;
    if (!sId) return;
    const channel = supabase
      .channel(`student-docs-${sId}-${docsChannelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents", filter: `owner_id=eq.${sId}` },
        () => qc.invalidateQueries({ queryKey: ["student-docs", sId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [studentQ.data?.id, qc, docsChannelId]);

  const propertyQ = useQuery({
    queryKey: ["student-property", studentQ.data?.property_id],
    enabled: !!studentQ.data?.property_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("name")
        .eq("id", studentQ.data!.property_id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const allocQ = useQuery({
    queryKey: ["my-current-allocation", studentQ.data?.id],
    enabled: !!studentQ.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("allocations")
        .select(
          "id, status, bed:beds(code, room:rooms(room_number), floor:floors(name, floor_number), block:blocks(name))",
        )
        .eq("student_id", studentQ.data!.id)
        .in("status", OPEN_ALLOCATION_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // ─── Sync edit form from fetched data ─────────────────────────────────────

  useEffect(() => {
    const s = studentQ.data;
    const p = profileQ.data;
    if (!s || !p) return;

    setFullName(s.full_name ?? "");
    setPhone(s.phone ?? "");
    setEmail(s.email ?? "");
    setDateOfBirth(s.date_of_birth ?? "");
    setGender(s.gender ?? "");
    setAcademicInstitute(s.academic_institute ?? "");
    setCourseName(s.course_name ?? "");
    setAcademicYear(s.academic_year ?? "");

    setBloodGroup(p.blood_group ?? "");
    setEmergencyContactName(p.emergency_contact_name ?? "");
    setEmergencyContactNumber(p.emergency_contact_number ?? "");
    setAvatarPath(s.photo_path || p.avatar_path);

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

    originalRef.current = {
      fullName: s.full_name ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      academicInstitute: s.academic_institute ?? "",
      courseName: s.course_name ?? "",
      emergencyContactName: p.emergency_contact_name ?? "",
      emergencyContactNumber: p.emergency_contact_number ?? "",
      city: addr?.city ?? "",
      state: addr?.state ?? "",
      pincode: addr?.pincode ?? "",
    };
  }, [studentQ.data, profileQ.data]);

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
      const sId = studentQ.data?.id;
      const pId = profileQ.data?.id;
      if (!sId || !pId) throw new Error("Missing profile records");
      const { error: sErr } = await supabase
        .from("students")
        .update({ photo_path: null })
        .eq("id", sId);
      if (sErr) throw sErr;
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ avatar_path: null })
        .eq("id", pId);
      if (pErr) throw pErr;
    },
    onSuccess: () => {
      setAvatarPath(null);
      toast.success("Photo removed");
      qc.invalidateQueries({ queryKey: ["my-profile-record", userId] });
      qc.invalidateQueries({ queryKey: ["student-profile-extra", userId] });
      qc.invalidateQueries({ queryKey: ["own-profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove photo"),
  });

  // ─── Save profile ─────────────────────────────────────────────────────────

  const save = useMutation({
    mutationFn: async () => {
      const sId = studentQ.data?.id;
      const pId = profileQ.data?.id;
      if (!sId || !pId) throw new Error("Missing profile records");

      const parsed = studentSelfProfileSchema.safeParse({
        full_name: fullName,
        phone,
        email,
        date_of_birth: dateOfBirth,
        gender: gender || undefined,
        academic_institute: academicInstitute,
        course_name: courseName,
        academic_year: academicYear,
        blood_group: bloodGroup || undefined,
        emergency_contact_name: emergencyContactName,
        emergency_contact_number: emergencyContactNumber,
        address: { line1: addrLine1, city: addrCity, state: addrState, pincode: addrPincode },
      });

      const fieldErrors: Record<string, string> = {};
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          // Flattened so address.city/state/pincode get their own key
          // instead of all collapsing into one unused "address" entry.
          fieldErrors[issue.path.join(".")] = issue.message;
        }
      }

      // Stricter format checks layered on top of the schema above, applied
      // only to fields that actually changed in this edit — see
      // originalRef's comment. Only overrides a field already flagged by
      // the base schema if this check also finds it invalid, which it will
      // whenever the base schema didn't.
      const orig = originalRef.current;
      if (fullName !== orig.fullName) {
        const err = requiredNameError(fullName);
        if (err) fieldErrors.full_name = err;
      }
      if (emergencyContactName !== orig.emergencyContactName) {
        const err = optionalNameError(emergencyContactName);
        if (err) fieldErrors.emergency_contact_name = err;
      }
      if (phone !== orig.phone) {
        const err = mobileNumberError(phone, true);
        if (err) fieldErrors.phone = err;
      }
      if (emergencyContactNumber !== orig.emergencyContactNumber) {
        const err = mobileNumberError(emergencyContactNumber, false);
        if (err) fieldErrors.emergency_contact_number = err;
      }
      if (addrCity !== orig.city) {
        const err = placeNameError(addrCity);
        if (err) fieldErrors["address.city"] = err;
      }
      if (addrState !== orig.state) {
        const err = placeNameError(addrState);
        if (err) fieldErrors["address.state"] = err;
      }
      if (addrPincode !== orig.pincode) {
        const err = pincodeFieldError(addrPincode);
        if (err) fieldErrors["address.pincode"] = err;
      }
      if (email !== orig.email) {
        const err = emailFieldError(email);
        if (err) fieldErrors.email = err;
      }
      if (academicInstitute !== orig.academicInstitute) {
        const err = notPurelyNumericError(academicInstitute, "institute name");
        if (err) fieldErrors.academic_institute = err;
      }
      if (courseName !== orig.courseName) {
        const err = notPurelyNumericError(courseName, "course name");
        if (err) fieldErrors.course_name = err;
      }

      if (Object.keys(fieldErrors).length > 0) {
        setEditErrors(fieldErrors);
        throw new Error("Please fix the highlighted fields");
      }
      if (!parsed.success) {
        // Base schema failed but none of the issues mapped to a check above
        // (shouldn't happen given the field set, but fail safe rather than
        // silently proceed with unparsed data).
        throw new Error("Please fix the highlighted fields");
      }
      setEditErrors({});
      const d = parsed.data;

      // Update students table
      const { error: sErr } = await supabase
        .from("students")
        .update({
          full_name: d.full_name,
          phone: d.phone,
          email: d.email || null,
          date_of_birth: d.date_of_birth || null,
          gender: d.gender || null,
          academic_institute: d.academic_institute || null,
          course_name: d.course_name || null,
          academic_year: d.academic_year || null,
          photo_path: avatarPath,
        })
        .eq("id", sId);
      if (sErr) throw sErr;

      // Update profiles table
      const hasAddress = d.address && Object.values(d.address).some((v) => v);
      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          full_name: d.full_name, // keep synced
          phone: d.phone,
          email: d.email || null,
          date_of_birth: d.date_of_birth || null,
          gender: d.gender || null,
          blood_group: d.blood_group || null,
          emergency_contact_name: d.emergency_contact_name || null,
          emergency_contact_number: d.emergency_contact_number || null,
          address: hasAddress ? d.address : null,
          avatar_path: avatarPath, // keep synced
        })
        .eq("id", pId);
      if (pErr) throw pErr;
    },
    onSuccess: () => {
      toast.success("Profile updated successfully");
      qc.invalidateQueries({ queryKey: ["my-profile-record", userId] });
      qc.invalidateQueries({ queryKey: ["student-profile-extra", userId] });
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
      if (!captcha.token) {
        throw new Error("Complete the captcha to continue.");
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user?.email) {
        throw new Error("Could not verify your account. Please sign in again.");
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: parsed.data.currentPassword,
        options: { captchaToken: captcha.token },
      });
      if (signInErr) {
        captcha.reset();
        setPwErrors({ currentPassword: "Current password is incorrect" });
        throw new Error("Current password is incorrect");
      }

      const { error: updateErr } = await supabase.auth.updateUser({
        password: parsed.data.password,
      });
      if (updateErr) {
        captcha.reset();
        throw updateErr;
      }
    },
    onSuccess: () => {
      toast.success("Password changed successfully");
      captcha.reset();
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
    const s = studentQ.data;
    const p = profileQ.data;
    if (s && p) {
      setFullName(s.full_name ?? "");
      setPhone(s.phone ?? "");
      setEmail(s.email ?? "");
      setDateOfBirth(s.date_of_birth ?? "");
      setGender(s.gender ?? "");
      setAcademicInstitute(s.academic_institute ?? "");
      setCourseName(s.course_name ?? "");
      setAcademicYear(s.academic_year ?? "");

      setBloodGroup(p.blood_group ?? "");
      setEmergencyContactName(p.emergency_contact_name ?? "");
      setEmergencyContactNumber(p.emergency_contact_number ?? "");
      setAvatarPath(s.photo_path || p.avatar_path);

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

  if (studentQ.isLoading || profileQ.isLoading) {
    return (
      <StudentModuleGuard module="profile">
        <div className="max-w-4xl space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </StudentModuleGuard>
    );
  }

  if (!studentQ.data || !profileQ.data) {
    return (
      <StudentModuleGuard module="profile">
        <p className="rounded-2xl border border-dashed border-border/80 bg-card p-6 text-sm text-muted-foreground">
          No student record is linked to your account yet.
        </p>
      </StudentModuleGuard>
    );
  }

  // ─── Derived values ───────────────────────────────────────────────────────

  const s = studentQ.data;
  const prof = profileQ.data;
  const docs = docsQ.data ?? [];
  const authUser = authUserQ.data;

  const bed = allocQ.data?.bed as
    | {
        code: string;
        room: { room_number: string } | null;
        floor: { name: string; floor_number: number | null } | null;
        block: { name: string } | null;
      }
    | null
    | undefined;

  const propertyName = propertyQ.data?.name ?? "—";
  const blockName = bed?.block?.name ?? "—";
  const roomNumber = bed?.room?.room_number ?? "—";
  const bedCode = bed?.code ?? "—";
  const blockAndRoom = bed
    ? `${blockName !== "—" ? blockName + " Block" : "—"} · ${roomNumber}`
    : "Not allocated";

  const isActive = s.status === "ACTIVE";
  const initial = (mode === "edit" ? fullName : s.full_name).trim()[0]?.toUpperCase() ?? "S";

  const isEmailVerified = !!authUser?.email_confirmed_at;
  const lastLogin = authUser?.last_sign_in_at
    ? new Date(authUser.last_sign_in_at).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const kycRejected = docs.some((d) => d.verification_status === "REJECTED");
  // Same rule as KycUploadForm: the form is open only while nothing is
  // pending review or verified, so only then does "Re-upload" have a target.
  const canReupload = !docs.some(
    (d) => d.verification_status === "PENDING" || d.verification_status === "VERIFIED",
  );

  const dobFormatted = s.date_of_birth
    ? new Date(s.date_of_birth).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : undefined;

  const genderDisplay =
    s.gender === "MALE"
      ? "Male"
      : s.gender === "FEMALE"
        ? "Female"
        : s.gender === "OTHER"
          ? "Other"
          : (s.gender ?? undefined);

  const joiningFormatted = s.joined_at
    ? new Date(s.joined_at).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : undefined;

  const addrDisplay = (() => {
    const addr = (prof.address ?? null) as {
      line1?: string;
      city?: string;
      state?: string;
      pincode?: string;
    } | null;
    if (!addr) return null;
    return [addr.line1, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ") || null;
  })();

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <StudentModuleGuard module="profile">
      <div className="flex flex-col gap-4 pb-8 max-w-300">
        {/* ══════════════════════════════════════════════════
            PROFILE HEADER
        ══════════════════════════════════════════════════ */}
        <Card className="overflow-hidden rounded-2xl border-border/80 py-0 shadow-card-ambient">
          <CardContent className="relative flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent"
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
                        <AvatarImage src={displayAvatarUrl} alt={s.full_name} />
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
                  {s.full_name}
                </p>
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  Student
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
                  <p className="flex items-center gap-1.5">
                    <User className="h-3 w-3 shrink-0" />
                    ID: <span className="font-medium text-foreground">{s.admission_number}</span>
                  </p>
                  {propertyName !== "—" && (
                    <p className="flex items-center gap-1.5">
                      <Building2 className="h-3 w-3 shrink-0" />
                      <span className="font-medium text-foreground">{propertyName}</span>
                    </p>
                  )}
                  <p className="flex items-center gap-1.5">
                    <BedDouble className="h-3 w-3 shrink-0" />
                    <span className="font-medium text-foreground">{blockAndRoom}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Header buttons */}
            <div className="relative flex shrink-0 gap-2">
              {mode === "view" ? (
                <Button
                  size="sm"
                  id="student-profile-edit-btn"
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
                    id="student-profile-save-btn"
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
          {/* ── PERSONAL INFORMATION ── */}
          <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
            <SectionHeader icon={User} title="Personal Information" tone="info" />
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1 px-5 pb-5 pt-1">
              {fieldsEditable ? (
                <>
                  <EditField
                    label="Full Name"
                    htmlFor="s-name"
                    error={editErrors.full_name}
                    className="py-1"
                  >
                    <Input
                      id="s-name"
                      value={fullName}
                      maxLength={120}
                      onChange={(e) => {
                        const v = sanitizeNameKeystroke(e.target.value);
                        setFullName(v);
                        if (editErrors.full_name) setFieldError("full_name", requiredNameError(v));
                      }}
                      onBlur={() => {
                        if (fullName !== originalRef.current.fullName)
                          setFieldError("full_name", requiredNameError(fullName));
                      }}
                      className="h-8 text-sm"
                    />
                  </EditField>
                  <FieldRow icon={Lock} label="Student ID" value={s.admission_number} />

                  <EditField
                    label="Date of Birth"
                    htmlFor="s-dob"
                    error={editErrors.date_of_birth}
                    className="py-1"
                  >
                    <Input
                      id="s-dob"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </EditField>

                  <EditField
                    label="Gender"
                    htmlFor="s-gender"
                    error={editErrors.gender}
                    className="py-1"
                  >
                    <Select value={gender} onValueChange={setGender}>
                      <SelectTrigger id="s-gender" className="h-8 text-sm">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MALE">Male</SelectItem>
                        <SelectItem value="FEMALE">Female</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </EditField>

                  <EditField
                    label="Mobile Number"
                    htmlFor="s-phone"
                    error={editErrors.phone}
                    className="py-1"
                  >
                    <Input
                      id="s-phone"
                      type="tel"
                      inputMode="tel"
                      value={phone}
                      maxLength={10}
                      onChange={(e) => {
                        const v = sanitizeIndianPhoneInput(e.target.value);
                        setPhone(v);
                        if (editErrors.phone) setFieldError("phone", mobileNumberError(v, true));
                      }}
                      onBlur={() => {
                        if (phone !== originalRef.current.phone)
                          setFieldError("phone", mobileNumberError(phone, true));
                      }}
                      placeholder="+91 98765 43210"
                      className="h-8 text-sm"
                    />
                  </EditField>

                  <EditField
                    label="Email"
                    htmlFor="s-email"
                    error={editErrors.email}
                    className="py-1"
                  >
                    <Input
                      id="s-email"
                      type="email"
                      value={email}
                      maxLength={255}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEmail(v);
                        if (editErrors.email) setFieldError("email", emailFieldError(v));
                      }}
                      onBlur={() => {
                        if (email !== originalRef.current.email)
                          setFieldError("email", emailFieldError(email));
                      }}
                      className="h-8 text-sm"
                    />
                  </EditField>

                  <EditField
                    label="Blood Group"
                    htmlFor="s-blood"
                    error={editErrors.blood_group}
                    className="py-1"
                  >
                    <Select value={bloodGroup} onValueChange={setBloodGroup}>
                      <SelectTrigger id="s-blood" className="h-8 text-sm">
                        <SelectValue placeholder="Select" />
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
                </>
              ) : (
                <>
                  <FieldRow icon={UserRoundPen} label="Full Name" value={s.full_name} />
                  <FieldRow icon={Lock} label="Student ID" value={s.admission_number} />
                  <FieldRow icon={CalendarDays} label="Date of Birth" value={dobFormatted} />
                  <FieldRow icon={User} label="Gender" value={genderDisplay} />
                  <FieldRow icon={Phone} label="Mobile Number" value={s.phone} />
                  <FieldRow icon={Mail} label="Email" value={s.email} />
                  <FieldRow icon={Droplet} label="Blood Group" value={prof.blood_group} />
                </>
              )}
            </CardContent>
          </Card>

          {/* ── ACADEMIC INFORMATION ── */}
          <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
            <SectionHeader icon={GraduationCap} title="Academic Information" tone="success" />
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1 px-5 pb-5 pt-1">
              {fieldsEditable ? (
                <>
                  <EditField
                    label="Institute"
                    htmlFor="s-inst"
                    error={editErrors.academic_institute}
                    className="py-1 col-span-1 sm:col-span-2"
                  >
                    <Input
                      id="s-inst"
                      value={academicInstitute}
                      maxLength={160}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAcademicInstitute(v);
                        if (editErrors.academic_institute)
                          setFieldError("academic_institute", notPurelyNumericError(v, "institute name"));
                      }}
                      onBlur={() => {
                        if (academicInstitute !== originalRef.current.academicInstitute)
                          setFieldError(
                            "academic_institute",
                            notPurelyNumericError(academicInstitute, "institute name"),
                          );
                      }}
                      className="h-8 text-sm"
                    />
                  </EditField>
                  <EditField
                    label="Course"
                    htmlFor="s-course"
                    error={editErrors.course_name}
                    className="py-1"
                  >
                    <Input
                      id="s-course"
                      value={courseName}
                      maxLength={160}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCourseName(v);
                        if (editErrors.course_name)
                          setFieldError("course_name", notPurelyNumericError(v, "course name"));
                      }}
                      onBlur={() => {
                        if (courseName !== originalRef.current.courseName)
                          setFieldError("course_name", notPurelyNumericError(courseName, "course name"));
                      }}
                      className="h-8 text-sm"
                    />
                  </EditField>
                  <EditField
                    label="Academic Year / Batch"
                    htmlFor="s-batch"
                    error={editErrors.academic_year}
                    className="py-1"
                  >
                    <Input
                      id="s-batch"
                      value={academicYear}
                      maxLength={40}
                      onChange={(e) => setAcademicYear(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </EditField>
                </>
              ) : (
                <>
                  <div className="col-span-1 sm:col-span-2">
                    <FieldRow icon={Building2} label="Institute" value={s.academic_institute} />
                  </div>
                  <FieldRow icon={BookOpen} label="Course" value={s.course_name} />
                  <FieldRow
                    icon={CalendarDays}
                    label="Academic Year / Batch"
                    value={s.academic_year}
                  />
                </>
              )}
            </CardContent>
          </Card>

          {/* ── PARENT/GUARDIAN & ADDRESS ── */}
          <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
            <SectionHeader icon={Phone} title="Emergency Contact & Address" tone="warning" />
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1 px-5 pb-5 pt-1">
              {fieldsEditable ? (
                <>
                  <EditField
                    label="Emergency Contact Name"
                    htmlFor="s-ecname"
                    error={editErrors.emergency_contact_name}
                    className="py-1"
                  >
                    <Input
                      id="s-ecname"
                      value={emergencyContactName}
                      maxLength={120}
                      onChange={(e) => {
                        const v = sanitizeNameKeystroke(e.target.value);
                        setEmergencyContactName(v);
                        if (editErrors.emergency_contact_name)
                          setFieldError("emergency_contact_name", optionalNameError(v));
                      }}
                      onBlur={() => {
                        if (emergencyContactName !== originalRef.current.emergencyContactName)
                          setFieldError(
                            "emergency_contact_name",
                            optionalNameError(emergencyContactName),
                          );
                      }}
                      className="h-8 text-sm"
                    />
                  </EditField>
                  <EditField
                    label="Emergency Contact Phone"
                    htmlFor="s-ecphone"
                    error={editErrors.emergency_contact_number}
                    className="py-1"
                  >
                    <Input
                      id="s-ecphone"
                      type="tel"
                      inputMode="tel"
                      value={emergencyContactNumber}
                      maxLength={10}
                      onChange={(e) => {
                        const v = sanitizeIndianPhoneInput(e.target.value);
                        setEmergencyContactNumber(v);
                        if (editErrors.emergency_contact_number)
                          setFieldError("emergency_contact_number", mobileNumberError(v, false));
                      }}
                      onBlur={() => {
                        if (emergencyContactNumber !== originalRef.current.emergencyContactNumber)
                          setFieldError(
                            "emergency_contact_number",
                            mobileNumberError(emergencyContactNumber, false),
                          );
                      }}
                      placeholder="+91 98765 43210"
                      className="h-8 text-sm"
                    />
                  </EditField>

                  <div className="col-span-1 sm:col-span-2">
                    <EditField
                      label="Address"
                      htmlFor="s-addr1"
                      error={editErrors["address.line1"]}
                      className="py-1"
                    >
                      <Input
                        id="s-addr1"
                        placeholder="Street address"
                        value={addrLine1}
                        maxLength={200}
                        onChange={(e) => setAddrLine1(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </EditField>
                  </div>

                  <EditField
                    label="City"
                    htmlFor="s-city"
                    error={editErrors["address.city"]}
                    className="py-1"
                  >
                    <Input
                      id="s-city"
                      value={addrCity}
                      maxLength={80}
                      onChange={(e) => {
                        const v = sanitizeNameKeystroke(e.target.value);
                        setAddrCity(v);
                        if (editErrors["address.city"]) setFieldError("address.city", placeNameError(v));
                      }}
                      onBlur={() => {
                        if (addrCity !== originalRef.current.city)
                          setFieldError("address.city", placeNameError(addrCity));
                      }}
                      className="h-8 text-sm"
                    />
                  </EditField>
                  <EditField
                    label="State"
                    htmlFor="s-state"
                    error={editErrors["address.state"]}
                    className="py-1"
                  >
                    <Input
                      id="s-state"
                      value={addrState}
                      maxLength={80}
                      onChange={(e) => {
                        const v = sanitizeNameKeystroke(e.target.value);
                        setAddrState(v);
                        if (editErrors["address.state"])
                          setFieldError("address.state", placeNameError(v));
                      }}
                      onBlur={() => {
                        if (addrState !== originalRef.current.state)
                          setFieldError("address.state", placeNameError(addrState));
                      }}
                      className="h-8 text-sm"
                    />
                  </EditField>
                  <EditField
                    label="Pincode"
                    htmlFor="s-pin"
                    error={editErrors["address.pincode"]}
                    className="py-1"
                  >
                    <Input
                      id="s-pin"
                      type="tel"
                      inputMode="numeric"
                      value={addrPincode}
                      maxLength={6}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setAddrPincode(v);
                        if (editErrors["address.pincode"])
                          setFieldError("address.pincode", pincodeFieldError(v));
                      }}
                      onBlur={() => {
                        if (addrPincode !== originalRef.current.pincode)
                          setFieldError("address.pincode", pincodeFieldError(addrPincode));
                      }}
                      className="h-8 text-sm"
                    />
                  </EditField>
                </>
              ) : (
                <>
                  <FieldRow
                    icon={User}
                    label="Emergency Contact Name"
                    value={prof.emergency_contact_name}
                  />
                  <FieldRow
                    icon={Phone}
                    label="Emergency Contact Phone"
                    value={prof.emergency_contact_number}
                  />
                  <div className="col-span-1 sm:col-span-2">
                    <FieldRow icon={MapPin} label="Address" value={addrDisplay} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* ── ACCOUNT & SECURITY (INCLUDES KYC ROW) ── */}
          <div className="flex flex-col gap-4">
            <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
              <SectionHeader icon={ShieldCheck} title="KYC Documents" tone="info" />
              <CardContent className="px-5 pb-5 pt-1">
                {docsQ.isLoading ? (
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading KYC status…
                  </div>
                ) : docsQ.isError ? (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                    <span className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      Could not load KYC status.
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => docsQ.refetch()}
                    >
                      <RotateCcw className="h-4 w-4" /> Retry
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setKycDialogOpen(true)}
                    className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-muted/30 p-3 text-left transition-colors hover:bg-muted/50 mt-2"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {docs.length === 0 ? "No documents submitted yet" : "View KYC documents"}
                    </span>
                    <KycOverallBadge docs={docs} />
                  </button>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
              <SectionHeader icon={ShieldCheck} title="Account & Security" tone="warning" />
              <CardContent className="flex flex-col divide-y divide-border/40 px-5 pb-4 pt-1">
                <div className="flex flex-col gap-0.5 py-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" />
                    Auth Email
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                    {s.email ?? "—"}
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

                <FieldRow icon={Clock} label="Last Login" value={lastLogin} />
                <FieldRow
                  icon={ShieldCheck}
                  label="Account Status"
                  value={
                    <span
                      className={
                        isActive
                          ? "font-semibold text-emerald-500"
                          : "font-semibold text-muted-foreground"
                      }
                    >
                      {isActive ? "Active" : s.status}
                    </span>
                  }
                />

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
                      id="student-profile-toggle-pw-btn"
                      onClick={() => setShowPasswordForm((v) => !v)}
                      className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                    >
                      {showPasswordForm ? (
                        <>
                          <ChevronUp className="h-3.5 w-3.5" /> Hide Password Form
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3.5 w-3.5" /> Change Password
                        </>
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
                      <Label
                        htmlFor="pw-current"
                        className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                      >
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
                      <Label
                        htmlFor="pw-new"
                        className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                      >
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
                      <Label
                        htmlFor="pw-confirm"
                        className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                      >
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

                    <TurnstileWidget key={captcha.key} onToken={captcha.setToken} />

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
                        <X className="h-3.5 w-3.5" /> Cancel
                      </Button>
                      <Button
                        size="sm"
                        id="student-profile-update-password-btn"
                        className="h-8 text-xs"
                        disabled={
                          changePassword.isPending ||
                          !currentPassword ||
                          !newPassword ||
                          !confirmPassword ||
                          !captcha.token
                        }
                        onClick={() => changePassword.mutate()}
                      >
                        {changePassword.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="h-3.5 w-3.5" />
                        )}{" "}
                        Update Password
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── KYC Dialog ─────────────────────────────────────────────────── */}
        <Dialog open={kycDialogOpen} onOpenChange={setKycDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>KYC documents</DialogTitle>
            </DialogHeader>
            {docs.length > 0 && (
              <div className="space-y-2">
                {docs.map((doc) => {
                  const rejected = doc.verification_status === "REJECTED";
                  return (
                    <div
                      key={doc.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-3"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {doc.document_type.replace(/_/g, " ")}
                          </p>
                          {rejected && (
                            <p className="mt-0.5 text-xs text-destructive">
                              Reason: {doc.rejection_reason?.trim() || "Not specified"}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            rejected
                              ? "bg-destructive/15 text-destructive"
                              : doc.verification_status === "VERIFIED"
                                ? "bg-success/15 text-success"
                                : "bg-warning/15 text-warning"
                          }
                        >
                          {doc.verification_status.replace(/_/g, " ")}
                        </Badge>
                        {rejected && canEdit && canReupload && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReuploadType(doc.document_type)}
                          >
                            <Upload className="h-4 w-4" /> Re-upload
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {canEdit ? (
              <>
                {kycRejected && (
                  <p className="text-xs text-destructive">
                    Your last submission was rejected — please upload again.
                  </p>
                )}
                <KycUploadForm
                  key={reuploadType ?? "default"}
                  tenantId={s.tenant_id}
                  propertyId={s.property_id}
                  studentId={s.id}
                  existingDocs={docs}
                  initialDocType={reuploadType}
                  onUploaded={() => {
                    setReuploadType(undefined);
                    docsQ.refetch();
                  }}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                You have read-only access to KYC documents.
              </p>
            )}
          </DialogContent>
        </Dialog>

        {/* ── View Photo dialog ── */}
        <Dialog open={photoViewOpen} onOpenChange={setPhotoViewOpen}>
          <DialogContent className="flex flex-col items-center gap-4">
            <DialogHeader>
              <DialogTitle>Profile photo</DialogTitle>
            </DialogHeader>
            {displayAvatarUrl && (
              <img
                src={displayAvatarUrl}
                alt={s.full_name}
                className="max-h-[60vh] w-full rounded-xl object-contain"
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </StudentModuleGuard>
  );
}
