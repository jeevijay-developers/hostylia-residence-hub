import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { inviteStaff } from "@/lib/admin-staff.functions";
import {
  DESIGNATION_LABEL,
  STAFF_DESIGNATIONS,
  STAFF_STATUSES,
  asDesignation,
  createRosterStaff,
  isLoginDesignation,
  phoneForInput,
  shiftTimesIssues,
  staffMemberSchema,
  updateRosterStaff,
  type LoginStaff,
  type RosterStaff,
  type StaffBlock,
  type StaffMemberFormValues,
  type StaffMemberInput,
  type StaffStatus,
} from "@/lib/property-staff";
import { cn } from "@/lib/utils";
import {
  DESIGNATION_ICON,
  WORK_AREA_SUGGESTIONS,
  focusFirstError,
  issuesToErrors,
  timeForInput,
} from "./staff-meta";

export type StaffFormMode =
  { kind: "create"; fromLogin?: LoginStaff } | { kind: "edit"; staff: RosterStaff };

const STATUS_LABEL: Record<StaffStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  INACTIVE: "Inactive",
};

const NO_BLOCK = "NONE";

const SHIFT_PRESETS: { label: string; name: string; start: string; end: string }[] = [
  { label: "Day 8–4", name: "Day", start: "08:00", end: "16:00" },
  { label: "Night 8–8", name: "Night", start: "20:00", end: "08:00" },
  { label: "Office 9–6", name: "Office", start: "09:00", end: "18:00" },
  { label: "24 x 7", name: "24 x 7", start: "", end: "" },
  { label: "On call", name: "On call", start: "", end: "" },
];

export type ShiftValues = Pick<
  StaffMemberFormValues,
  "block_id" | "work_area" | "shift_name" | "shift_start" | "shift_end"
>;

export function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-destructive">{message}</p> : null;
}

