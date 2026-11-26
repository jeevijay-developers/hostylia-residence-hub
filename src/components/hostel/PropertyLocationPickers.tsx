import { useId, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown, Loader2, MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { searchIndianCities, type CitySuggestion } from "@/lib/locations";
import { FIELD_CONTROL } from "@/lib/property-form";
import { cn } from "@/lib/utils";

interface CityComboboxProps {
  id: string;
  value: string;
  onChange: (city: string) => void;
  /** Called when a suggestion is picked, so the caller can fill the state too. */
  onPick: (suggestion: CitySuggestion) => void;
  /** Suggestions are only available for Indian cities; elsewhere it is a plain text field. */
  suggestionsEnabled: boolean;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * City text field with type-ahead suggestions. The search runs on the
 * debounced value (250 ms after the last keystroke), so suggestions don't
 * flicker on every key; any city can still be typed in full.
 */
export function CityCombobox({
  id,
  value,
  onChange,
  onPick,
  suggestionsEnabled,
  invalid,
  describedBy,
}: CityComboboxProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebouncedValue(value, 250);
  const isSettling = value.trim() !== debounced.trim();
  const suggestions = useMemo(
    () => (suggestionsEnabled ? searchIndianCities(debounced) : []),
    [debounced, suggestionsEnabled],
  );
  // Hide the list when the only match is exactly what's already typed.
  const exact =
    suggestions.length === 1 && suggestions[0].city.toLowerCase() === value.trim().toLowerCase();
  const showList = open && suggestionsEnabled && value.trim().length > 0 && !exact;

  const pick = (s: CitySuggestion) => {
    onPick(s);
    setOpen(false);
  };

  return (
    <div className="relative">
      <MapPin
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id={id}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required="true"
        aria-activedescendant={showList && suggestions[active] ? `${listId}-${active}` : undefined}
        placeholder={suggestionsEnabled ? "Start typing, e.g. Kota" : "City"}
        className={cn(FIELD_CONTROL, "pl-10")}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (!showList || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(suggestions[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-popover p-1 text-sm shadow-lg"
        >
          {isSettling && suggestions.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Searching…
            </li>
          ) : suggestions.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">
              No match in our list — “{value.trim()}” will be used as typed.
            </li>
          ) : (
            suggestions.map((s, i) => (
              <li
                key={`${s.city}-${s.state}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // mousedown, not click: keeps focus in the input so onBlur doesn't close first.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2",
                  i === active ? "bg-accent text-accent-foreground" : "text-foreground",
                )}
              >
                <span className="font-medium">{s.city}</span>
                <span className="truncate text-xs text-muted-foreground">{s.state}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

export interface PickerOption {
  value: string;
  label: string;
  hint?: string;
}

interface SearchableSelectProps {
  id: string;
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  invalid?: boolean;
  describedBy?: string;
  icon?: ReactNode;
}

/** A dropdown with a search box, for long standard lists (countries, time zones). */
export function SearchableSelect({
  id,
  value,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  invalid,
  describedBy,
  icon,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-required="true"
          className={cn(
            FIELD_CONTROL,
            "flex w-full items-center gap-2.5 border px-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {icon}
          <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          {selected?.hint ? (
            <span className="shrink-0 text-xs text-muted-foreground">{selected.hint}</span>
          ) : null}
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value} ${o.hint ?? ""}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <Check
                    className={cn("h-4 w-4", o.value === value ? "opacity-100" : "opacity-0")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
