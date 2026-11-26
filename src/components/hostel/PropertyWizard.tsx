import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  Building,
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock,
  GraduationCap,
  Globe,
  Hash,
  Home,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  School,
  Users,
  UserRound,
  UsersRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CityCombobox, SearchableSelect } from "@/components/hostel/PropertyLocationPickers";
import {
  allTimeZones,
  COUNTRY_CODES,
  countryName,
  INDIAN_STATES,
  timeZoneOffsetLabel,
  timeZonesForCountry,
} from "@/lib/locations";
import {
  FIELD_CONTROL,
  PROPERTY_STEPS,
  pickErrors,
  validatePropertyForm,
  type PropertyFieldErrors,
  type PropertyFormValues,
} from "@/lib/property-form";
import type { PropertyFormField, PropertyFormInput } from "@/schemas/hostel";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { lookupIndianPincode } from "@/lib/pincode.functions";

const PROPERTY_TYPES: { value: string; label: string; description: string; icon: LucideIcon }[] = [
  { value: "HOSTEL", label: "Hostel", description: "Rooms and beds for students", icon: Building2 },
  { value: "PG", label: "PG", description: "Paying-guest accommodation", icon: Home },
  { value: "DORMITORY", label: "Dormitory", description: "Shared dorm-style rooms", icon: School },
  {
    value: "COACHING_HOSTEL",
    label: "Coaching hostel",
    description: "Linked to a coaching institute",
    icon: GraduationCap,
  },
];

const GENDER_POLICIES: { value: string; label: string; description: string; icon: LucideIcon }[] = [
  { value: "MALE", label: "Boys only", description: "Male residents", icon: UserRound },
  { value: "FEMALE", label: "Girls only", description: "Female residents", icon: UserRound },
  { value: "COED", label: "Co-ed", description: "Everyone", icon: UsersRound },
  { value: "CUSTOM", label: "Custom", description: "Set per block", icon: Users },
];

const labelFor = (list: { value: string; label: string }[], v: string) =>
  list.find((o) => o.value === v)?.label ?? "—";

interface PropertyWizardProps {
  mode: "create" | "edit";
  initialValues: PropertyFormValues;
  /** Edit mode: the generated, permanent slug (shown read-only). */
  slug?: string;
  /** Shown under country/time zone when they were filled in from the device. */
  locationDetected?: boolean;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (values: PropertyFormInput) => void;
  onCancel: () => void;
}

/**
 * Step-by-step property form, shared by "Add property" and "Property setup".
 * Each step is checked before moving on, and every problem is shown next to
 * its field in plain language (no toasts with raw validation output).
 */
