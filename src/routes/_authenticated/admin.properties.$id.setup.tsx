import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Save, Upload } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { propertyFormSchema, type PropertyFormInput } from "@/schemas/hostel";

export const Route = createFileRoute("/_authenticated/admin/properties/$id/setup")({
  head: () => ({ meta: [{ title: "Property setup — Hostylia" }] }),
  component: PropertySetupPage,
});

const STEPS = ["Basics", "Address", "Branding"] as const;

/**
 * Mirrors the slug rule in schemas/hostel.ts (`^[a-z0-9-]+$`, 2–64 chars) so the
 * generated value can never fail validation the user didn't cause.
 */
function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function PropertySetupPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  /**
   * The slug tracks the property name until someone edits it by hand, then it
   * stops following. Public admission links are built from it, so a silent
   * rewrite after the link has been shared would break it.
   */
  const [isSlugEdited, setIsSlugEdited] = useState(false);

  const propertyQ = useQuery({
    queryKey: ["property", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<PropertyFormInput>({
    name: "",
    slug: "",
    property_type: "HOSTEL",
    gender_policy: "COED",
    address_line_1: "",
    address_line_2: "",
    landmark: "",
    city: "",
    state: "",
    postal_code: "",
    country_code: "IN",
    timezone: "Asia/Kolkata",
    phone: "",
    email: "",
    logo_path: "",
  });

  useEffect(() => {
    if (propertyQ.data) {
      const p = propertyQ.data;
      // A stored slug that already differs from the name was chosen deliberately;
      // keep following the name only while the two still agree.
      setIsSlugEdited(p.slug !== slugify(p.name));
      setForm({
        name: p.name,
        slug: p.slug,
        property_type: p.property_type as PropertyFormInput["property_type"],
        gender_policy: p.gender_policy as PropertyFormInput["gender_policy"],
        address_line_1: p.address_line_1,
        address_line_2: p.address_line_2 ?? "",
        landmark: p.landmark ?? "",
        city: p.city,
        state: p.state,
        postal_code: p.postal_code,
        country_code: p.country_code,
        timezone: p.timezone,
        phone: p.phone ?? "",
        email: p.email ?? "",
        logo_path: p.logo_path ?? "",
      });
    }
  }, [propertyQ.data]);

  const saveMut = useMutation({
    mutationFn: async (patch: Partial<PropertyFormInput>) => {
      const parsed = propertyFormSchema.partial().parse(patch);
      const { error } = await supabase
        .from("properties")
        .update(parsed)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property", id] });
      qc.invalidateQueries({ queryKey: ["admin-properties"] });
      toast.success("Saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const finishMut = useMutation({
    mutationFn: async (values: PropertyFormInput) => {
      const parsed = propertyFormSchema.partial().parse(values);
      const { error } = await supabase
        .from("properties")
        .update({ ...parsed, status: "ACTIVE" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property", id] });
      qc.invalidateQueries({ queryKey: ["admin-properties"] });
      toast.success("Property setup complete");
      nav({ to: "/admin/properties" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not finish setup"),
  });

  function set<K extends keyof PropertyFormInput>(k: K, v: PropertyFormInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleLogoUpload(file: File) {
    if (!propertyQ.data) return;
    const tenantId = propertyQ.data.tenant_id;
    const path = `${tenantId}/${id}/logo/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from("property-public-assets")
      .upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    set("logo_path", path);
    await saveMut.mutateAsync({ logo_path: path });
  }

  if (propertyQ.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (propertyQ.isError || !propertyQ.data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Setup" description="Configure your property's basics, address, and branding." />
        <Card>
          <CardContent className="space-y-3 py-6 text-center">
            <p className="text-sm text-destructive">
              {propertyQ.error instanceof Error
                ? propertyQ.error.message
                : "This property couldn't be loaded."}
            </p>
            <Button variant="outline" onClick={() => propertyQ.refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Setup — ${propertyQ.data?.name ?? ""}`}
        description="Configure your property's basics, address, and branding."
      />

      {/* Stepper */}
      <ol className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <button
              onClick={() => setStep(i)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-medium",
                i === step
                  ? "border-primary bg-primary text-primary-foreground"
                  : i < step
                    ? "border-success bg-success text-success-foreground"
                    : "border-border bg-muted text-muted-foreground",
              )}
              aria-current={i === step}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </button>
            <span className={cn("text-sm", i === step ? "font-medium" : "text-muted-foreground")}>
              {label}
            </span>
            {i < STEPS.length - 1 ? <div className="mx-2 h-px flex-1 bg-border" /> : null}
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <Field id="prop-name" label="Property name">
                <Input
                  id="prop-name"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      slug: isSlugEdited ? f.slug : slugify(name),
                    }));
                  }}
                />
              </Field>
              <Field
                id="prop-slug"
                label="Slug"
                hint={
                  form.slug
                    ? `Public application link: /apply/${form.slug}`
                    : "Used in the public application link. Lowercase letters, digits and dashes."
                }
              >
                <Input
                  id="prop-slug"
                  value={form.slug}
                  spellCheck={false}
                  autoCapitalize="none"
                  onChange={(e) => {
                    setIsSlugEdited(true);
                    set("slug", slugify(e.target.value));
                  }}
                />
              </Field>
              <Field id="prop-type" label="Type">
                <Select
                  value={form.property_type}
                  onValueChange={(v) =>
                    set("property_type", v as PropertyFormInput["property_type"])
                  }
                >
                  <SelectTrigger id="prop-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOSTEL">Hostel</SelectItem>
                    <SelectItem value="PG">PG</SelectItem>
                    <SelectItem value="DORMITORY">Dormitory</SelectItem>
                    <SelectItem value="COACHING_HOSTEL">Coaching hostel</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field id="prop-gender" label="Gender policy">
                <Select
                  value={form.gender_policy}
                  onValueChange={(v) =>
                    set("gender_policy", v as PropertyFormInput["gender_policy"])
                  }
                >
                  <SelectTrigger id="prop-gender"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male only</SelectItem>
                    <SelectItem value="FEMALE">Female only</SelectItem>
                    <SelectItem value="COED">Co-ed</SelectItem>
                    <SelectItem value="CUSTOM">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="prop-phone" label="Phone">
                  <Input id="prop-phone" type="tel" inputMode="tel" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
                </Field>
                <Field id="prop-email" label="Email">
                  <Input id="prop-email" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
                </Field>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Field id="prop-addr1" label="Address line 1">
                <Input id="prop-addr1" value={form.address_line_1} onChange={(e) => set("address_line_1", e.target.value)} />
              </Field>
              <Field id="prop-addr2" label="Address line 2">
                <Input id="prop-addr2" value={form.address_line_2 ?? ""} onChange={(e) => set("address_line_2", e.target.value)} />
              </Field>
              <Field id="prop-landmark" label="Landmark">
                <Input id="prop-landmark" value={form.landmark ?? ""} onChange={(e) => set("landmark", e.target.value)} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="prop-city" label="City">
                  <Input id="prop-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
                </Field>
                <Field id="prop-state" label="State">
                  <Input id="prop-state" value={form.state} onChange={(e) => set("state", e.target.value)} />
                </Field>
                <Field id="prop-pin" label="Postal code" hint="6-digit PIN code.">
                  <Input id="prop-pin" inputMode="numeric" value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="prop-country" label="Country code" hint="Two-letter ISO code, e.g. IN.">
                  <Input id="prop-country" value={form.country_code} onChange={(e) => set("country_code", e.target.value.toUpperCase().slice(0, 2))} />
                </Field>
                <Field id="prop-tz" label="Timezone" hint="IANA name, e.g. Asia/Kolkata.">
                  <Input id="prop-tz" value={form.timezone} onChange={(e) => set("timezone", e.target.value)} />
                </Field>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload a logo (used on invoices and the parent/student app).
                Stored securely and served through signed URLs.
              </p>
              <div>
                <Label htmlFor="prop-logo">Logo</Label>
                <div className="mt-2 flex items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm hover:bg-muted">
                    <Upload className="h-4 w-4" />
                    Choose file
                    <input
                      id="prop-logo"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoUpload(f);
                      }}
                    />
                  </label>
                  {form.logo_path && (
                    <span className="truncate text-xs text-muted-foreground">
                      {form.logo_path.split("/").pop()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="ghost"
          onClick={() =>
            step === 0 ? nav({ to: "/admin/properties" }) : setStep((s) => Math.max(0, s - 1))
          }
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => saveMut.mutate(form)}
            disabled={saveMut.isPending}
          >
            <Save className="h-4 w-4" /> Save
          </Button>
          {step === STEPS.length - 1 ? (
            <Button
              onClick={() => finishMut.mutate(form)}
              disabled={finishMut.isPending}
            >
              <CheckCircle2 className="h-4 w-4" /> Finish setup
            </Button>
          ) : (
            <Button
              onClick={async () => {
                await saveMut.mutateAsync(form);
                setStep((s) => Math.min(STEPS.length - 1, s + 1));
              }}
              disabled={saveMut.isPending}
            >
              Save & continue <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * `id` is required so the label is programmatically bound to its control —
 * placeholder-only or visually-adjacent labels don't satisfy Design.md Sec. 13.
 */
function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
