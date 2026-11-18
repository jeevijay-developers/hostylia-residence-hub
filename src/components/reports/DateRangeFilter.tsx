import { useState } from "react";
import { CalendarDays } from "lucide-react";
import type { DateRange as PickerRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  currentMonthRange,
  describeRange,
  formatRange,
  lastMonthRange,
  type DateRange,
} from "@/lib/report-range";
import { dayFromYmd, ymd } from "@/lib/schedule-picker";

interface Props {
  value: DateRange;
  onChange: (value: DateRange) => void;
}

/**
 * Reporting period selector with three choices: Current month (the default), Previous month, or a Custom date
 * range picked on a calendar. All dates are Indian Standard Time (IST) calendar days, compared with the invoices'
 * issue date. The custom range applies as soon as both ends are chosen. Like the Notice Composer's date field, the
 * text field only DISPLAYS the period; the calendar opens only from the calendar icon button.
 */
export function DateRangeFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  // The first click on the calendar is always a NEW start date (even inside the current range); the
  // second click completes the range. While waiting for the end date, only the start day is shown.
  const [anchor, setAnchor] = useState<string | null>(null);

  const apply = (next: DateRange) => {
    onChange(next);
    setAnchor(null);
    setOpen(false);
  };

  const pickDay = (day: Date) => {
    const clicked = ymd(day);
    if (!anchor) {
      setAnchor(clicked);
      return;
    }
    apply(anchor <= clicked ? { from: anchor, to: clicked } : { from: clicked, to: anchor });
  };

  const selected: PickerRange = anchor
    ? { from: dayFromYmd(anchor) }
    : { from: dayFromYmd(value.from), to: dayFromYmd(value.to) };

  const kind = describeRange(value);
  const today = currentMonthRange().from;
  const [thisYear] = today.split("-").map(Number);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setAnchor(null);
      }}
    >
      <PopoverAnchor asChild>
        <div className="relative w-full sm:w-80">
          <Input
            readOnly
            aria-label="Reporting period"
            value={`${kind}: ${formatRange(value)}`}
            className="cursor-default truncate pr-12 text-foreground"
          />
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Open calendar to change the reporting period (${kind}, ${formatRange(value)})`}
              className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg border-input bg-card text-foreground hover:bg-muted"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        collisionPadding={8}
        className="w-auto max-w-[calc(100vw-1rem)] p-0"
      >
        <div className="flex flex-wrap gap-1.5 border-b border-border p-3">
          <Button
            type="button"
            size="sm"
            variant={kind === "Current month" ? "default" : "secondary"}
            onClick={() => apply(currentMonthRange())}
          >
            Current month
          </Button>
          <Button
            type="button"
            size="sm"
            variant={kind === "Previous month" ? "default" : "secondary"}
            onClick={() => apply(lastMonthRange())}
          >
            Previous month
          </Button>
        </div>
        <p className="px-3 pt-2 text-xs font-medium text-foreground">Custom date range</p>
        <Calendar
          className="[--cell-size:2.25rem]"
          mode="range"
          selected={selected}
          onDayClick={(day) => pickDay(day)}
          defaultMonth={selected.from ?? dayFromYmd(today)}
          startMonth={new Date(2015, 0, 1)}
          endMonth={new Date(thisYear + 5, 11, 1)}
          captionLayout="dropdown"
        />
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {anchor
            ? "Now pick the end date (the same day again selects a single day)."
            : "Pick a start date, then an end date. Dates are IST calendar days; invoices are matched by issue date."}
        </p>
      </PopoverContent>
    </Popover>
  );
}