export function PropertyWizard({
  mode,
  initialValues,
  slug,
  locationDetected,
  submitLabel,
  isSubmitting,
  onSubmit,
  onCancel,
}: PropertyWizardProps) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<PropertyFormValues>(initialValues);
  /** Steps whose errors are visible (the user tried to leave them, or submit). */
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(() => new Set());
  const [furthest, setFurthest] = useState(mode === "edit" ? PROPERTY_STEPS.length - 1 : 0);

  const { errors: allErrors } = useMemo(() => validatePropertyForm(values), [values]);
  const visibleErrors: PropertyFieldErrors = {};
  checkedSteps.forEach((i) =>
    Object.assign(visibleErrors, pickErrors(allErrors, PROPERTY_STEPS[i].fields)),
  );

  const current = PROPERTY_STEPS[step];
  const isIndia = values.country_code === "IN";
  const isLast = step === PROPERTY_STEPS.length - 1;

  /*
   * PIN → city / state / country. Looked up 300 ms after the 6th digit (India
   * only). Typing a PIN always fills the place in (once per PIN, so the admin
   * can still correct it afterwards). When an existing property is opened,
   * its saved address is only auto-corrected if it's incomplete (no city, or
   * no valid state); otherwise a "Use …" button offers the PIN's place.
   */
  const lookupPin = useServerFn(lookupIndianPincode);
  const pinCandidate =
    isIndia && /^[1-9]\d{5}$/.test(values.postal_code) ? values.postal_code : null;
  const debouncedPin = useDebouncedValue(pinCandidate, 300);
  const pinQ = useQuery({
    queryKey: ["pincode-lookup", debouncedPin],
    enabled: !!debouncedPin,
    staleTime: Infinity,
    retry: false,
    queryFn: () => lookupPin({ data: { pin: debouncedPin ?? "" } }),
  });
  const pinTouched = useRef(mode === "create");
  const appliedPin = useRef<string | null>(null);
  const applyPlace = (r: { city: string | null; state: string | null }) =>
    setValues((v) => ({
      ...v,
      city: r.city ?? v.city,
      state: r.state ?? v.state,
      country_code: "IN",
      timezone: v.country_code === "IN" ? v.timezone : "Asia/Kolkata",
    }));
  // Runs on the settled PIN *and* on every edit of the field, so retyping the
  // same PIN quickly (the debounced value never changes) still applies it.
  const currentPin = values.postal_code;
  const currentCity = values.city;
  const currentState = values.state;
  useEffect(() => {
    const r = pinQ.data;
    if (!r?.found || !debouncedPin || currentPin !== debouncedPin) return;
    if (appliedPin.current === debouncedPin) return;
    appliedPin.current = debouncedPin;
    const incomplete =
      !currentCity.trim() || !(INDIAN_STATES as readonly string[]).includes(currentState);
    if (!pinTouched.current && !incomplete) return;
    applyPlace(r);
    // applyPlace only calls setValues; currentCity/currentState are read once per settled PIN.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinQ.data, debouncedPin, currentPin]);

  const placeMatches = (r: { city: string | null; state: string | null }) =>
    (!r.city || r.city.toLowerCase() === values.city.trim().toLowerCase()) &&
    (!r.state || r.state === values.state);
  const pinSettled = !!pinCandidate && pinCandidate === debouncedPin && !pinQ.isFetching;
  const pinResult = pinSettled ? pinQ.data : undefined;
  const pinState: "idle" | "loading" | "found" | "missing" | "unavailable" = !pinCandidate
    ? "idle"
    : !pinSettled
      ? "loading"
      : pinQ.isError || pinResult?.unavailable
        ? "unavailable"
        : pinResult?.found
          ? "found"
          : "missing";
  const pinHint = !isIndia ? undefined : pinState === "loading" ? (
    "Looking up this PIN…"
  ) : pinState === "found" && pinResult ? (
    placeMatches(pinResult) ? (
      `${[pinResult.city, pinResult.state].filter(Boolean).join(", ")} — filled in from the PIN.`
    ) : (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        This PIN is in {[pinResult.city, pinResult.state].filter(Boolean).join(", ")}.
        <button
          type="button"
          onClick={() => applyPlace(pinResult)}
          className="rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Use {pinResult.city ?? pinResult.state}
        </button>
      </span>
    )
  ) : pinState === "missing" ? (
    "We couldn't find this PIN. Check it, or fill in the city and state yourself."
  ) : pinState === "unavailable" ? (
    "Couldn't look up this PIN right now. Please fill in the city and state."
  ) : (
    "Enter the 6-digit PIN first — we'll fill in the city, state and country."
  );
  const areaSuggestions = pinState === "found" ? (pinResult?.localities ?? []).slice(0, 8) : [];

  const set = (field: PropertyFormField, value: string) =>
    setValues((v) => ({ ...v, [field]: value }));

  const stepHasErrors = (i: number) =>
    Object.keys(pickErrors(allErrors, PROPERTY_STEPS[i].fields)).length > 0;

  const focusFirstError = (fields: PropertyFormField[]) => {
    const first = fields.find((f) => allErrors[f]);
    if (first)
      window.requestAnimationFrame(() => document.getElementById(`prop-${first}`)?.focus());
  };

  const goNext = () => {
    setCheckedSteps((s) => new Set(s).add(step));
    if (stepHasErrors(step)) {
      focusFirstError(current.fields);
      return;
    }
    const next = Math.min(PROPERTY_STEPS.length - 1, step + 1);
    setStep(next);
    setFurthest((f) => Math.max(f, next));
  };

  const submit = () => {
    setCheckedSteps(new Set(PROPERTY_STEPS.map((_, i) => i)));
    const result = validatePropertyForm(values);
    if (!result.data) {
      const firstBad = PROPERTY_STEPS.findIndex(
        (s) => Object.keys(pickErrors(result.errors, s.fields)).length > 0,
      );
      if (firstBad >= 0) {
        setStep(firstBad);
        focusFirstError(PROPERTY_STEPS[firstBad].fields);
      }
      return;
    }
    onSubmit(result.data);
  };

  const countryOptions = useMemo(
    () =>
      COUNTRY_CODES.map((code) => ({ value: code, label: countryName(code), hint: code })).sort(
        (a, b) => a.label.localeCompare(b.label),
      ),
    [],
  );
  const timeZoneOptions = useMemo(() => {
    const suggested = new Set(timeZonesForCountry(values.country_code));
    const zones = allTimeZones();
    const ordered = [
      ...zones.filter((z) => suggested.has(z)),
      ...zones.filter((z) => !suggested.has(z)),
    ];
    if (values.timezone && !ordered.includes(values.timezone)) ordered.unshift(values.timezone);
    return ordered.map((z) => ({
      value: z,
      label: z.replace(/_/g, " "),
      hint: timeZoneOffsetLabel(z),
    }));
  }, [values.country_code, values.timezone]);

  const onCountryChange = (code: string) => {
    setValues((v) => {
      const zones = timeZonesForCountry(code);
      const timezone = zones.length > 0 && !zones.includes(v.timezone) ? zones[0] : v.timezone;
      const state =
        code === "IN" && !(INDIAN_STATES as readonly string[]).includes(v.state) ? "" : v.state;
      return { ...v, country_code: code, timezone, state };
    });
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <Stepper
        step={step}
        furthest={furthest}
        status={PROPERTY_STEPS.map((_, i) =>
          checkedSteps.has(i) && stepHasErrors(i)
            ? "error"
            : i !== step && i <= furthest && !stepHasErrors(i)
              ? "done"
              : "todo",
        )}
        onSelect={(i) => {
          if (i <= furthest) setStep(i);
        }}
      />

      <section className="rounded-2xl border border-border/80 bg-card shadow-card-ambient">
        <header className="border-b border-border/60 px-5 py-4 sm:px-7">
          <h2 className="font-display text-lg font-semibold text-foreground">{current.title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{current.description}</p>
        </header>

        <div className="space-y-5 px-5 py-6 sm:px-7">
          {current.key === "basics" && (
            <>
              <Field id="name" label="Property name" required error={visibleErrors.name}>
                {(a) => (
                  <IconInput
                    {...a}
                    icon={Building2}
                    value={values.name}
                    placeholder="e.g. Hostylia Kota Residency"
                    onChange={(e) => set("name", e.target.value)}
                    maxLength={120}
                  />
                )}
              </Field>
              {mode === "edit" && slug ? (
                <div className="flex items-start gap-2.5 rounded-xl bg-muted/50 px-3.5 py-3 text-sm">
                  <Link2
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="min-w-0 text-muted-foreground">
                    Public application link:{" "}
                    <span className="break-all font-medium text-foreground">/apply/{slug}</span>
                    <span className="block text-xs">
                      Created automatically and kept the same, so links you've shared keep working.
                    </span>
                  </p>
                </div>
              ) : null}
              <ChoiceField
                id="property_type"
                label="Property type"
                options={PROPERTY_TYPES}
                value={values.property_type}
                onChange={(v) => set("property_type", v)}
                error={visibleErrors.property_type}
              />
              <ChoiceField
                id="gender_policy"
                label="Who can stay here"
                options={GENDER_POLICIES}
                value={values.gender_policy}
                onChange={(v) => set("gender_policy", v)}
                error={visibleErrors.gender_policy}
              />
            </>
          )}

          {current.key === "location" && (
            <>
              <Field
                id="postal_code"
                label={isIndia ? "PIN code" : "Postal code"}
                required
                hint={pinHint}
                error={visibleErrors.postal_code}
              >
                {(a) => (
                  <div className="relative sm:max-w-xs">
                    <Hash
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      {...a}
                      className={cn(FIELD_CONTROL, "pl-10 pr-10 tabular-nums tracking-wide")}
                      value={values.postal_code}
                      inputMode={isIndia ? "numeric" : "text"}
                      autoComplete="postal-code"
                      maxLength={isIndia ? 6 : 10}
                      placeholder={isIndia ? "6 digits, e.g. 324005" : "Postal code"}
                      onChange={(e) => {
                        pinTouched.current = true;
                        appliedPin.current = null;
                        set(
                          "postal_code",
                          isIndia ? e.target.value.replace(/\D/g, "") : e.target.value,
                        );
                      }}
                    />
                    {pinState === "loading" ? (
                      <Loader2
                        className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : pinState === "found" ? (
                      <CheckCircle2
                        className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-success"
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                )}
              </Field>

              <div className="grid gap-5 sm:grid-cols-3">
                <Field
                  id="city"
                  label="City"
                  required
                  hint={isIndia ? "Filled from the PIN, or type to search." : undefined}
                  error={visibleErrors.city}
                >
                  {(a) => (
                    <CityCombobox
                      id={a.id}
                      describedBy={a["aria-describedby"]}
                      invalid={a["aria-invalid"]}
                      value={values.city}
                      suggestionsEnabled={isIndia}
                      onChange={(city) => set("city", city)}
                      onPick={(s) => setValues((v) => ({ ...v, city: s.city, state: s.state }))}
                    />
                  )}
                </Field>
                <Field
                  id="state"
                  label={isIndia ? "State / UT" : "State / region"}
                  required
                  error={visibleErrors.state}
                >
                  {(a) =>
                    isIndia ? (
                      <Select
                        value={values.state || undefined}
                        onValueChange={(v) => set("state", v)}
                      >
                        <SelectTrigger
                          id={a.id}
                          aria-describedby={a["aria-describedby"]}
                          aria-invalid={a["aria-invalid"]}
                          aria-required="true"
                          className={cn(FIELD_CONTROL, "w-full")}
                        >
                          <SelectValue placeholder="Choose the state" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {INDIAN_STATES.map((st) => (
                            <SelectItem key={st} value={st}>
                              {st}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        {...a}
                        className={FIELD_CONTROL}
                        value={values.state}
                        placeholder="State, province or region"
                        onChange={(e) => set("state", e.target.value)}
                        maxLength={100}
                      />
                    )
                  }
                </Field>
                <Field
                  id="country_code"
                  label="Country"
                  required
                  hint={locationDetected ? "Detected from this device." : undefined}
                  error={visibleErrors.country_code}
                >
                  {(a) => (
                    <SearchableSelect
                      id={a.id}
                      describedBy={a["aria-describedby"]}
                      invalid={a["aria-invalid"]}
                      value={values.country_code}
                      options={countryOptions}
                      onChange={onCountryChange}
                      placeholder="Choose the country"
                      searchPlaceholder="Search countries…"
                      emptyText="No country matches that search."
                      icon={
                        <Globe
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      }
                    />
                  )}
                </Field>
              </div>

              <Field
                id="address_line_1"
                label="Address line 1"
                required
                hint="Building name / number and street"
                error={visibleErrors.address_line_1}
              >
                {(a) => (
                  <IconInput
                    {...a}
                    icon={MapPin}
                    value={values.address_line_1}
                    placeholder="e.g. 12, Rajeev Gandhi Nagar, Main Road"
                    onChange={(e) => set("address_line_1", e.target.value)}
                    maxLength={200}
                  />
                )}
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Field
                    id="address_line_2"
                    label="Address line 2"
                    error={visibleErrors.address_line_2}
                  >
                    {(a) => (
                      <Input
                        {...a}
                        className={FIELD_CONTROL}
                        value={values.address_line_2}
                        placeholder="Area, sector or locality"
                        onChange={(e) => set("address_line_2", e.target.value)}
                        maxLength={200}
                      />
                    )}
                  </Field>
                  {areaSuggestions.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Areas in this PIN:</span>
                      {areaSuggestions.map((area) => (
                        <button
                          key={area}
                          type="button"
                          onClick={() => set("address_line_2", area)}
                          aria-pressed={values.address_line_2 === area}
                          className={cn(
                            "rounded-full border px-2.5 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            values.address_line_2 === area
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          {area}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Field id="landmark" label="Landmark" error={visibleErrors.landmark}>
                  {(a) => (
                    <Input
                      {...a}
                      className={FIELD_CONTROL}
                      value={values.landmark}
                      placeholder="e.g. Near City Mall"
                      onChange={(e) => set("landmark", e.target.value)}
                      maxLength={200}
                    />
                  )}
                </Field>
              </div>
              <Field
                id="timezone"
                label="Time zone"
                required
                hint={
                  locationDetected
                    ? "Detected from this device. Used for attendance dates, curfew and notice times."
                    : "Used for attendance dates, curfew and notice times."
                }
                error={visibleErrors.timezone}
              >
                {(a) => (
                  <SearchableSelect
                    id={a.id}
                    describedBy={a["aria-describedby"]}
                    invalid={a["aria-invalid"]}
                    value={values.timezone}
                    options={timeZoneOptions}
                    onChange={(tz) => set("timezone", tz)}
                    placeholder="Choose the time zone"
                    searchPlaceholder="Search time zones, e.g. Kolkata…"
                    emptyText="No time zone matches that search."
                    icon={
                      <Clock
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    }
                  />
                )}
              </Field>
            </>
          )}

          {current.key === "contact" && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field
                  id="phone"
                  label="Phone"
                  required
                  hint="Shown to students and parents."
                  error={visibleErrors.phone}
                >
                  {(a) => (
                    <IconInput
                      {...a}
                      icon={Phone}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={values.phone}
                      placeholder="e.g. 98765 43210"
                      onChange={(e) => set("phone", e.target.value)}
                      maxLength={20}
                    />
                  )}
                </Field>
                <Field
                  id="email"
                  label="Email"
                  hint="For invoices and parent queries."
                  error={visibleErrors.email}
                >
                  {(a) => (
                    <IconInput
                      {...a}
                      icon={Mail}
                      type="email"
                      autoComplete="email"
                      value={values.email}
                      placeholder="e.g. office@yourhostel.com"
                      onChange={(e) => set("email", e.target.value)}
                      maxLength={255}
                    />
                  )}
                </Field>
              </div>
              <Review values={values} onEdit={(i) => setStep(i)} slug={slug} mode={mode} />
            </>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => (step === 0 ? onCancel() : setStep((s) => s - 1))}
          disabled={isSubmitting}
        >
          <ArrowLeft className="h-4 w-4" /> {step === 0 ? "Cancel" : "Back"}
        </Button>
        <div className="flex gap-2">
          {mode === "edit" && !isLast ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={submit}
              disabled={isSubmitting}
            >
              {submitLabel}
            </Button>
          ) : null}
          {isLast ? (
            <Button type="button" className="rounded-xl" onClick={submit} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {submitLabel}
            </Button>
          ) : (
            <Button type="button" className="rounded-xl" onClick={goNext} disabled={isSubmitting}>
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({
  step,
  furthest,
  status,
  onSelect,
}: {
  step: number;
  furthest: number;
  status: ("error" | "done" | "todo")[];
  onSelect: (i: number) => void;
}) {
  return (
    <ol className="flex items-center gap-2 sm:gap-3" aria-label="Steps">
      {PROPERTY_STEPS.map((s, i) => {
        const isCurrent = i === step;
        const isDone = status[i] === "done";
        const hasError = status[i] === "error";
        const reachable = i <= furthest;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => onSelect(i)}
              disabled={!reachable}
              aria-current={isCurrent ? "step" : undefined}
              className="flex min-w-0 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
            >
              <span
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-semibold transition-colors",
                  hasError
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : isCurrent
                      ? "border-primary bg-primary text-primary-foreground"
                      : isDone
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground",
                )}
              >
                {hasError ? (
                  <CircleAlert className="h-4 w-4" aria-hidden="true" />
                ) : isDone && !isCurrent ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  "hidden truncate text-sm sm:block",
                  isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {s.title}
              </span>
              {hasError ? <span className="sr-only"> (needs attention)</span> : null}
            </button>
            {i < PROPERTY_STEPS.length - 1 ? (
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

interface ControlA11y {
  id: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
}

/** Label (+ red asterisk when required), the control, then hint or error. */
function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: PropertyFormField;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  children: (a: ControlA11y) => ReactNode;
}) {
  const controlId = `prop-${id}`;
  const msgId = `${controlId}-msg`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={controlId} className="text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
        )}
      </label>
      {children({
        id: controlId,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error || hint ? msgId : undefined,
        "aria-required": required || undefined,
      })}
      {error ? (
        <p id={msgId} className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <div id={msgId} className="text-xs text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function IconInput({ icon: Icon, ...props }: { icon: LucideIcon } & ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <Icon
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input {...props} className={cn(FIELD_CONTROL, "pl-10")} />
    </div>
  );
}

/** Required single choice shown as cards (radio group). */
function ChoiceField({
  id,
  label,
  options,
  value,
  onChange,
  error,
}: {
  id: PropertyFormField;
  label: string;
  options: { value: string; label: string; description: string; icon: LucideIcon }[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const controlId = `prop-${id}`;
  const msgId = `${controlId}-msg`;
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-foreground">
        {label}
        <span className="ml-0.5 text-destructive" aria-hidden="true">
          *
        </span>
      </legend>
      <div
        role="radiogroup"
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? msgId : undefined}
        className="grid grid-cols-2 gap-2.5 pt-1 lg:grid-cols-4"
      >
        {options.map((o, i) => {
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              id={i === 0 ? controlId : undefined}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(o.value)}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                  : error
                    ? "border-destructive/40 hover:bg-muted/50"
                    : "border-border hover:bg-muted/50",
              )}
            >
              <o.icon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  selected ? "text-primary" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p id={msgId} className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function Review({
  values,
  onEdit,
  slug,
  mode,
}: {
  values: PropertyFormValues;
  onEdit: (step: number) => void;
  slug?: string;
  mode: "create" | "edit";
}) {
  const address = [values.address_line_1, values.address_line_2, values.landmark]
    .filter(Boolean)
    .join(", ");
  const place = [values.city, values.state, values.postal_code].filter(Boolean).join(", ");
  const sections: { step: number; title: string; rows: [string, string][] }[] = [
    {
      step: 0,
      title: "Basics",
      rows: [
        ["Name", values.name || "—"],
        ["Type", labelFor(PROPERTY_TYPES, values.property_type)],
        ["Who can stay", labelFor(GENDER_POLICIES, values.gender_policy)],
      ],
    },
    {
      step: 1,
      title: "Location",
      rows: [
        ["Address", address || "—"],
        ["City", place || "—"],
        ["Country", values.country_code ? countryName(values.country_code) : "—"],
        ["Time zone", values.timezone || "—"],
      ],
    },
  ];
  return (
    <div className="space-y-3 border-t border-border/60 pt-5">
      <h3 className="text-sm font-semibold text-foreground">Review</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {sections.map((s) => (
          <div key={s.title} className="rounded-xl border border-border/80 bg-muted/20 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {s.title}
              </p>
              <button
                type="button"
                onClick={() => onEdit(s.step)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Pencil className="h-3 w-3" aria-hidden="true" /> Edit
              </button>
            </div>
            <dl className="space-y-1.5 text-sm">
              {s.rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="break-words text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Building className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {mode === "create"
          ? "The public application link is created automatically from the name and is unique to this property. Next you'll add blocks, floors, rooms and beds."
          : `Public application link: /apply/${slug ?? ""}`}
      </p>
    </div>
  );
}
