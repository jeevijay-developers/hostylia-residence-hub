import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AttendanceRoomCount } from "@/schemas/attendance";
import { cn } from "@/lib/utils";

export const ALL_ROOMS = "ALL";

/**
 * Searchable room picker shared by the Admin and Warden attendance pages.
 * `rooms` are the occupied rooms with eligible-student counts (independent of
 * student pagination); `total` is the same eligible total the attendance
 * summary shows, so "All Rooms (N)" always agrees with the Total card.
 * `value` is ALL_ROOMS or a room number.
 */
export function RoomSelector({
  rooms,
  isLoading,
  isError,
  total,
  value,
  onChange,
  onOpen,
  className,
}: {
  rooms: AttendanceRoomCount[] | undefined;
  isLoading: boolean;
  isError: boolean;
  total: number;
  value: string;
  onChange: (roomNumber: string) => void;
  /** Called each time the list opens — used to refetch fresh counts. */
  onOpen?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const list = rooms ?? [];
  const selected = list.find((r) => r.room_number === value);

  // A selected room that no longer has eligible students (moved out, status
  // changed) drops out of the options — fall back to All Rooms instead of
  // leaving a filter that can only ever match nothing.
  useEffect(() => {
    if (!isLoading && !isError && rooms && value !== ALL_ROOMS && !selected) {
      onChange(ALL_ROOMS);
    }
  }, [isLoading, isError, rooms, value, selected, onChange]);

  const label =
    value === ALL_ROOMS
      ? `All Rooms (${total})`
      : selected
        ? `Room ${selected.room_number} (${selected.student_count})`
        : `Room ${value}`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) onOpen?.();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Filter by room"
          className={cn("justify-between gap-2 font-normal", className)}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0">
        {/* Match on the room number only (not the uuid values or the counts). */}
        <Command
          filter={(_value, search, keywords) =>
            (keywords ?? []).join(" ").toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search room number…" />
          <CommandList>
            <CommandEmpty>No rooms found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={ALL_ROOMS}
                keywords={["all rooms"]}
                onSelect={() => {
                  onChange(ALL_ROOMS);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn("mr-2 h-4 w-4", value === ALL_ROOMS ? "opacity-100" : "opacity-0")}
                />
                All Rooms ({total})
              </CommandItem>
              {list.map((r) => (
                <CommandItem
                  key={r.room_id}
                  value={r.room_id}
                  keywords={[`room ${r.room_number}`, r.room_number]}
                  onSelect={() => {
                    onChange(r.room_number);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === r.room_number ? "opacity-100" : "opacity-0",
                    )}
                  />
                  Room {r.room_number} ({r.student_count})
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {isLoading && (
            <p className="flex items-center gap-2 border-t p-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading rooms…
            </p>
          )}
          {isError && (
            <p className="border-t p-2 text-xs text-destructive">
              Couldn't load rooms. "All Rooms" still works.
            </p>
          )}
          {!isLoading && !isError && list.length === 0 && (
            <p className="border-t p-2 text-xs text-muted-foreground">No occupied rooms to list.</p>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
