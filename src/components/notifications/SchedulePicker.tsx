import { useState } from "react";
import { CalendarClock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatIstDateTime, istInputToIso } from "@/lib/ist";
import { useNowTick } from "@/lib/notice-time";
import {
  MINUTES,
  buildPickerValue,
  clampToFuture,
  dayFromYmd,
  defaultTimeFor,
  floorClock,
  isDayDisabled,
  isHourDisabled,
  isMinuteDisabled,
  isPeriodDisabled,
  isSlotPast,
  minuteChoices,
  nextSlotAfter,
  parsePickerValue,
  to12Hour,
  to24Hour,
  todayIst,
  ymd,
  type Period,
  type PickerValue,
} from "@/lib/schedule-picker";
import { cn } from "@/lib/utils";

interface Props {
  id?: string;
  /** IST wall-clock "YYYY-MM-DDTHH:mm", or "" when nothing is scheduled. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Text shown in the field while empty. */
  placeholder?: string;
  /** What is being picked, for the icon button's accessible name ("schedule date and time"). */
  pickerLabel?: string;
  /**
   * Earliest allowed moment as an IST value (e.g. the scheduled publish time for an expiry). Slots at or
   * before it - and before "now" - cannot be chosen.
   */
  notBefore?: string;
  invalid?: boolean;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Date/time field for the Notice Composer (used for both Schedule and Expires). The field itself only
 * DISPLAYS the chosen value; the picker (calendar + hour / minute / AM-PM) opens only from the calendar
 * icon button, never from clicking or focusing the text. Everything is in IST (Asia/Kolkata) whatever the
 * device's timezone; past days and past times cannot be chosen. The value it reports is the same IST
 * string the composer already converts to a UTC instant when publishing.
 */
export function SchedulePicker({
  id,
  value,
  onChange,
  disabled,
  placeholder = "Select date & time (IST)",
  pickerLabel = "date and time",
  notBefore,
  invalid,
}: Props) {
  const [open, setOpen] = useState(false);
  const nowMs = useNowTick(30_000);
  // The earliest selectable moment: "now" (IST), or a later notBefore value. All rules below use it.
  const now = floorClock(new Date(nowMs), notBefore);
  const parsed = parsePickerValue(value);
  const iso = value ? istInputToIso(value) : null;
  const today = todayIst(now);
  const [thisYear, thisMonth] = today.split("-").map(Number);
  const time = parsed ? to12Hour(parsed.hour24) : null;

  // Moves a chosen slot to a valid one if it is in the past (only possible for today).
  const commit = (v: PickerValue) => onChange(buildPickerValue(clampToFuture(v, now)));

  const pickDate = (day: Date | undefined) => {
    if (!day) return;
    const date = ymd(day);
    if (isDayDisabled(date, now)) return;
    commit(parsed ? { ...parsed, date } : defaultTimeFor(date, now));
  };

  // Changing the hour / AM-PM into a slot that has already passed today lands on the first free minute.
  const fit = (v: PickerValue): PickerValue => {
    if (!isSlotPast(v, now)) return v;
    const free = MINUTES.find((m) => !isSlotPast({ ...v, minute: m }, now));
    return free === undefined ? nextSlotAfter(now) : { ...v, minute: free };
  };
  const setHour = (hour12: number) => {
    if (parsed && time)
      onChange(buildPickerValue(fit({ ...parsed, hour24: to24Hour(hour12, time.period) })));
  };
  const setMinute = (minute: number) => {
    if (parsed) commit({ ...parsed, minute });
  };
  const setPeriod = (period: Period) => {
    if (parsed && time)
      onChange(buildPickerValue(fit({ ...parsed, hour24: to24Hour(time.hour12, period) })));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative mt-1.5">
          <Input
            id={id}
            readOnly
            value={iso ? formatIstDateTime(iso) : ""}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={invalid}
            className={cn("cursor-default truncate pr-12", iso && "text-foreground")}
          />
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              aria-label={`Open calendar to pick ${pickerLabel}`}
              className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg border-input bg-card text-foreground hover:bg-muted"
            >
              <CalendarClock className="h-4 w-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        collisionPadding={8}
        className="w-[17.5rem] max-w-[calc(100vw-1rem)] p-0"
      >
        <Calendar
          className="[--cell-size:2.25rem]"
          mode="single"
          selected={parsed ? dayFromYmd(parsed.date) : undefined}
          onSelect={pickDate}
          defaultMonth={dayFromYmd(parsed?.date ?? today)}
          startMonth={new Date(thisYear, thisMonth - 1, 1)}
          endMonth={new Date(thisYear + 2, thisMonth - 1, 1)}
          captionLayout="dropdown"
          disabled={(day) => isDayDisabled(ymd(day), now)}
        />
        <div className="space-y-3 border-t border-border p-3">
          <div className="flex items-center gap-2" role="group" aria-label="Time (IST)">
            <Select
              value={time ? String(time.hour12) : ""}
              onValueChange={(v) => setHour(Number(v))}
              disabled={!parsed}
            >
              <SelectTrigger className="w-16 px-2" aria-label="Hour">
                <SelectValue placeholder="hh" />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => (
                  <SelectItem
                    key={h}
                    value={String(h)}
                    disabled={
                      !!parsed && !!time && isHourDisabled(parsed.date, h, time.period, now)
                    }
                  >
                    {pad(h)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span aria-hidden="true">:</span>
            <Select
              value={parsed ? String(parsed.minute) : ""}
              onValueChange={(v) => setMinute(Number(v))}
              disabled={!parsed}
            >
              <SelectTrigger className="w-16 px-2" aria-label="Minute">
                <SelectValue placeholder="mm" />
              </SelectTrigger>
              <SelectContent>
                {minuteChoices(parsed?.minute ?? 0).map((m) => (
                  <SelectItem
                    key={m}
                    value={String(m)}
                    disabled={
                      !!parsed &&
                      !!time &&
                      isMinuteDisabled(parsed.date, time.hour12, time.period, m, now)
                    }
                  >
                    {pad(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={time?.period ?? ""}
              onValueChange={(v) => setPeriod(v as Period)}
              disabled={!parsed}
            >
              <SelectTrigger className="w-16 px-2" aria-label="AM or PM">
                <SelectValue placeholder="--" />
              </SelectTrigger>
              <SelectContent>
                {(["AM", "PM"] as const).map((p) => (
                  <SelectItem
                    key={p}
                    value={p}
                    disabled={!!parsed && isPeriodDisabled(parsed.date, p, now)}
                  >
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">IST</span>
          </div>
          {!parsed && <p className="text-xs text-muted-foreground">Pick a date to set the time.</p>}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!parsed}
              onClick={() => onChange("")}
            >
              Clear
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