/** Block / work area + shift name and times. Shared by the staff form and Assign shift. */
export function ShiftFields({
  idPrefix,
  values,
  blocks,
  errors,
  onChange,
}: {
  idPrefix: string;
  values: ShiftValues;
  blocks: StaffBlock[];
  errors: Record<string, string>;
  onChange: (patch: Partial<ShiftValues>) => void;
}) {
  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}-block`}>Block</Label>
        <Select
          value={values.block_id ?? NO_BLOCK}
          onValueChange={(v) => onChange({ block_id: v === NO_BLOCK ? null : v })}
        >
          <SelectTrigger id={`${idPrefix}-block`} className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_BLOCK}>No specific block</SelectItem>
            {blocks.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-area`}>Work area</Label>
        <Input
          id={`${idPrefix}-area`}
          className="mt-1.5"
          list={`${idPrefix}-area-list`}
          value={values.block_id ? "" : values.work_area}
          disabled={!!values.block_id}
          placeholder={values.block_id ? "Uses the block" : "e.g. Office, Main Gate, Mess"}
          maxLength={60}
          onChange={(e) => onChange({ work_area: e.target.value })}
        />
        <datalist id={`${idPrefix}-area-list`}>
          {WORK_AREA_SUGGESTIONS.map((w) => (
            <option key={w} value={w} />
          ))}
        </datalist>
        <FieldError message={errors.work_area} />
      </div>
      <div className="sm:col-span-2">
        <Label>Shift</Label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {SHIFT_PRESETS.map((p) => {
            const on =
              values.shift_name === p.name &&
              values.shift_start === p.start &&
              values.shift_end === p.end;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() =>
                  onChange({ shift_name: p.name, shift_start: p.start, shift_end: p.end })
                }
                className={cn(
                  "h-7 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-pressed={on}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor={`${idPrefix}-shift`} className="text-xs text-muted-foreground">
              Shift name
            </Label>
            <Input
              id={`${idPrefix}-shift`}
              className="mt-1"
              value={values.shift_name}
              maxLength={40}
              placeholder="e.g. Day"
              onChange={(e) => onChange({ shift_name: e.target.value })}
            />
            <FieldError message={errors.shift_name} />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-start`} className="text-xs text-muted-foreground">
              Starts
            </Label>
            <Input
              id={`${idPrefix}-start`}
              type="time"
              className="mt-1"
              value={values.shift_start}
              onChange={(e) => onChange({ shift_start: e.target.value })}
            />
            <FieldError message={errors.shift_start} />
          </div>
          <div>
            <Label htmlFor={`${idPrefix}-end`} className="text-xs text-muted-foreground">
              Ends
            </Label>
            <Input
              id={`${idPrefix}-end`}
              type="time"
              className="mt-1"
              value={values.shift_end}
              onChange={(e) => onChange({ shift_end: e.target.value })}
            />
            <FieldError message={errors.shift_end} />
          </div>
        </div>
      </div>
    </>
  );
}

function initialValues(mode: StaffFormMode): StaffMemberFormValues {
  if (mode.kind === "edit") {
    const s = mode.staff;
    return {
      full_name: s.full_name,
      email: s.email ?? "",
      phone: phoneForInput(s.phone),
      designation: s.designation,
      status: s.status,
      joined_on: s.joined_on ?? "",
      notes: s.notes ?? "",
      block_id: s.block_id,
      work_area: s.work_area ?? "",
      shift_name: s.shift_name ?? "",
      shift_start: timeForInput(s.shift_start),
      shift_end: timeForInput(s.shift_end),
    };
  }
  const l = mode.fromLogin;
  return {
    full_name: l?.profile?.full_name ?? "",
    email: l?.profile?.email ?? "",
    phone: phoneForInput(l?.profile?.phone ?? null),
    designation: l ? asDesignation(String(l.role)) : "CARETAKER",
    status: "ACTIVE",
    joined_on: "",
    notes: "",
    block_id: l?.block_id ?? null,
    work_area: "",
    shift_name: "",
    shift_start: "",
    shift_end: "",
  };
}

/**
 * Add / edit a roster entry. Every column the directory shows is settable here.
 * For Warden / Accountant, "Give app login" also sends the existing staff
 * invite (Settings → Staff) and links the new login to this roster row.
 */
export function StaffFormDialog({
  open,
  onOpenChange,
  mode,
  tenantId,
  propertyId,
  blocks,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: StaffFormMode;
  tenantId: string;
  propertyId: string;
  blocks: StaffBlock[];
  onSaved: () => void;
}) {
  const [values, setValues] = useState<StaffMemberFormValues>(() => initialValues(mode));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [giveLogin, setGiveLogin] = useState(false);
  const inviteFn = useServerFn(inviteStaff);

  const isEdit = mode.kind === "edit";
  const linkedUserId =
    mode.kind === "edit" ? mode.staff.user_id : (mode.fromLogin?.user_id ?? null);
  const canGiveLogin = !linkedUserId && isLoginDesignation(values.designation);

  const set = (patch: Partial<StaffMemberFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k];
      return next;
    });
  };

  /** Field errors show inline (no toast) and the first invalid field gets focus. */
  const showErrors = (next: Record<string, string>) => {
    setErrors(next);
    focusFirstError("sf", next);
  };

  const submit = () => {
    const parsed = staffMemberSchema.safeParse(values);
    if (!parsed.success) {
      showErrors(issuesToErrors([...parsed.error.issues, ...shiftTimesIssues(values)]));
      return;
    }
    const wantLogin = canGiveLogin && giveLogin;
    if (wantLogin && !parsed.data.email) {
      showErrors({ email: "An email is needed to send the app login invite" });
      return;
    }
    save.mutate({ member: parsed.data, wantLogin });
  };

  const save = useMutation({
    mutationFn: async ({ member, wantLogin }: { member: StaffMemberInput; wantLogin: boolean }) => {
      let id: string;
      if (mode.kind === "edit") {
        id = mode.staff.id;
        await updateRosterStaff(id, member);
      } else {
        id = await createRosterStaff({ tenantId, propertyId, userId: linkedUserId, member });
      }

      if (!wantLogin || !member.email || !isLoginDesignation(member.designation)) {
        return { login: "none" as const };
      }
      try {
        const r = await inviteFn({
          data: {
            tenant_id: tenantId,
            property_id: propertyId,
            block_id: member.block_id,
            full_name: member.full_name,
            email: member.email,
            phone: member.phone,
            role: member.designation,
          },
        });
        await updateRosterStaff(id, { user_id: r.invitee_id });
        return { login: r.resent ? ("resent" as const) : ("sent" as const) };
      } catch (e) {
        return {
          login: "failed" as const,
          reason: e instanceof Error ? e.message : "Unknown error",
        };
      }
    },
    onSuccess: (r, { member }) => {
      const name = member.full_name;
      if (r.login === "failed") {
        toast.warning(`${name} saved, but the app login couldn't be created`, {
          description: r.reason,
        });
      } else if (r.login === "sent") {
        toast.success(`${name} saved — app login invite sent`);
      } else if (r.login === "resent") {
        toast.success(`${name} saved — pending app login invite sent again`);
      } else {
        toast.success(isEdit ? `${name} updated` : `${name} added to staff`);
      }
      onSaved();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const DesigIcon = DESIGNATION_ICON[values.designation];

  return (
    <Dialog open={open} onOpenChange={(v) => !save.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit staff" : "Add staff"}</DialogTitle>
          <DialogDescription>
            {mode.kind === "create" && mode.fromLogin
              ? "Adds this app login to the property's staff roster so their shift, block and attendance can be tracked."
              : "Roles here are job titles on this property's roster. App access for Wardens and Accountants is managed in Staff & permissions."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
        >
          <div className="sm:col-span-2">
            <Label htmlFor="sf-name">Full name</Label>
            <Input
              id="sf-name"
              className="mt-1.5"
              value={values.full_name}
              maxLength={120}
              autoComplete="off"
              placeholder="e.g. Amit Sharma"
              onChange={(e) => set({ full_name: e.target.value })}
            />
            <FieldError message={errors.full_name} />
          </div>
          <div>
            <Label htmlFor="sf-role">Role</Label>
            {/* A linked login's roster role must match its app role (enforced in the DB). */}
            <Select
              value={values.designation}
              disabled={!!linkedUserId}
              onValueChange={(v) => set({ designation: asDesignation(v) })}
            >
              <SelectTrigger id="sf-role" className="mt-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <DesigIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {STAFF_DESIGNATIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DESIGNATION_LABEL[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="sf-status">Status</Label>
            <Select
              value={values.status}
              onValueChange={(v) =>
                set({ status: STAFF_STATUSES.find((s) => s === v) ?? "ACTIVE" })
              }
            >
              <SelectTrigger id="sf-status" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAFF_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="sf-phone">Phone</Label>
            <Input
              id="sf-phone"
              className="mt-1.5"
              type="tel"
              inputMode="tel"
              value={values.phone}
              placeholder="10-digit mobile"
              onChange={(e) => set({ phone: e.target.value })}
            />
            <FieldError message={errors.phone} />
          </div>
          <div>
            <Label htmlFor="sf-email">Email</Label>
            <Input
              id="sf-email"
              className="mt-1.5"
              type="email"
              value={values.email}
              placeholder="name@example.com"
              onChange={(e) => set({ email: e.target.value })}
            />
            <FieldError message={errors.email} />
          </div>

          <ShiftFields
            idPrefix="sf"
            values={values}
            blocks={blocks}
            errors={errors}
            onChange={(p) => set(p)}
          />

          <div>
            <Label htmlFor="sf-joined">Joined on</Label>
            <Input
              id="sf-joined"
              type="date"
              className="mt-1.5"
              value={values.joined_on}
              onChange={(e) => set({ joined_on: e.target.value })}
            />
            <FieldError message={errors.joined_on} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="sf-notes">Notes</Label>
            <Textarea
              id="sf-notes"
              className="mt-1.5"
              rows={2}
              maxLength={1000}
              value={values.notes}
              placeholder="Optional — e.g. emergency contact, ID proof on file"
              onChange={(e) => set({ notes: e.target.value })}
            />
            <FieldError message={errors.notes} />
          </div>

          {canGiveLogin ? (
            <label
              htmlFor="sf-login"
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/80 bg-muted/30 p-3 sm:col-span-2"
            >
              <Checkbox
                id="sf-login"
                checked={giveLogin}
                onCheckedChange={(v) => setGiveLogin(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
                  Give app login
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  Sends a {DESIGNATION_LABEL[values.designation]} invite to the email above for this
                  property{values.block_id ? " and block" : ""}, with the role's default
                  permissions. Change permissions later in Staff & permissions.
                </span>
              </span>
            </label>
          ) : linkedUserId ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:col-span-2">
              <KeyRound className="h-3.5 w-3.5 text-info" aria-hidden="true" />
              Linked to an app login, so the role follows the login. Name, phone and permissions of
              the login itself are managed in Staff & permissions.
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Save changes" : "Add staff"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
