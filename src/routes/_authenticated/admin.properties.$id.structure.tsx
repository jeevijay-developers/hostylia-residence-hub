import { createFileRoute } from "@tanstack/react-router";
import { RoomsBedsBoard } from "@/components/hostel/RoomsBedsBoard";

export const Route = createFileRoute("/_authenticated/admin/properties/$id/structure")({
  head: () => ({ meta: [{ title: "Property structure — Hostylia" }] }),
  component: StructurePage,
});

function StructurePage() {
  const { id: propertyId } = Route.useParams();
  return <RoomsBedsBoard propertyId={propertyId} />;
}
