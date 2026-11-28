import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { usePropertyStore } from "@/stores/property-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PropertySwitcherProps {
  tenantId: string | null;
  collapsed?: boolean;
}

interface PropertyRow {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

export function PropertySwitcher({ tenantId, collapsed }: PropertySwitcherProps) {
  const activePropertyId = usePropertyStore((s) => s.activePropertyId);
  const setActivePropertyId = usePropertyStore((s) => s.setActivePropertyId);

  const {
    data: properties,
    isLoading,
    isSuccess,
  } = useQuery({
    queryKey: ["properties", tenantId],
    queryFn: async (): Promise<PropertyRow[]> => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, city, state")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as PropertyRow[];
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });

  const list = properties ?? [];
  const active = list.find((p) => p.id === activePropertyId) ?? list[0] ?? null;

  // Only reconcile against a list that actually loaded — a failed or pending
  // query must not wipe a valid selection. A stored id that isn't in the list
  // (deleted property, or one from another tenant) falls back to the first
  // property, or to nothing when the tenant has none.
  const nextId = active?.id ?? null;
  useEffect(() => {
    if (isSuccess && nextId !== activePropertyId) {
      setActivePropertyId(nextId);
    }
  }, [isSuccess, nextId, activePropertyId, setActivePropertyId]);

  if (isLoading) {
    return <Skeleton className={cn("rounded-xl", collapsed ? "h-10 w-10" : "h-14 w-full")} />;
  }

  if (list.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
          collapsed && "justify-center px-2",
        )}
      >
        <Building2 className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="truncate">No property yet</span>}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Active property: ${active?.name ?? "none"}. Switch property`}
        title={collapsed ? active?.name : undefined}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border border-border/80 bg-background px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          collapsed && "justify-center px-2",
        )}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-4 w-4" />
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight text-foreground">
                {active?.name ?? "Select property"}
              </span>
              {active && (active.city || active.state) ? (
                <span className="block truncate text-xs leading-tight text-muted-foreground">
                  {[active.city, active.state].filter((v) => v && v !== "TBD").join(", ")}
                </span>
              ) : null}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Properties</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {list.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={() => setActivePropertyId(p.id)}
            className="flex items-center justify-between"
          >
            <span className="min-w-0">
              <span className="block truncate">{p.name}</span>
              {p.city && p.city !== "TBD" ? (
                <span className="block truncate text-xs text-muted-foreground">{p.city}</span>
              ) : null}
            </span>
            {p.id === active?.id ? <Check className="h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
