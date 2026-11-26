import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  BedDouble,
  CircleCheck,
  CirclePause,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  IndianRupee,
  Loader2,
  User,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import roomDefault from "@/assets/illustrations/room-default.webp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { readRoomAmenities } from "@/lib/room-amenities";
import {
  ROOM_PHOTO_ACCEPT,
  ROOM_PHOTO_MAX_FILES,
  uploadRoomPhotos,
  useRoomPhotos,
} from "@/lib/room-photos";
import type { BedCounts, StructureRoom } from "@/lib/rooms-beds";
import { cn } from "@/lib/utils";

const ROOM_STATUS: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  ACTIVE: { label: "Active", icon: CircleCheck, className: "bg-success/10 text-success" },
  MAINTENANCE: { label: "Maintenance", icon: Wrench, className: "bg-warning/10 text-warning" },
  BLOCKED: { label: "Blocked", icon: Ban, className: "bg-destructive/10 text-destructive" },
  INACTIVE: { label: "Inactive", icon: CirclePause, className: "bg-muted text-muted-foreground" },
};

const titleCase = (v: string) => v.charAt(0) + v.slice(1).toLowerCase();

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </dt>
      <dd className="text-right font-semibold text-foreground tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * One room at a time (arrows step through the rooms on the selected floor):
 * cover photo, type, capacity, occupancy, rent, status and amenities. The
 * Hostel Admin can add photos here for rooms created before photos existed.
 */
export function RoomDetailCard({
  room,
  counts,
  position,
  total,
  onPrev,
  onNext,
  tenantId,
  propertyId,
  canEditPhotos,
}: {
  room: StructureRoom | null;
  counts: BedCounts | null;
  position: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  tenantId: string;
  propertyId: string;
  canEditPhotos: boolean;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [imgFailed, setImgFailed] = useState<string | null>(null);
  const photosQ = useRoomPhotos(room ? { tenantId, propertyId, roomId: room.id } : null);
  const cover = photosQ.data?.[0];
  const coverUrl = cover && imgFailed !== cover.url ? cover.url : roomDefault;
  const photoCount = photosQ.data?.length ?? 0;

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      if (!room) return;
      await uploadRoomPhotos(
        { tenantId, propertyId, roomId: room.id },
        files.slice(0, Math.max(0, ROOM_PHOTO_MAX_FILES - photoCount)),
      );
    },
    onSuccess: () => {
      toast.success("Photo added");
      qc.invalidateQueries({ queryKey: ["room-photos", room?.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "We couldn't upload the photo."),
  });

  const status = ROOM_STATUS[room?.status.toUpperCase() ?? ""] ?? ROOM_STATUS.INACTIVE;
  const StatusIcon = status.icon;
  const amenities = readRoomAmenities(room?.amenities);

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex min-w-0 items-center gap-2.5 text-base font-semibold">
          <BedDouble className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{room ? `Room ${room.room_number}` : "Room"}</span>
        </CardTitle>
        {total > 0 ? (
          <div className="flex items-center gap-1">
            <span className="mr-1 text-xs text-muted-foreground tabular-nums">
              {position + 1} / {total}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={onPrev}
              disabled={position === 0}
              aria-label="Previous room"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={onNext}
              disabled={position >= total - 1}
              aria-label="Next room"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {!room || !counts ? (
          <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
            <BedDouble className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-foreground">No rooms on this floor yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add rooms from Setup.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="relative aspect-[3/2] overflow-hidden rounded-xl bg-muted">
                {photosQ.isLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <img
                    src={coverUrl}
                    alt={cover ? `Room ${room.room_number}` : "Sample room photo"}
                    className="h-full w-full object-cover"
                    onError={() => cover && setImgFailed(cover.url)}
                  />
                )}
                {!cover && !photosQ.isLoading ? (
                  <span className="absolute left-2 top-2 rounded-md bg-card/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Sample photo
                  </span>
                ) : null}
                {canEditPhotos && photoCount < ROOM_PHOTO_MAX_FILES ? (
                  <>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={upload.isPending}
                      className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg bg-card/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {upload.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5" />
                      )}
                      {cover ? "Add photo" : "Upload photo"}
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept={ROOM_PHOTO_ACCEPT}
                      multiple
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden="true"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = "";
                        if (files.length) upload.mutate(files);
                      }}
                    />
                  </>
                ) : null}
              </div>
              <dl className="divide-y divide-border/50">
                <Fact icon={BedDouble} label="Room type">
                  {titleCase(room.room_type)}
                </Fact>
                <Fact icon={Users} label="Capacity">
                  {room.capacity}
                </Fact>
                <Fact icon={User} label="Occupied">
                  {counts.occupied}
                </Fact>
                <Fact icon={BedDouble} label="Vacant">
                  {counts.vacant}
                </Fact>
                <Fact icon={IndianRupee} label="Rent">
                  {room.base_rent_paise != null ? (
                    `₹${(room.base_rent_paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })} / month`
                  ) : (
                    <span className="font-normal text-muted-foreground">Not set</span>
                  )}
                </Fact>
                <Fact icon={CircleCheck} label="Status">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                      status.className,
                    )}
                  >
                    <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {status.label}
                  </span>
                </Fact>
              </dl>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <ul className="flex flex-wrap gap-1.5" aria-label="Amenities">
                {amenities.length ? (
                  amenities.map(({ key, label, icon: Icon }) => (
                    <li
                      key={key}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-foreground"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      {label}
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-muted-foreground">No amenities listed</li>
                )}
              </ul>
              {counts.vacant > 0 ? (
                <Button asChild className="rounded-xl">
                  <Link to="/admin/allocations">
                    <UserPlus className="h-4 w-4" /> Allocate bed
                  </Link>
                </Button>
              ) : (
                <Button className="rounded-xl" disabled title="No vacant bed in this room">
                  <UserPlus className="h-4 w-4" /> Allocate bed
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
