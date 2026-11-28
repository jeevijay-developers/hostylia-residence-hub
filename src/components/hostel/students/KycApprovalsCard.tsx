import { useEffect, useId, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { StudentAvatar } from "@/components/hostel/students/StudentStatusPill";
import { KycDocumentViewButton } from "@/components/students/KycDocumentViewButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useDecideKycDocument } from "@/lib/kyc-review";
import { KYC_PAGE_SIZE, usePropertyKycQueue, type KycQueueRow } from "@/lib/property-students";

const DOC_LABEL: Record<string, string> = {
  AADHAAR: "Aadhaar",
  COLLEGE_ID: "College ID",
  PHOTO: "Photo",
  OTHER: "Other document",
};

const docLabel = (type: string) => DOC_LABEL[type] ?? type.replace(/_/g, " ");

/** "‹ 2 / 5 ›" pager for the small side cards (0-based page). */
export function CardPager({
  page,
  pages,
  onPageChange,
  label,
}: {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
  /** What is being paged, for screen readers (e.g. "KYC documents"). */
  label: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav
      aria-label={`${label} pages`}
      className="mt-3 flex items-center justify-center gap-2 border-t border-border/60 pt-3 text-sm text-muted-foreground"
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-lg"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        aria-label={`Previous ${label}`}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <span className="tabular-nums" aria-live="polite">
        {page + 1} / {pages}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-lg"
        disabled={page + 1 >= pages}
        onClick={() => onPageChange(page + 1)}
        aria-label={`Next ${label}`}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </nav>
  );
}

function KycRow({ row }: { row: KycQueueRow }) {
  const decide = useDecideKycDocument();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = useId();
  const label = docLabel(row.documentType);
  const name = row.student?.full_name ?? "Unknown student";

  const run = (decision: "VERIFIED" | "REJECTED") =>
    decide.mutate(
      {
        documentId: row.documentId,
        ownerId: row.student?.id ?? "",
        decision,
        reason: decision === "REJECTED" ? reason : undefined,
      },
      {
        onSuccess: () => {
          toast.success(
            `${label} ${decision === "VERIFIED" ? "approved" : "rejected"} for ${name}`,
          );
          setRejectOpen(false);
          setReason("");
        },
        // "This document has already been reviewed" (another reviewer won the race) is shown verbatim.
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save the decision"),
      },
    );

  return (
    <li className="py-3 first:pt-0">
      <div className="flex items-center gap-3">
        <StudentAvatar id={row.student?.id ?? row.documentId} name={row.student?.full_name ?? ""} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {name}
            {row.student ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                ({row.student.admission_number})
              </span>
            ) : null}
          </p>
          <p className="truncate text-xs text-muted-foreground" title={row.fileName ?? undefined}>
            {label}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <KycDocumentViewButton documentId={row.documentId} documentType={row.documentType} />
        <Popover open={rejectOpen} onOpenChange={setRejectOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              disabled={decide.isPending}
              className="text-destructive hover:text-destructive"
            >
              <X className="h-4 w-4" aria-hidden="true" /> Reject
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-2">
            <Label htmlFor={reasonId}>Why are you rejecting this {label}?</Label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Photo is blurry — please upload a clearer copy"
            />
            <p className="text-xs text-muted-foreground">The student sees this reason.</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setRejectOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={decide.isPending || !reason.trim()}
                onClick={() => run("REJECTED")}
              >
                {decide.isPending && decide.variables?.decision === "REJECTED" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                Reject
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <Button size="sm" disabled={decide.isPending} onClick={() => run("VERIFIED")}>
          {decide.isPending && decide.variables?.decision === "VERIFIED" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-4 w-4" aria-hidden="true" />
          )}
          Approve
        </Button>
      </div>
    </li>
  );
}

/** This property's pending KYC documents, oldest first, approved or rejected in place. */
export function KycApprovalsCard({
  tenantId,
  propertyId,
}: {
  tenantId: string;
  propertyId: string;
}) {
  const [page, setPage] = useState(0);
  const kycQ = usePropertyKycQueue(tenantId, propertyId, page);
  const rows = kycQ.data?.rows ?? [];
  const total = kycQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / KYC_PAGE_SIZE));

  // Deciding the last document on a page empties it: step back.
  const isStale = !kycQ.data || kycQ.isPlaceholderData;
  useEffect(() => {
    if (!isStale && page > 0 && page >= pages) setPage(pages - 1);
  }, [isStale, page, pages]);

  return (
    <Card className="flex flex-col rounded-2xl border-border/80 shadow-card-ambient">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          KYC approvals
        </CardTitle>
        {total > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {total.toLocaleString("en-IN")} pending
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1">
        {kycQ.isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading KYC documents">
            {Array.from({ length: KYC_PAGE_SIZE }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : kycQ.isError ? (
          <div className="py-6 text-center" role="alert">
            <p className="text-sm text-muted-foreground">Couldn’t load KYC documents.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => kycQ.refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-success/10 text-success">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-2 text-sm text-muted-foreground">No KYC documents waiting</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border/60" aria-busy={kycQ.isFetching}>
              {rows.map((r) => (
                <KycRow key={r.documentId} row={r} />
              ))}
            </ul>
            <CardPager page={page} pages={pages} onPageChange={setPage} label="KYC documents" />
          </>
        )}
      </CardContent>
    </Card>
  );
}
