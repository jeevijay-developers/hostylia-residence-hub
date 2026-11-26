import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Building2 } from "lucide-react";
import { toast } from "sonner";

import { PropertyWizard } from "@/components/hostel/PropertyWizard";
import { Skeleton } from "@/components/ui/skeleton";
import { detectDeviceLocation } from "@/lib/locations";
import { createProperty } from "@/lib/property.functions";
import { EMPTY_PROPERTY_FORM, friendlyPropertyError } from "@/lib/property-form";
import { useResolvedRole } from "@/lib/user-role";
import type { PropertyFormInput } from "@/schemas/hostel";
import { usePropertyStore } from "@/stores/property-store";

export const Route = createFileRoute("/_authenticated/admin/properties/new")({
  head: () => ({ meta: [{ title: "Add property — Hostylia" }] }),
  component: AddPropertyPage,
});

function AddPropertyPage() {
  const { data: role, isLoading: roleLoading } = useResolvedRole();
  const tenantId = role?.tenantId ?? null;
  const qc = useQueryClient();
  const nav = useNavigate();
  const setActivePropertyId = usePropertyStore((s) => s.setActivePropertyId);
  const create = useServerFn(createProperty);

  // Country and time zone start from this device's settings; both stay editable.
  const [initialValues] = useState(() => {
    const { countryCode, timeZone } = detectDeviceLocation();
    return { ...EMPTY_PROPERTY_FORM, country_code: countryCode, timezone: timeZone };
  });

  const createMut = useMutation({
    mutationFn: async (values: PropertyFormInput) => {
      if (!tenantId)
        throw new Error("Your organization could not be identified. Please sign in again.");
      return create({ data: { ...values, tenant_id: tenantId } });
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["admin-properties"] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard-property-count"] });
      setActivePropertyId(created.id);
      toast.success("Property added. Next, add its blocks, floors, rooms and beds.");
      nav({ to: "/admin/properties/$slug/structure", params: { slug: created.slug } });
    },
    onError: (e) =>
      toast.error(friendlyPropertyError(e, "We couldn't add the property. Please try again.")),
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 sm:space-y-6">
      <header className="flex items-center gap-3 sm:gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Building2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Add property
          </h1>
          <Link
            to="/admin/properties"
            className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All properties
          </Link>
        </div>
      </header>

      {roleLoading ? (
        <Skeleton className="h-[420px] w-full rounded-2xl" />
      ) : (
        <PropertyWizard
          mode="create"
          initialValues={initialValues}
          locationDetected
          submitLabel="Create property"
          isSubmitting={createMut.isPending}
          onSubmit={(values) => createMut.mutate(values)}
          onCancel={() => nav({ to: "/admin/properties" })}
        />
      )}
    </div>
  );
}
