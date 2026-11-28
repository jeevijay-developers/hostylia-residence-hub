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
  ImageOff,
  ImagePlus,
  IndianRupee,
  Loader2,
  Trash2,
  User,
  UserPlus,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import roomDefault from "@/assets/illustrations/room-default.webp";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { readRoomAmenities } from "@/lib/room-amenities";
import {
  ROOM_PHOTO_ACCEPT,
  ROOM_PHOTO_MAX_FILES,
  removeRoomPhoto,
  uploadRoomPhotos,
  useRoomPhotos,
  type RoomPhoto,
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
 * cover photo, type, capacity, occupancy, rent, status and amenities. A strip
 * shows every photo (the first is the cover; click one to view it larger), and
 * the Hostel Admin can add or remove photos here (up to 5 per room).
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
  const [failedUrls, setFailedUrls] = useState<ReadonlySet<string>>(() => new Set());
  const [viewPath, setViewPath] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<RoomPhoto | null>(null);
  const photosQ = useRoomPhotos(room ? { tenantId, propertyId, roomId: room.id } : null);
  const photos = photosQ.data ?? [];
  // The first photo (oldest) is the cover.
  const cover = photos[0];
  const coverUrl = cover && !failedUrls.has(cover.url) ? cover.url : roomDefault;
  const photoCount = photos.length;
  const viewIndex = viewPath ? photos.findIndex((p) => p.path === viewPath) : -1;
  const viewed = viewIndex >= 0 ? photos[viewIndex] : null;

  const markFailed = (url: string) =>
    setFailedUrls((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));

  const upload = useMutation({
    mutationFn: ({ roomId, files }: { roomId: string; files: File[] }) =>
      uploadRoomPhotos({ tenantId, propertyId, roomId }, files),
    onSuccess: (n) => toast.success(n === 1 ? "Photo added" : `${n} photos added`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "We couldn't upload the photo."),
    // Also after a failure part-way through, so photos that did upload show up.
    onSettled: (_d, _e, vars) => qc.invalidateQueries({ queryKey: ["room-photos", vars.roomId] }),
  });

  const remove = useMutation({
    mutationFn: ({ photo }: { roomId: string; photo: RoomPhoto }) => removeRoomPhoto(photo.path),
    onSuccess: (_d, { photo }) => {
      toast.success("Photo removed");
      setPendingRemove(null);
      // Keep the viewer open on a neighbouring photo, if any.
      if (viewPath === photo.path) {
        const i = photos.findIndex((p) => p.path === photo.path);
        const next = photos[i + 1] ?? photos[i - 1];
        setViewPath(next ? next.path : null);
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "We couldn't remove the photo."),
    onSettled: (_d, _e, vars) => qc.invalidateQueries({ queryKey: ["room-photos", vars.roomId] }),
  });

  const pickFiles = (files: File[]) => {
    if (!room || !files.length) return;
    const roomLeft = ROOM_PHOTO_MAX_FILES - photoCount;
    if (roomLeft <= 0) {
      toast.error(
        `This room already has ${ROOM_PHOTO_MAX_FILES} photos. Remove one to add another.`,
      );
      return;
    }
    const accepted = files.slice(0, roomLeft);
    const dropped = files.length - accepted.length;
    if (dropped > 0) {
      toast.warning(
        `A room can have ${ROOM_PHOTO_MAX_FILES} photos, so only ${roomLeft} more fit — ${dropped} ${dropped === 1 ? "file was" : "files were"} not added.`,
      );
    }
    upload.mutate({ roomId: room.id, files: accepted });
  };

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
                ) : cover ? (
                  <button
                    type="button"
                    onClick={() => setViewPath(cover.path)}
                    className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    aria-label={`View photos of room ${room.room_number}`}
                  >
                    <img
                      src={coverUrl}
                      alt={`Room ${room.room_number}`}
                      className="h-full w-full object-cover"
                      onError={() => markFailed(cover.url)}
                    />
                  </button>
                ) : (
                  <img
                    src={roomDefault}
                    alt="Sample room photo"
                    className="h-full w-full object-cover"
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
                        pickFiles(files);
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
            {!photosQ.isLoading && (photoCount > 0 || canEditPhotos) ? (
              <div className="mt-3 flex items-center gap-3">
                <ul
                  className="flex min-w-0 flex-1 gap-2 overflow-x-auto pr-2 pt-2 pb-1"
                  aria-label={`Photos of room ${room.room_number}`}
                >
                  {photos.map((photo, i) => (
                    <li key={photo.path} className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setViewPath(photo.path)}
                        className={cn(
                          "grid h-14 w-14 place-items-center overflow-hidden rounded-lg border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          i === 0 ? "border-primary" : "border-border",
                        )}
                        aria-label={`View photo ${i + 1}${i === 0 ? " (cover)" : ""}`}
                      >
                        {failedUrls.has(photo.url) ? (
                          <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        ) : (
                          <img
                            src={photo.url}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={() => markFailed(photo.url)}
                          />
                        )}
                      </button>
                      {canEditPhotos ? (
                        <button
                          type="button"
                          onClick={() => setPendingRemove(photo)}
                          disabled={remove.isPending}
                          className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Remove photo ${i + 1}`}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {photoCount}/{ROOM_PHOTO_MAX_FILES} photos
                </span>
              </div>
            ) : null}
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

      <Dialog open={!!viewed} onOpenChange={(open) => !open && setViewPath(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {room ? `Room ${room.room_number}` : "Room"} — photo {viewIndex + 1} of {photoCount}
            </DialogTitle>
            <DialogDescription>
              {viewIndex === 0
                ? "This is the cover photo shown on the room card."
                : "The first photo is used as the room's cover."}
            </DialogDescription>
          </DialogHeader>
          {viewed ? (
            <div className="relative grid min-h-48 place-items-center overflow-hidden rounded-xl bg-muted">
              {failedUrls.has(viewed.url) ? (
                <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
                  <ImageOff className="h-6 w-6" aria-hidden="true" />
                  This photo couldn't be loaded.
                </div>
              ) : (
                <img
                  src={viewed.url}
                  alt={`Room ${room?.room_number ?? ""} photo ${viewIndex + 1}`}
                  className="max-h-[60vh] w-full object-contain"
                  onError={() => markFailed(viewed.url)}
                />
              )}
              {photoCount > 1 ? (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute left-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full"
                    onClick={() => setViewPath(photos[viewIndex - 1]?.path ?? viewed.path)}
                    disabled={viewIndex === 0}
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-full"
                    onClick={() => setViewPath(photos[viewIndex + 1]?.path ?? viewed.path)}
                    disabled={viewIndex >= photoCount - 1}
                    aria-label="Next photo"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          {canEditPhotos && viewed ? (
            <DialogFooter>
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setPendingRemove(viewed)}
                disabled={remove.isPending}
              >
                <Trash2 className="h-4 w-4" /> Remove photo
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingRemove}
        onOpenChange={(open) => !open && !remove.isPending && setPendingRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be deleted from this room for good.
              {pendingRemove && pendingRemove.path === cover?.path && photoCount > 1
                ? " The next photo becomes the cover."
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={remove.isPending}
              onClick={(e) => {
                // Keep the dialog open until the delete finishes.
                e.preventDefault();
                if (room && pendingRemove) remove.mutate({ roomId: room.id, photo: pendingRemove });
              }}
            >
              {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
