import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useResolvedRole } from "@/lib/user-role";
import { useLinkedChildren, type ParentChild } from "@/lib/parent";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Ctx {
  child: ParentChild;
  children: ParentChild[];
  userId: string;
  setChildId: (id: string) => void;
}
const ParentChildContext = createContext<Ctx | null>(null);
export function useParentChild() {
  const c = useContext(ParentChildContext);
  if (!c) throw new Error("useParentChild must be used within ParentPageFrame");
  return c;
}

/**
 * Common wrapper for parent pages: resolves linked children, renders a
 * switcher when more than one, and provides the selected child + userId via
 * context. Renders `notice` when a required guardian permission flag is off.
 */
export function ParentPageFrame({
  requirePermission,
  children,
}: {
  requirePermission?: keyof Pick<
    ParentChild,
    "can_view_attendance" | "can_view_complaints" | "can_view_gate_events" | "can_pay_fees"
  >;
  children: (child: ParentChild) => ReactNode;
}) {
  const { t } = useTranslation();
  const roleQ = useResolvedRole();
  const userId = roleQ.data?.userId ?? null;
  const childrenQ = useLinkedChildren(userId);
  const [selected, setSelected] = useState<string | null>(null);

  const list = childrenQ.data ?? [];
  const current =
    list.find((c) => c.student_id === selected) ?? list.find((c) => c.is_primary) ?? list[0];

  // Hooks must run unconditionally on every render (including the loading
  // and empty-list renders below) so the hook count/order never changes
  // between a cold render (fresh page load) and a warm one (cached query
  // data) — otherwise React throws on the loading -> loaded transition.
  const ctx = useMemo<Ctx | null>(
    () =>
      current && userId
        ? { child: current, children: list, userId, setChildId: setSelected }
        : null,
    [current, list, userId],
  );

  if (roleQ.isLoading || childrenQ.isLoading) return <Skeleton className="h-40 w-full" />;

  if (list.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        {t("parent.noChildren")}
      </p>
    );
  }

  const permOk = !requirePermission || current[requirePermission];

  return (
    <ParentChildContext.Provider value={ctx!}>
      <div className="space-y-4">
        {list.length > 1 && (
          <Select value={current.student_id} onValueChange={(v) => setSelected(v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("parent.childSwitcher")} />
            </SelectTrigger>
            <SelectContent>
              {list.map((c) => (
                <SelectItem key={c.student_id} value={c.student_id}>
                  {c.student_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {permOk ? (
          children(current)
        ) : (
          <p className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            —
          </p>
        )}
      </div>
    </ParentChildContext.Provider>
  );
}
