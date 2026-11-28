import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CirclePause,
  CircleCheck,
  LayoutGrid,
  Loader2,
  MoreVertical,
  Pencil,
  ToggleLeft,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { deleteProperty, setPropertyStatus } from "@/lib/property.functions";
import { friendlyPropertyError } from "@/lib/property-form";
import { cn } from "@/lib/utils";
import { usePropertyStore } from "@/stores/property-store";

interface PropertyActionsMenuProps {
  property: { id: string; slug: string; name: string; status: string };
  /** "overlay" sits on the card photo; "ghost" is the plain table-row button. */
  variant?: "overlay" | "ghost";
}

/**
 * The property ⋯ menu: Edit details, Setup (blocks, floors, rooms and beds),
 * Change status (Active / Inactive) and Delete. Status and delete go through server functions that re-check the
 * caller is the tenant's Hostel Admin; delete is refused while the property
 * has residents and needs the name typed to confirm.
 */
export function PropertyActionsMenu({ property, variant = "ghost" }: PropertyActionsMenuProps) {
  const qc = useQueryClient();
  const changeStatus = useServerFn(setPropertyStatus);
  const remove = useServerFn(deleteProperty);
  const activePropertyId = usePropertyStore((s) => s.activePropertyId);
  const setActivePropertyId = usePropertyStore((s) => s.setActivePropertyId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const status = property.status.toUpperCase();
  const isSuspended = status === "SUSPENDED";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-properties"] });
    qc.invalidateQueries({ queryKey: ["properties"] });
    qc.invalidateQueries({ queryKey: ["property-by-slug"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard-property-count"] });
  };

  const statusMut = useMutation({
    mutationFn: (next: "ACTIVE" | "INACTIVE") =>
      changeStatus({ data: { property_id: property.id, status: next } }),
    onSuccess: (r) => {
      refresh();
      toast.success(
        r.status === "ACTIVE"
          ? `${property.name} is active again.`
          : `${property.name} is now inactive. Its admission page won't accept applications.`,
      );
    },
    onError: (e) => toast.error(friendlyPropertyError(e, "We couldn't change the status.")),
  });

  const deleteMut = useMutation({
    mutationFn: () =>
      remove({ data: { property_id: property.id, confirm_name: confirmName.trim() } }),
    onSuccess: () => {
      if (activePropertyId === property.id) setActivePropertyId(null);
      refresh();
      setDeleteOpen(false);
      toast.success(`${property.name} was deleted.`);
    },
    onError: (e) =>
      setDeleteError(
        friendlyPropertyError(e, "We couldn't delete the property. Please try again."),
      ),
  });

  const nameMatches = confirmName.trim().toLowerCase() === property.name.trim().toLowerCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`More actions for ${property.name}`}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            variant === "overlay" ? "bg-card/90 shadow-sm backdrop-blur" : "hover:bg-muted",
          )}
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem asChild>
            <Link to="/admin/properties/$slug/edit" params={{ slug: property.slug }}>
              <Pencil className="mr-2 h-4 w-4" /> Edit details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/admin/properties/$slug/structure" params={{ slug: property.slug }}>
              <LayoutGrid className="mr-2 h-4 w-4" /> Setup rooms &amp; beds
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={isSuspended || statusMut.isPending}>
              <ToggleLeft className="mr-2 h-4 w-4" /> Change status
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              <DropdownMenuRadioGroup
                value={status === "ACTIVE" ? "ACTIVE" : status === "INACTIVE" ? "INACTIVE" : ""}
                onValueChange={(v) => {
                  if (v === "ACTIVE" || v === "INACTIVE") statusMut.mutate(v);
                }}
              >
                <DropdownMenuRadioItem value="ACTIVE">
                  <CircleCheck className="mr-2 h-4 w-4 text-success" /> Active
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="INACTIVE">
                  <CirclePause className="mr-2 h-4 w-4 text-muted-foreground" /> Inactive
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={() => {
              setConfirmName("");
              setDeleteError(null);
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete property
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteOpen} onOpenChange={(o) => !deleteMut.isPending && setDeleteOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {property.name}?</DialogTitle>
            <DialogDescription>
              The property disappears from your lists and its admission link stops working. Past
              invoices, payments and records are kept. You can only delete a property once every
              resident has moved out.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label
              htmlFor={`delete-${property.id}`}
              className="text-sm font-medium text-foreground"
            >
              Type <span className="font-semibold">{property.name}</span> to confirm
            </label>
            <Input
              id={`delete-${property.id}`}
              value={confirmName}
              autoComplete="off"
              onChange={(e) => {
                setConfirmName(e.target.value);
                setDeleteError(null);
              }}
              aria-invalid={deleteError ? true : undefined}
              aria-describedby={deleteError ? `delete-${property.id}-error` : undefined}
            />
            {deleteError ? (
              <p id={`delete-${property.id}-error`} className="text-sm text-destructive">
                {deleteError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={deleteMut.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMut.mutate()}
              disabled={!nameMatches || deleteMut.isPending}
            >
              {deleteMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete property
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
