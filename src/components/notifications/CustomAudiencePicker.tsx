import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Check, Loader2, Search, UserRound, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  listNoticeAudienceBlocks,
  searchNoticeAudienceStudents,
} from "@/lib/notice-audience.functions";

export interface AudienceStudentOption {
  id: string;
  full_name: string;
  admission_number: string;
  block_name: string | null;
}
export interface AudienceBlockOption {
  id: string;
  name: string;
  student_count: number;
}

interface Props {
  tenantId: string | null;
  propertyId: string;
  students: AudienceStudentOption[];
  blocks: AudienceBlockOption[];
  onStudentsChange: (next: AudienceStudentOption[]) => void;
  onBlocksChange: (next: AudienceBlockOption[]) => void;
  /** Server-resolved recipient count (blocks expanded, duplicates removed). */
  preview: { isLoading: boolean; error: string | null; count: number | null; duplicates: number };
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * "Custom audience" selection for the Notice Composer: search students, pick whole blocks, review and
 * remove what is selected, see the real (de-duplicated) recipient count. Selection only - everything is
 * validated again by the server when previewing and publishing.
 */
export function CustomAudiencePicker({
  tenantId,
  propertyId,
  students,
  blocks,
  onStudentsChange,
  onBlocksChange,
  preview,
}: Props) {
  const blocksFn = useServerFn(listNoticeAudienceBlocks);
  const studentsFn = useServerFn(searchNoticeAudienceStudents);
  const [blockSearch, setBlockSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const debouncedStudentSearch = useDebounced(studentSearch.trim(), 250);

  const blocksQ = useQuery({
    queryKey: ["notice-audience-blocks", tenantId, propertyId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: () => blocksFn({ data: { tenant_id: tenantId!, property_id: propertyId } }),
  });
  const studentsQ = useQuery({
    queryKey: ["notice-audience-students", tenantId, propertyId, debouncedStudentSearch],
    enabled: !!tenantId,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    queryFn: () =>
      studentsFn({
        data: { tenant_id: tenantId!, property_id: propertyId, q: debouncedStudentSearch },
      }),
  });

  const selectedBlockIds = useMemo(() => new Set(blocks.map((b) => b.id)), [blocks]);
  const selectedStudentIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);
  const visibleBlocks = useMemo(() => {
    const q = blockSearch.trim().toLowerCase();
    return (blocksQ.data ?? []).filter((b) => !q || b.name.toLowerCase().includes(q));
  }, [blocksQ.data, blockSearch]);

  const toggleBlock = (b: AudienceBlockOption) =>
    onBlocksChange(
      selectedBlockIds.has(b.id) ? blocks.filter((x) => x.id !== b.id) : [...blocks, b],
    );
  const toggleStudent = (s: AudienceStudentOption) =>
    onStudentsChange(
      selectedStudentIds.has(s.id) ? students.filter((x) => x.id !== s.id) : [...students, s],
    );

  const nothingSelected = students.length === 0 && blocks.length === 0;

  return (
    <div className="space-y-3 rounded-xl border border-border p-3 sm:p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="audience-block-search" className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Blocks
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="audience-block-search"
              className="pl-8"
              placeholder="Search blocks"
              value={blockSearch}
              onChange={(e) => setBlockSearch(e.target.value)}
            />
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto" aria-label="Blocks">
            {blocksQ.isLoading && <li className="p-2 text-xs text-muted-foreground">Loading…</li>}
            {blocksQ.isError && (
              <li className="p-2 text-xs text-destructive">Could not load blocks</li>
            )}
            {blocksQ.isSuccess && visibleBlocks.length === 0 && (
              <li className="p-2 text-xs text-muted-foreground">No blocks found</li>
            )}
            {visibleBlocks.map((b) => {
              const selected = selectedBlockIds.has(b.id);
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleBlock(b)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition",
                      selected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      <span className="truncate">{b.name}</span>
                    </span>
                    <span className="shrink-0 text-xs">{b.student_count} students</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label htmlFor="audience-student-search" className="flex items-center gap-1.5">
            <UserRound className="h-3.5 w-3.5" /> Students
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="audience-student-search"
              className="pl-8"
              placeholder="Search by name or admission no."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto" aria-label="Students">
            {studentsQ.isLoading && <li className="p-2 text-xs text-muted-foreground">Loading…</li>}
            {studentsQ.isError && (
              <li className="p-2 text-xs text-destructive">Could not load students</li>
            )}
            {studentsQ.isSuccess && (studentsQ.data ?? []).length === 0 && (
              <li className="p-2 text-xs text-muted-foreground">No matching students</li>
            )}
            {(studentsQ.data ?? []).map((s) => {
              const selected = selectedStudentIds.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleStudent(s)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition",
                      selected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      <span className="truncate">{s.full_name}</span>
                    </span>
                    <span className="shrink-0 text-xs">
                      {s.admission_number}
                      {s.block_name ? ` · ${s.block_name}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground" role="status" aria-live="polite">
          {nothingSelected && "No recipients selected"}
          {!nothingSelected && preview.isLoading && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Counting recipients…
            </span>
          )}
          {!nothingSelected && !preview.isLoading && preview.error && (
            <span className="text-destructive">{preview.error}</span>
          )}
          {!nothingSelected && !preview.isLoading && !preview.error && preview.count !== null && (
            <>
              {preview.count} recipient{preview.count === 1 ? "" : "s"} selected
              {preview.duplicates > 0 && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  ({preview.duplicates} duplicate{preview.duplicates === 1 ? "" : "s"} removed)
                </span>
              )}
            </>
          )}
        </p>
        {!nothingSelected && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Selected recipients">
            {blocks.map((b) => (
              <li key={`b-${b.id}`}>
                <Badge variant="outline" className="gap-1 rounded-full py-1 pl-2 pr-1">
                  <Building2 className="h-3 w-3" />
                  {b.name}
                  <button
                    type="button"
                    aria-label={`Remove block ${b.name}`}
                    onClick={() => toggleBlock(b)}
                    className="rounded-full p-0.5 hover:bg-muted"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              </li>
            ))}
            {students.map((s) => (
              <li key={`s-${s.id}`}>
                <Badge variant="outline" className="gap-1 rounded-full py-1 pl-2 pr-1">
                  <UserRound className="h-3 w-3" />
                  {s.full_name}
                  <button
                    type="button"
                    aria-label={`Remove ${s.full_name}`}
                    onClick={() => toggleStudent(s)}
                    className="rounded-full p-0.5 hover:bg-muted"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
