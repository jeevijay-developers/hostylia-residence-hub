import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  LayoutGrid,
  MoreVertical,
  Plus,
  Settings2,
} from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { TableSkeleton } from "@/components/dashboard/TableSkeleton";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";
import { INDIAN_CITIES, OTHER_CITY_OPTION } from "@/lib/constants";

export const Route = createFileRoute("/_authenticated/admin/properties/")({
  head: () => ({ meta: [{ title: "Properties — Hostylia" }] }),
  component: PropertiesListPage,
});

interface PropertyRow {
  id: string;
  name: string;
  city: string;
  status: string;
  bed_count: number;
  occupied_count: number;
}

function PropertiesListPage() {
  const { data: resolved } = useResolvedRole();
  const tenantId = resolved?.tenantId ?? null;
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [customCity, setCustomCity] = useState("");

  const nameValid = /\p{L}/u.test(name) && name.trim().length >= 2;
  const resolvedCity = city === OTHER_CITY_OPTION ? customCity.trim() : city;
  const cityValid = resolvedCity.length >= 2;

  const properties = useQuery({
    queryKey: ["admin-properties", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<PropertyRow[]> => {
      const { data: props, error } = await supabase
        .from("properties")
        .select("id, name, city, status")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      if (!props?.length) return [];
      const ids = props.map((p) => p.id);
      const { data: beds } = await supabase
        .from("beds")
        .select("property_id, status")
        .in("property_id", ids)
        .is("deleted_at", null);
      const stats = new Map<string, { total: number; occ: number }>();
      (beds ?? []).forEach((b) => {
        const s = stats.get(b.property_id) ?? { total: 0, occ: 0 };
        s.total += 1;
        if (b.status === "OCCUPIED") s.occ += 1;
        stats.set(b.property_id, s);
      });
      return props.map((p) => {
        const s = stats.get(p.id) ?? { total: 0, occ: 0 };
        return {
          ...p,
          bed_count: s.total,
          occupied_count: s.occ,
        };
      });
    },
  });

  const orgQ = useQuery({
    queryKey: ["admin-tenant-org", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id")
        .eq("tenant_id", tenantId!)
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      if (!orgQ.data?.id) throw new Error("No organization set up for this tenant");
      if (!nameValid) throw new Error("Enter a valid property name");
      if (!cityValid) throw new Error("Select or enter a city");
      const slug =
        name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 40) || `property-${Date.now()}`;
      const { data, error } = await supabase
        .from("properties")
        .insert({
          tenant_id: tenantId,
          organization_id: orgQ.data.id,
          name: name.trim(),
          slug,
          address_line_1: "TBD",
          city: resolvedCity,
          state: "TBD",
          postal_code: "000000",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["admin-properties"] });
      setOpen(false);
      setName("");
      setCity("");
      setCustomCity("");
      toast.success("Property created — continue setup");
      nav({ to: "/admin/properties/$id/setup", params: { id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="max-w-6xl space-y-6 sm:space-y-8">
      <PageHeader
        title="Properties"
        description="Manage your hostel/PG properties and their setup"
        actions={
          <Button
            onClick={() => setOpen(true)}
            className="rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30"
          >
            <Plus className="h-4 w-4" /> Add new property
          </Button>
        }
      />

      {properties.isLoading ? (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Beds</TableHead>
                <TableHead className="text-right">Occupancy</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableSkeleton
              columns={6}
              rows={6}
              widths={["w-32", "w-24", "w-20", "w-16", "w-12", "w-8"]}
            />
          </Table>
        </div>
      ) : (properties.data ?? []).length === 0 ? (
        <EmptyState
          title="No properties yet"
          description="Create your first property to onboard students, add rooms and start collecting fees."
          action={{ label: "Add property", onClick: () => setOpen(true) }}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xl">
          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-3 py-3 sm:px-6 sm:py-4">Name</TableHead>
                  <TableHead className="px-3 py-3 sm:px-6 sm:py-4">City</TableHead>
                  <TableHead className="px-3 py-3 sm:px-6 sm:py-4">Status</TableHead>
                  <TableHead className="px-3 py-3 text-right sm:px-6 sm:py-4">Beds</TableHead>
                  <TableHead className="px-3 py-3 text-right sm:px-6 sm:py-4">Occupancy</TableHead>
                  <TableHead className="px-3 py-3 sm:px-6 sm:py-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(properties.data ?? []).map((p) => {
                  const pct =
                    p.bed_count > 0 ? Math.round((p.occupied_count / p.bed_count) * 100) : 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="px-3 py-3 font-medium sm:px-6 sm:py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 ring-1 ring-primary/30">
                            <Building2 className="h-4 w-4 text-primary" />
                          </span>
                          {p.name}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-3 sm:px-6 sm:py-4">{p.city}</TableCell>
                      <TableCell className="px-3 py-3 sm:px-6 sm:py-4">
                        <Badge
                          variant={p.status === "ACTIVE" ? "default" : "info"}
                          className="gap-1.5"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right tabular-nums sm:px-6 sm:py-4">
                        {p.bed_count}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right tabular-nums sm:px-6 sm:py-4">
                        {pct}%
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right sm:px-6 sm:py-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Actions for ${p.name}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to="/admin/properties/$id/setup" params={{ id: p.id }}>
                                <Settings2 className="mr-2 h-4 w-4" /> Setup
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to="/admin/properties/$id/structure" params={{ id: p.id }}>
                                <LayoutGrid className="mr-2 h-4 w-4" /> Structure
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add property</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="p-name">Property name</Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
              {!nameValid && name.trim().length > 0 && (
                <p className="mt-1 text-xs text-destructive">
                  Enter a valid property name (letters, at least 2 characters — not just numbers).
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="p-city">City</Label>
              <Select value={city} onValueChange={setCity}>
                <SelectTrigger id="p-city">
                  <SelectValue placeholder="Select a city" />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_CITIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER_CITY_OPTION}>Other…</SelectItem>
                </SelectContent>
              </Select>
              {city === OTHER_CITY_OPTION && (
                <Input
                  className="mt-2"
                  placeholder="Enter city name"
                  value={customCity}
                  onChange={(e) => setCustomCity(e.target.value)}
                />
              )}
              {!cityValid && city.length > 0 && (
                <p className="mt-1 text-xs text-destructive">City is required.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!nameValid || !cityValid || createMut.isPending}
            >
              Create & continue <ArrowRight className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
