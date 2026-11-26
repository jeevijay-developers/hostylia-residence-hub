import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Building2 } from "lucide-react";
import { toast } from "sonner";

import { PropertyWizard } from "@/components/hostel/PropertyWizard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { usePropertyByRouteParam } from "@/lib/admin-properties";
import {
  EMPTY_PROPERTY_FORM,
  friendlyPropertyError,
  type PropertyFormValues,
} from "@/lib/property-form";
import type { PropertyFormInput } from "@/schemas/hostel";

export const Route = createFileRoute("/_authenticated/admin/properties/$slug/edit")({
  head: () => ({ meta: [{ title: "Edit property — Hostylia" }] }),
  component: PropertySetupPage,
});

/** Placeholders the old two-field "Add property" dialog stored until Setup was completed. */
const PLACEHOLDERS = new Set(["TBD", "000000"]);
const clean = (v: string | null | undefined) => (v && !PLACEHOLDERS.has(v.trim()) ? v : "");

function PropertySetupPage() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();

  const propertyQ = usePropertyByRouteParam(slug);
  const p = propertyQ.data;

  // Old id-based links land here too: swap the URL to the readable slug.
  useEffect(() => {
    if (p && String(p.slug) !== slug) {
      nav({ to: Route.fullPath, params: { slug: String(p.slug) }, replace: true });
    }
  }, [p, slug, nav]);
  const isDraft = (p?.status ?? "").toUpperCase() === "DRAFT";

  const saveMut = useMutation({
    mutationFn: async (values: PropertyFormInput) => {
      if (!p) throw new Error("This property couldn't be loaded. Please refresh and try again.");
      const { error } = await supabase
        .from("properties")
        .update({
          name: values.name,
          property_type: values.property_type,
          gender_policy: values.gender_policy,
          address_line_1: values.address_line_1,
          address_line_2: values.address_line_2 || null,
          landmark: values.landmark || null,
          city: values.city,
          state: values.state,
          postal_code: values.postal_code.toUpperCase(),
          country_code: values.country_code,
          timezone: values.timezone,
          phone: values.phone || null,
          email: values.email || null,
          // Finishing setup activates a draft. An Inactive/Suspended property keeps its
          // status: editing details must never silently re-activate it.
          ...(isDraft ? { status: "ACTIVE" } : {}),
        })
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["property-by-slug"] });
      qc.invalidateQueries({ queryKey: ["property", p?.id] });
      qc.invalidateQueries({ queryKey: ["admin-properties"] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard-property", p?.id] });
      toast.success(isDraft ? "Property saved and activated" : "Property details saved");
      nav({ to: "/admin/properties" });
    },
    onError: (e) =>
      toast.error(friendlyPropertyError(e, "We couldn't save the property. Please try again.")),
  });

  if (propertyQ.isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[420px] w-full rounded-2xl" />
      </div>
    );
  }

  if (propertyQ.isError || !p) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <div className="rounded-2xl border border-border/80 bg-card p-8 text-center">
          <p className="text-sm text-foreground">
            We couldn't load this property. It may have been removed, or you may not have access.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" onClick={() => propertyQ.refetch()}>
              Try again
            </Button>
            <Button asChild variant="ghost">
              <Link to="/admin/properties">Back to properties</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const initialValues: PropertyFormValues = {
    ...EMPTY_PROPERTY_FORM,
    name: p.name,
    property_type: (p.property_type ?? "").toUpperCase(),
    gender_policy: (p.gender_policy ?? "").toUpperCase(),
    address_line_1: clean(p.address_line_1),
    address_line_2: clean(p.address_line_2),
    landmark: clean(p.landmark),
    city: clean(p.city),
    state: clean(p.state),
    postal_code: clean(p.postal_code),
    country_code: (p.country_code ?? "IN").trim().toUpperCase() || "IN",
    timezone: p.timezone || "Asia/Kolkata",
    phone: p.phone ?? "",
    email: p.email ?? "",
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 sm:space-y-6">
      <header className="flex items-center gap-3 sm:gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Building2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-foreground">
            Edit property — {p.name}
          </h1>
          <Link
            to="/admin/properties"
            className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All properties
          </Link>
        </div>
      </header>

      <PropertyWizard
        key={p.id}
        mode="edit"
        initialValues={initialValues}
        slug={String(p.slug)}
        submitLabel={isDraft ? "Save & activate" : "Save changes"}
        isSubmitting={saveMut.isPending}
        onSubmit={(values) => saveMut.mutate(values)}
        onCancel={() => nav({ to: "/admin/properties" })}
      />
    </div>
  );
}
