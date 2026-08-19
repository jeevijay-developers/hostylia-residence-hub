import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2, Save } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { FormSkeleton } from "@/components/dashboard/FormSkeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

export const Route = createFileRoute("/_authenticated/warden/profile/edit")({
  head: () => ({ meta: [{ title: "Edit Profile — Hostylia" }] }),
  component: WardenProfileEditPage,
});

function WardenProfileEditPage() {
  const { data: resolved } = useResolvedRole();
  const userId = resolved?.userId ?? null;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      navigate({ to: "/warden/profile" });
    },
    onError: (e) => {
      if (e instanceof Error && e.message !== "Please fix the highlighted fields") {
        toast.error(e.message);
      } else if (e instanceof Error) {
        toast.error(e.message);
      }
    },
  });

  if (profileQ.isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Edit Profile" description="Update your personal details" />
        <FormSkeleton fields={5} />
      </div>
    );
  }

  const initial = fullName.trim()[0]?.toUpperCase() ?? "W";
  const avatarUrl = avatarPath
    ? supabase.storage.from("avatars").getPublicUrl(avatarPath).data.publicUrl
    : undefined;

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader title="Edit Profile" description="Update your personal details" />

      <Card className="gap-3 py-4">
        <CardContent className="flex items-center gap-4 px-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={avatarUrl} alt={fullName} />
            <AvatarFallback className="text-lg">{initial}</AvatarFallback>
          </Avatar>
          <div>
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
              Change photo
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Required details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-3 gap-y-3 px-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="w-name" className="text-xs">
              Full Name
            </Label>
            <Input
              id="w-name"
              className="h-9"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            {errors.fullName ? <p className="text-xs text-destructive">{errors.fullName}</p> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="w-phone" className="text-xs">
              Mobile Number
            </Label>
            <Input
              id="w-phone"
              className="h-9"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            {errors.phone ? <p className="text-xs text-destructive">{errors.phone}</p> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="w-email" className="text-xs">
              Email
            </Label>
            <Input
              id="w-email"
              type="email"
              className="h-9"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="w-ecname" className="text-xs">
              Emergency Contact Name
            </Label>
            <Input
              id="w-ecname"
              className="h-9"
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
            />
            {errors.emergencyContactName ? (
              <p className="text-xs text-destructive">{errors.emergencyContactName}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="w-ecnumber" className="text-xs">
              Emergency Contact Number
            </Label>
            <Input
              id="w-ecnumber"
              className="h-9"
              value={emergencyContactNumber}
              onChange={(e) => setEmergencyContactNumber(e.target.value)}
            />
            {errors.emergencyContactNumber ? (
              <p className="text-xs text-destructive">{errors.emergencyContactNumber}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Optional details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-3 gap-y-3 px-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="w-altphone" className="text-xs">
              Alternate Mobile Number
            </Label>
            <Input
              id="w-altphone"
              className="h-9"
              value={alternatePhone}
              onChange={(e) => setAlternatePhone(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="w-dob" className="text-xs">
              Date of Birth
            </Label>
            <Input
              id="w-dob"
              type="date"
              className="h-9"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="w-gender" className="text-xs">
              Gender
            </Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger id="w-gender" className="h-9">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MALE">Male</SelectItem>
                <SelectItem value="FEMALE">Female</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="w-blood" className="text-xs">
              Blood Group
            </Label>
            <Select value={bloodGroup} onValueChange={setBloodGroup}>
              <SelectTrigger id="w-blood" className="h-9">
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
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="w-addr1" className="text-xs">
              Address line
            </Label>
            <Input
              id="w-addr1"
              className="h-9"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="w-city" className="text-xs">
              City
            </Label>
            <Input
              id="w-city"
              className="h-9"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="w-state" className="text-xs">
              State
            </Label>
            <Input
              id="w-state"
              className="h-9"
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="w-pincode" className="text-xs">
              Pincode
            </Label>
            <Input
              id="w-pincode"
              className="h-9"
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
            />
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
