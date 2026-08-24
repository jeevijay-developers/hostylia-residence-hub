import { useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  Calendar,
  Camera,
  Droplet,
  Loader2,
  LogOut,
  Lock,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  User,
  type LucideIcon,
} from "lucide-react";

import { SignOutDialog } from "@/components/dashboard/SignOutDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/warden/profile/")({
  head: () => ({ meta: [{ title: "My Profile — Hostylia" }] }),
  component: WardenProfilePage,
});

interface WardenAssignment {
  id: string;
  employee_id: string | null;
  property_id: string | null;
  block_id: string | null;
  granted_at: string;
  property_name: string | null;
  block_name: string | null;
}

function useWardenProfile(userId: string | null) {
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

  const assignmentsQ = useQuery({
    queryKey: ["warden-assignments", userId],
    enabled: !!userId,
    queryFn: async (): Promise<WardenAssignment[]> => {
      const { data: assignments, error } = await supabase
        .from("role_assignments")
        .select("id, employee_id, property_id, block_id, granted_at, properties(name)")
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
        property_name: (a.properties as { name: string } | null)?.name ?? null,
        block_name: a.block_id ? (blockNames.get(a.block_id) ?? null) : null,
      }));
    },
  });

  return { profileQ, assignmentsQ };
}

function FieldBox({
  icon: Icon,
  label,
  error,
  children,
}: {
  icon: LucideIcon;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1 rounded-xl border border-border/60 bg-muted/30 p-3">
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const fieldInputClass =
  "h-auto border-0 bg-transparent p-0 text-sm font-medium text-foreground shadow-none focus-visible:ring-0";

function ReadOnlyValue({ value }: { value: ReactNode }) {
  return <p className="text-sm font-medium text-foreground">{value || "—"}</p>;
}

function WardenProfilePage() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;
  const qc = useQueryClient();
  const { profileQ, assignmentsQ } = useWardenProfile(userId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactNumber, setEmergencyContactNumber] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<string>("");
  const [bloodGroup, setBloodGroup] = useState<string>("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");

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
    setLine1(addr?.line1 ?? "");
    setCity(addr?.city ?? "");
    setState(addr?.state ?? "");
    setPincode(addr?.pincode ?? "");
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
        address: { line1, city, state, pincode },
      });
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
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["warden-profile", userId] });
      qc.invalidateQueries({ queryKey: ["warden-assignments", userId] });
    },
    onError: (e) => {
      if (e instanceof Error && e.message !== "Please fix the highlighted fields") {
        toast.error(e.message);
      }
    },
  });

  if (profileQ.isLoading || assignmentsQ.isLoading) {
    return (
      <div className="max-w-4xl space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (!profileQ.data) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">Could not load your profile.</p>
      </div>
    );
  }

  const assignments = assignmentsQ.data ?? [];
  const primary = assignments[0];
  const properties = Array.from(new Set(assignments.map((a) => a.property_name).filter(Boolean)));
  const blocks = Array.from(new Set(assignments.map((a) => a.block_name).filter(Boolean)));
  const initial = fullName.trim()[0]?.toUpperCase() ?? "W";
  const avatarUrl = avatarPath
    ? supabase.storage.from("avatars").getPublicUrl(avatarPath).data.publicUrl
    : undefined;
  const p = profileQ.data;

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
            disabled={uploading}
            aria-label="Change profile photo"
            title="Change profile photo"
            className="group relative h-16 w-16 shrink-0 cursor-pointer rounded-full sm:h-20 sm:w-20"
          >
            <Avatar className="h-16 w-16 ring-2 ring-primary/30 sm:h-20 sm:w-20">
              <AvatarImage src={avatarUrl} alt={fullName} />
              <AvatarFallback className="bg-primary/15 text-xl font-bold text-primary sm:text-2xl">
                {initial}
              </AvatarFallback>
            </Avatar>
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              ) : (
                <Camera className="h-5 w-5 text-white" />
              )}
            </span>
            <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-card bg-success sm:h-3.5 sm:w-3.5" />
          </button>
          <div className="relative min-w-0 flex-1">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              aria-label="Full name"
              className="h-auto truncate border-0 bg-transparent p-0 text-lg font-bold text-foreground shadow-none focus-visible:ring-0 sm:text-xl"
            />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
            <p className="text-sm font-medium text-muted-foreground">
              {primary?.employee_id ?? "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
        <CardHeader className="flex-row items-center gap-2 space-y-0 px-5 pt-5 sm:px-6">
          <span className="h-4 w-1 shrink-0 rounded-full bg-info" aria-hidden="true" />
          <CardTitle className="text-base">Contact & identity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 px-5 pb-5 pt-4 sm:grid-cols-2 sm:px-6 sm:pb-6">
          <FieldBox icon={Lock} label="Employee ID">
            <ReadOnlyValue value={primary?.employee_id} />
          </FieldBox>
          <FieldBox icon={Lock} label="Role">
            <ReadOnlyValue value="Warden" />
          </FieldBox>
          <FieldBox icon={Phone} label="Mobile Number" error={errors.phone}>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={fieldInputClass}
            />
          </FieldBox>
          <FieldBox icon={Mail} label="Email" error={errors.email}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldInputClass}
            />
          </FieldBox>
          <FieldBox icon={Building2} label="Assigned Property">
            <ReadOnlyValue value={properties.join(", ") || "All properties"} />
          </FieldBox>
          <FieldBox icon={Building2} label="Assigned Block(s)">
            <ReadOnlyValue value={blocks.join(", ") || "All blocks"} />
          </FieldBox>
          <FieldBox icon={User} label="Emergency Contact Name" error={errors.emergencyContactName}>
            <Input
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
              className={fieldInputClass}
            />
          </FieldBox>
          <FieldBox
            icon={Phone}
            label="Emergency Contact Number"
            error={errors.emergencyContactNumber}
          >
            <Input
              value={emergencyContactNumber}
              onChange={(e) => setEmergencyContactNumber(e.target.value)}
              className={fieldInputClass}
            />
          </FieldBox>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/80 py-0 shadow-card-ambient">
        <CardHeader className="flex-row items-center gap-2 space-y-0 px-5 pt-5 sm:px-6">
          <span className="h-4 w-1 shrink-0 rounded-full bg-warning" aria-hidden="true" />
          <CardTitle className="text-base">Additional details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 px-5 pb-5 pt-4 sm:grid-cols-2 sm:px-6 sm:pb-6">
          <FieldBox icon={Phone} label="Alternate Mobile Number">
            <Input
              value={alternatePhone}
              onChange={(e) => setAlternatePhone(e.target.value)}
              className={fieldInputClass}
            />
          </FieldBox>
          <FieldBox icon={Calendar} label="Date of Birth">
            <Input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className={fieldInputClass}
            />
          </FieldBox>
          <FieldBox icon={User} label="Gender">
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger className="h-auto border-0 bg-transparent p-0 text-sm font-medium shadow-none focus:ring-0">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </FieldBox>
          <FieldBox icon={Droplet} label="Blood Group">
            <Select value={bloodGroup} onValueChange={setBloodGroup}>
              <SelectTrigger className="h-auto border-0 bg-transparent p-0 text-sm font-medium shadow-none focus:ring-0">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((bg) => (
                  <SelectItem key={bg} value={bg}>
                    {bg}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldBox>
          <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FieldBox icon={MapPin} label="Address">
              <Input
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
                placeholder="Address line"
                className={fieldInputClass}
              />
            </FieldBox>
            <FieldBox icon={MapPin} label="City">
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className={fieldInputClass}
              />
            </FieldBox>
            <FieldBox icon={MapPin} label="State">
              <Input
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="State"
                className={fieldInputClass}
              />
            </FieldBox>
          </div>
          <FieldBox icon={MapPin} label="Pincode">
            <Input
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              placeholder="Pincode"
              className={fieldInputClass}
            />
          </FieldBox>
          <FieldBox icon={Calendar} label="Joining Date">
            <ReadOnlyValue
              value={
                primary?.granted_at ? new Date(primary.granted_at).toLocaleDateString() : undefined
              }
            />
          </FieldBox>
          <FieldBox icon={ShieldCheck} label="Account Status">
            <Badge
              variant={p.status === "ACTIVE" ? "default" : "secondary"}
              className={
                p.status === "ACTIVE"
                  ? "bg-warning text-warning-foreground hover:bg-warning"
                  : undefined
              }
            >
              {p.status}
            </Badge>
          </FieldBox>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || !fullName.trim()}
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

      <SignOutDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        title="Logout?"
        confirmLabel="Logout"
      />
    </div>
  );
}
