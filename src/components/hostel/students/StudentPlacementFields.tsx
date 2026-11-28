import { useEffect, useId, useRef, useState } from "react";
import {
  AlertCircle,
  BedSingle,
  ChevronLeft,
  ChevronRight,
  Info,
  RotateCw,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatBedLabel } from "@/lib/bed-label";
import {
  VACANT_BEDS_PAGE_SIZE,
  formatRupees,
  paiseToRupeesText,
  useFeePlanAmounts,
  usePropertyFeePlans,
  usePropertyToday,
  useVacantBeds,
  type VacantBedOption,
} from "@/lib/student-placement";
import { cn } from "@/lib/utils";

import { DATE_INPUT_CLASS, RupeeInput, StudentField } from "./StudentChargeFields";

export interface StudentPlacementValue {
  bedId: string;
  feePlanId: string;
  startDate: string;
  rentRupees: string;
  depositRupees: string;
}
export type StudentPlacementErrors = Partial<Record<keyof StudentPlacementValue, string>>;

/**
 * "Assign a bed now" step: vacant-bed picker, fee plan, move-in date, rent and deposit.
 * Rent/deposit are seeded from the fee plan, then the bed's rent; a value the user typed is
 * only replaced when the picked fee plan defines that amount (picking it is a deliberate
 * choice), never by a fallback — the same rule as AllocationBoard.
 */
