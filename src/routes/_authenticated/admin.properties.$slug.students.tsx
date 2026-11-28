import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { PropertyStudents } from "@/components/hostel/students/PropertyStudents";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMakePropertyActive, usePropertyByRouteParam } from "@/lib/admin-properties";

export const Route = createFileRoute("/_authenticated/admin/properties/$slug/students")({
  head: () => ({ meta: [{ title: "Students — Hostylia" }] }),
  component: PropertyStudentsPage,
});

/** /admin/properties/$slug/students — the property's Students tab. */
function PropertyStudentsPage() {
  const { slug } = Route.useParams();
  const nav = useNavigate();
  const propertyQ = usePropertyByRouteParam(slug);
  const property = propertyQ.data;

  useMakePropertyActive(property?.id);

  // Old id-based links land here too: swap the URL to the readable slug.
  useEffect(() => {
    if (property && String(property.slug) !== slug) {
      nav({
        to: "/admin/properties/$slug/students",
        params: { slug: String(property.slug) },
        replace: true,
      });
    }
  }, [property, slug, nav]);

  if (propertyQ.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-12 rounded-2xl" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (propertyQ.isError || !property) {
    return (
      <div className="rounded-2xl border border-border/80 bg-card p-8 text-center">
        <p className="text-sm text-foreground">
          {propertyQ.isError
            ? "We couldn't load this property. Please try again."
            : "We couldn't find this property. It may have been removed, or the link is out of date."}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {propertyQ.isError ? (
            <Button variant="outline" onClick={() => propertyQ.refetch()}>
              Try again
            </Button>
          ) : null}
          <Button asChild variant="ghost">
            <Link to="/admin/properties">Back to properties</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PropertyStudents
      property={{
        id: property.id,
        tenant_id: property.tenant_id,
        slug: String(property.slug),
        name: property.name,
        status: String(property.status),
        city: property.city,
        state: property.state,
      }}
    />
  );
}
