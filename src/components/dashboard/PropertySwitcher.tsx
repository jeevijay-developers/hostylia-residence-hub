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
}

export function PropertySwitcher({ tenantId, collapsed }: PropertySwitcherProps) {
  const activePropertyId = usePropertyStore((s) => s.activePropertyId);
  const setActivePropertyId = usePropertyStore((s) => s.setActivePropertyId);

  const { data: properties, isLoading } = useQuery({
    queryKey: ["properties", tenantId],
    queryFn: async (): Promise<PropertyRow[]> => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("properties")
        .select("id, name")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as PropertyRow[];
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });

  const list = properties ?? [];
  const active = list.find((p) => p.id === activePropertyId) ?? list[0] ?? null;

  useEffect(() => {
    if (active && active.id !== activePropertyId) {
      setActivePropertyId(active.id);
    }
  }, [active, activePropertyId, setActivePropertyId]);

  if (isLoading) {
    return <Skeleton className={cn("h-10 rounded-lg", collapsed ? "w-10" : "w-full")} />;
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
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm shadow-sm transition hover:bg-muted",
          collapsed && "justify-center px-2",
        )}
      >
        <Building2 className="h-4 w-4 shrink-0 text-primary" />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">
              {active?.name ?? "Select property"}
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
            <span className="truncate">{p.name}</span>
            {p.id === active?.id ? <Check className="h-4 w-4 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
