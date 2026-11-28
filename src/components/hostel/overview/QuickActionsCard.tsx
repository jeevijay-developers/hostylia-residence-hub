import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  BedDouble,
  DoorOpen,
  Link2,
  Upload,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { AddStudentDialog } from "@/components/students/AddStudentDialog";
import { StudentBulkImportModal } from "@/components/students/StudentBulkImportModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const tileClass =
  "flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-card px-2 py-3 text-center text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 sm:text-sm";

function TileBody({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <>
      <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
      <span className="leading-tight">{children}</span>
    </>
  );
}

/**
 * Shortcuts into existing flows for this property — nothing here has its own
 * logic: Add / Bulk import reuse the Students dialogs, Allocate / Change room
 * open the allocation board (allocate a vacant bed, or swap a resident's bed)
 * and Check out lists the residents who have given notice.
 */
export function QuickActionsCard({
  tenantId,
  property,
}: {
  tenantId: string | null;
  property: { id: string; slug: string; status: string };
}) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const isActive = property.status.toUpperCase() === "ACTIVE";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["property-students", property.id] });
    qc.invalidateQueries({ queryKey: ["students-tab", property.id] });
    qc.invalidateQueries({ queryKey: ["property-overview", property.id] });
    qc.invalidateQueries({ queryKey: ["students-list"] });
  };

  const copyAdmissionLink = async () => {
    const url = `${window.location.origin}/apply/${property.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Admission link copied — share it with applicants on WhatsApp or SMS.");
    } catch {
      toast.error(`Couldn't copy automatically. The link is ${url}`);
    }
  };

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
          Quick actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            className={tileClass}
            disabled={!tenantId}
            onClick={() => setAddOpen(true)}
          >
            <TileBody icon={UserPlus}>Add student</TileBody>
          </button>
          <button
            type="button"
            className={tileClass}
            disabled={!tenantId}
            onClick={() => setImportOpen(true)}
          >
            <TileBody icon={Upload}>Bulk import</TileBody>
          </button>
          <Link to="/admin/allocations" className={tileClass}>
            <TileBody icon={BedDouble}>Allocate room</TileBody>
          </Link>
          <Link
            to="/admin/allocations"
            className={tileClass}
            title="Move a resident to another bed"
          >
            <TileBody icon={ArrowRightLeft}>Change room</TileBody>
          </Link>
          <button
            type="button"
            className={cn(tileClass)}
            disabled={!isActive}
            title={
              isActive
                ? "Copy the public admission form link"
                : "The admission link only works while the property is active"
            }
            onClick={copyAdmissionLink}
          >
            <TileBody icon={Link2}>Admission link</TileBody>
          </button>
          <Link
            to="/admin/students"
            search={{ status: "NOTICE_GIVEN" }}
            className={tileClass}
            title="Residents who have given notice — open one to move them out"
          >
            <TileBody icon={DoorOpen}>Check out</TileBody>
          </Link>
        </div>
      </CardContent>

      {tenantId ? (
        <>
          <AddStudentDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            tenantId={tenantId}
            propertyId={property.id}
            onDone={refresh}
          />
          <StudentBulkImportModal
            open={importOpen}
            onOpenChange={setImportOpen}
            tenantId={tenantId}
            propertyId={property.id}
            onDone={refresh}
          />
        </>
      ) : null}
    </Card>
  );
}
