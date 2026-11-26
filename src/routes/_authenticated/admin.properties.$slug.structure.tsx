import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { RoomsBedsBoard } from "@/components/hostel/RoomsBedsBoard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMakePropertyActive, usePropertyByRouteParam } from "@/lib/admin-properties";

export const Route = createFileRoute("/_authenticated/admin/properties/$slug/structure")({
  head: () => ({ meta: [{ title: "Property structure — Hostylia" }] }),
  component: StructurePage,
});

function StructurePage() {
  const { slug } = Route.useParams();
  const nav = useNavigate();
  const propertyQ = usePropertyByRouteParam(slug);
  const property = propertyQ.data;
  useMakePropertyActive(property?.id);

  // Old id-based links land here too: swap the URL to the readable slug.
  useEffect(() => {
    if (property && String(property.slug) !== slug) {
      nav({ to: Route.fullPath, params: { slug: String(property.slug) }, replace: true });
    }
  }, [property, slug, nav]);

  if (propertyQ.isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-12 w-80" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
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
    // No property tabs here: Setup is entered from Rooms & Beds / the ⋯ menu and
    // tab switching happens on the property's Overview pages only.
    <div className="w-full space-y-3">
      <Link
        to="/admin/properties/$slug/rooms"
        params={{ slug: String(property.slug) }}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Rooms &amp; beds
      </Link>
      <RoomsBedsBoard propertyId={property.id} />
    </div>
  );
}