export function StudentPlacementFields({
  propertyId,
  value,
  onChange,
  errors = {},
  disabled,
}: {
  propertyId: string;
  value: StudentPlacementValue;
  onChange: (value: StudentPlacementValue) => void;
  errors?: StudentPlacementErrors;
  disabled?: boolean;
}) {
  const uid = useId();
  const ids = {
    search: `${uid}-bed-search`,
    beds: `${uid}-beds`,
    bedsLabel: `${uid}-beds-label`,
    bedsError: `${uid}-beds-error`,
    plan: `${uid}-fee-plan`,
    start: `${uid}-start`,
    rent: `${uid}-rent`,
    deposit: `${uid}-deposit`,
  };

  // Effects below patch the value: build on the latest value (including a patch made earlier in
  // the same tick, before the parent re-rendered) rather than the render they ran in.
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  const patch = (next: Partial<StudentPlacementValue>) => {
    const merged = { ...latest.current.value, ...next };
    latest.current.value = merged;
    latest.current.onChange(merged);
  };

  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  // The page belongs to the search it was picked for; a new search starts at page 1.
  const [paging, setPaging] = useState({ q: "", page: 0 });
  const page = paging.q === q ? paging.page : 0;
  const bedsQ = useVacantBeds(propertyId, q, page);
  const plansQ = usePropertyFeePlans(propertyId);
  const amountsQ = useFeePlanAmounts(value.feePlanId || null);
  const today = usePropertyToday(propertyId);

  // Kept so the selection survives paging/searching away from the picked bed.
  const [pickedBed, setPickedBed] = useState<VacantBedOption | null>(null);
  const selectedBed =
    pickedBed?.id === value.bedId
      ? pickedBed
      : (bedsQ.data?.rows.find((b) => b.id === value.bedId) ?? null);

  const startEditedRef = useRef(false);
  useEffect(() => {
    if (!startEditedRef.current && today && latest.current.value.startDate !== today) {
      patch({ startDate: today });
    }
  }, [today]);

  const rentEditedRef = useRef(false);
  const depositEditedRef = useRef(false);
  const seedsReady = !value.feePlanId || !amountsQ.isPending;
  const planRent = value.feePlanId ? (amountsQ.data?.rentPaise ?? null) : null;
  const planDeposit = value.feePlanId ? (amountsQ.data?.depositPaise ?? null) : null;
  const bedRent = selectedBed?.rentPaise ?? null;
  useEffect(() => {
    if (!value.bedId || !seedsReady) return;
    const next: Partial<StudentPlacementValue> = {};
    if (planRent !== null) {
      next.rentRupees = paiseToRupeesText(planRent);
      rentEditedRef.current = false;
    } else if (!rentEditedRef.current) {
      next.rentRupees = paiseToRupeesText(bedRent);
    }
    if (planDeposit !== null) {
      next.depositRupees = paiseToRupeesText(planDeposit);
      depositEditedRef.current = false;
    } else if (!depositEditedRef.current) {
      next.depositRupees = "";
    }
    const current = latest.current.value;
    if (
      (next.rentRupees !== undefined && next.rentRupees !== current.rentRupees) ||
      (next.depositRupees !== undefined && next.depositRupees !== current.depositRupees)
    ) {
      patch(next);
    }
  }, [value.bedId, value.feePlanId, seedsReady, planRent, planDeposit, bedRent]);

  const rows = bedsQ.data?.rows ?? [];
  const total = bedsQ.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / VACANT_BEDS_PAGE_SIZE));
  const firstShown = total === 0 ? 0 : page * VACANT_BEDS_PAGE_SIZE + 1;
  const lastShown = Math.min(total, (page + 1) * VACANT_BEDS_PAGE_SIZE);
  const plans = plansQ.data ?? [];

  return (
    <div className="space-y-4">
      {/* Vacant bed picker */}
      <div className="space-y-2">
        <Label id={ids.bedsLabel} htmlFor={ids.search}>
          Vacant bed
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
        </Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={ids.search}
            type="search"
            className="pl-9"
            placeholder="Search room number or bed code"
            aria-controls={ids.beds}
            autoComplete="off"
            disabled={disabled}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="rounded-xl border border-border">
          {bedsQ.isPending ? (
            <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2" aria-busy="true">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
              <span className="sr-only">Loading vacant beds…</span>
            </div>
          ) : bedsQ.isError ? (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 p-3 text-sm text-destructive"
            >
              <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">{bedsQ.error.message}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => bedsQ.refetch()}>
                <RotateCw aria-hidden="true" className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <BedSingle aria-hidden="true" className="h-4 w-4 shrink-0" />
              {q ? `No vacant bed matches “${q}”.` : "There are no vacant beds in this property."}
            </p>
          ) : (
            <RadioGroup
              id={ids.beds}
              aria-labelledby={ids.bedsLabel}
              aria-invalid={Boolean(errors.bedId)}
              aria-describedby={errors.bedId ? ids.bedsError : undefined}
              aria-busy={bedsQ.isFetching}
              disabled={disabled}
              value={value.bedId}
              onValueChange={(bedId) => {
                const bed = rows.find((b) => b.id === bedId);
                if (!bed) return;
                setPickedBed(bed);
                patch({ bedId });
              }}
              className={cn(
                "grid max-h-64 grid-cols-1 gap-2 overflow-y-auto p-2 sm:grid-cols-2",
                bedsQ.isFetching && "opacity-70",
              )}
            >
              {rows.map((bed) => {
                const itemId = `${uid}-bed-${bed.id}`;
                const isSelected = bed.id === value.bedId;
                return (
                  <label
                    key={bed.id}
                    htmlFor={itemId}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/60",
                    )}
                  >
                    <RadioGroupItem id={itemId} value={bed.id} />
                    <BedSingle aria-hidden="true" className="h-4 w-4 shrink-0 text-bed-vacant" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {formatBedLabel(bed.roomNumber, bed.code)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {bed.rentPaise !== null
                          ? `${formatRupees(bed.rentPaise)} / month`
                          : "No rent set on bed or room"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </RadioGroup>
          )}

          {total > VACANT_BEDS_PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <span>
                {firstShown}–{lastShown} of {total} vacant beds
              </span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Previous page of beds"
                  disabled={disabled || page === 0}
                  onClick={() => setPaging({ q, page: page - 1 })}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span aria-live="polite">
                  {page + 1} / {pageCount}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Next page of beds"
                  disabled={disabled || page + 1 >= pageCount}
                  onClick={() => setPaging({ q, page: page + 1 })}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {selectedBed
            ? `Selected: ${formatBedLabel(selectedBed.roomNumber, selectedBed.code)}`
            : "No bed selected yet."}
        </p>
        {errors.bedId && (
          <p id={ids.bedsError} className="text-xs font-medium text-destructive">
            {errors.bedId}
          </p>
        )}
      </div>

      <div>
        <StudentField id={ids.plan} label="Fee plan" isRequired error={errors.feePlanId}>
          {(a11y) =>
            plansQ.isError ? (
              <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
                <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-destructive" />
                <span className="min-w-0 flex-1 text-destructive">{plansQ.error.message}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => plansQ.refetch()}>
                  <RotateCw aria-hidden="true" className="h-3.5 w-3.5" /> Retry
                </Button>
              </div>
            ) : !plansQ.isPending && plans.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
                <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0 text-warning" />
                No active fee plan — create one in Finance first
              </p>
            ) : (
              <Select
                disabled={disabled || plansQ.isPending}
                value={value.feePlanId}
                onValueChange={(feePlanId) => patch({ feePlanId })}
              >
                <SelectTrigger {...a11y}>
                  <SelectValue
                    placeholder={plansQ.isPending ? "Loading fee plans…" : "Choose a fee plan"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          }
        </StudentField>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StudentField id={ids.start} label="Move-in date" isRequired error={errors.startDate}>
          {(a11y) => (
            <Input
              {...a11y}
              type="date"
              className={DATE_INPUT_CLASS}
              disabled={disabled}
              value={value.startDate}
              onChange={(e) => {
                startEditedRef.current = true;
                patch({ startDate: e.target.value });
              }}
            />
          )}
        </StudentField>

        <StudentField id={ids.rent} label="Monthly rent" isRequired error={errors.rentRupees}>
          {(a11y) => (
            <RupeeInput
              {...a11y}
              placeholder={seedsReady ? "Enter monthly rent" : "Loading…"}
              disabled={disabled || !seedsReady}
              value={value.rentRupees}
              onChange={(rentRupees) => {
                rentEditedRef.current = true;
                patch({ rentRupees });
              }}
            />
          )}
        </StudentField>
        <StudentField
          id={ids.deposit}
          label="Security deposit"
          isRequired
          error={errors.depositRupees}
        >
          {(a11y) => (
            <RupeeInput
              {...a11y}
              placeholder={seedsReady ? "0 if none" : "Loading…"}
              disabled={disabled || !seedsReady}
              value={value.depositRupees}
              onChange={(depositRupees) => {
                depositEditedRef.current = true;
                patch({ depositRupees });
              }}
            />
          )}
        </StudentField>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-xs text-foreground">
        <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
        The bed is held for the student now. Rent and deposit are billed automatically after the
        student signs the agreement, and the stay becomes active once the first invoice is paid.
      </p>
    </div>
  );
}
