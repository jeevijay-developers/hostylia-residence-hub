import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useResolvedRole } from "@/lib/user-role";

export const Route = createFileRoute("/_authenticated/admin/properties")({
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
      const slug =
        name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
          .slice(0, 40) || `property-${Date.now()}`;
      const { data, error } = await supabase
        .from("properties")
        .insert({
          tenant_id: tenantId,
          organization_id: orgQ.data.id,
          name: name.trim(),
          slug,
          address_line_1: "TBD",
          city: city.trim() || "TBD",
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
      toast.success("Property created — continue setup");
      nav({ to: "/admin/properties/$id/setup", params: { id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Properties"
        description="Manage the hostels and residences you operate."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Add property
          </Button>
        }
      />

      {properties.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (properties.data ?? []).length === 0 ? (
        <EmptyState
          title="No properties yet"
          description="Create your first property to onboard students, add rooms and start collecting fees."
          action={{ label: "Add property", onClick: () => setOpen(true) }}
        />
      ) : (
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
            <TableBody>
              {(properties.data ?? []).map((p) => {
                const pct =
                  p.bed_count > 0 ? Math.round((p.occupied_count / p.bed_count) * 100) : 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        {p.name}
                      </div>
                    </TableCell>
                    <TableCell>{p.city}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "ACTIVE" ? "default" : "secondary"}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.bed_count}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct}%</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/admin/properties/$id/setup" params={{ id: p.id }}>
                            Setup
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/admin/properties/$id/structure" params={{ id: p.id }}>
                            Structure
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
            </div>
            <div>
              <Label htmlFor="p-city">City</Label>
              <Input id="p-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!name.trim() || createMut.isPending}
            >
              Create & continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
