import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Archive,
  ArrowRightLeft,
  BedDouble,
  Bell,
  CircleX,
  Copy,
  DoorOpen,
  Eye,
  IndianRupee,
  Loader2,
  MoreVertical,
  Pencil,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { RecordPaymentDialog } from "@/components/hostel/students/RecordPaymentDialog";
import { RejectStudentDialog } from "@/components/hostel/students/RejectStudentDialog";
import { StaffGiveNoticeDialog } from "@/components/hostel/students/StaffGiveNoticeDialog";
import { StudentFormDialog } from "@/components/hostel/students/StudentFormDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { invalidateStudentsTab, type StudentDirectoryRow } from "@/lib/property-students";
import { setStudentReviewStatus } from "@/lib/student-admin.functions";
import {
  archiveStudent,
  getStudentDeleteCheck,
  permanentlyDeleteStudent,
} from "@/lib/student-archive.functions";

type DialogKind = "edit" | "payment" | "reject" | "notice" | "archive" | "purge";
type ReviewMove = "VERIFIED" | "APPLICANT";

const REVIEW_TOAST: Record<string, string> = {
  "APPLICANT>VERIFIED": "marked verified",
  "VERIFIED>APPLICANT": "moved back to applicants",
  "REJECTED>APPLICANT": "restored to applicants",
};

/** Why Archive is unavailable for this row, or null when it is allowed (mirrors fn_archive_student). */
function archiveBlocker(row: StudentDirectoryRow): string | null {
  if (row.status === "ACTIVE" || row.status === "NOTICE_GIVEN") return "Move them out first";
  if (row.hasOpenAllocation) return "They still hold a bed allocation";
  return null;
}

function ItemHint({ children }: { children: ReactNode }) {
  return <span className="block text-xs font-normal text-muted-foreground">{children}</span>;
}

/**
 * The Actions menu on a Students directory row. It offers only the lifecycle
 * moves that are valid for the row's status; each one goes through its own
 * server function / RPC (never a raw students.status write), and the database
 * re-checks every rule.
 */
export function StudentRowActions({
  row,
  tenantId,
  propertyId,
}: {
  row: StudentDirectoryRow;
  tenantId: string;
  propertyId: string;
}) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null);
  };
  const refresh = () => invalidateStudentsTab(qc, propertyId);

  const isArchived = row.archivedAt !== null;
  const status = row.status;
  const isReviewable = status === "APPLICANT" || status === "VERIFIED";
  const isLiving = status === "ACTIVE" || status === "NOTICE_GIVEN";
  const canGiveNotice = status === "ACTIVE" && row.stay?.allocationStatus === "ACTIVE";
  const blocker = archiveBlocker(row);

  const reviewFn = useServerFn(setStudentReviewStatus);
  const review = useMutation({
    mutationFn: (next: ReviewMove) => reviewFn({ data: { student_id: row.id, status: next } }),
    onSuccess: (_res, next) => {
      toast.success(`${row.full_name} ${REVIEW_TOAST[`${status}>${next}`] ?? "updated"}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't change the status"),
    onSettled: refresh,
  });

  const archiveFn = useServerFn(archiveStudent);
  const archive = useMutation({
    mutationFn: () => archiveFn({ data: { student_id: row.id } }),
    onSuccess: () => {
      toast.success(`${row.full_name} archived — find them under the Archived filter`);
      setDialog(null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Couldn't archive this student");
      setDialog(null);
    },
    onSettled: refresh,
  });

  // What a permanent delete would remove / what blocks it, checked fresh each time the dialog opens.
  const checkFn = useServerFn(getStudentDeleteCheck);
  const purgeCheck = useQuery({
    queryKey: ["student-delete-check", row.id],
    enabled: dialog === "purge",
    staleTime: 0,
    gcTime: 0,
    queryFn: () => checkFn({ data: { student_id: row.id } }),
  });
  const purgeFn = useServerFn(permanentlyDeleteStudent);
  const purge = useMutation({
    mutationFn: () => purgeFn({ data: { student_id: row.id } }),
    onSuccess: (res) => {
      toast.success(`${row.full_name} permanently deleted`);
      for (const w of res.warnings) toast.warning(w);
      setDialog(null);
      return refresh();
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Couldn't delete this student");
      return qc.invalidateQueries({ queryKey: ["student-delete-check", row.id] });
    },
  });

  const copyPhone = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      toast.success("Phone number copied");
    } catch {
      toast.error(`Couldn't copy automatically. The number is ${phone}`);
    }
  };

  const check = purgeCheck.data;
  const isBusy = review.isPending;

  return (
    <>
      {/* Non-modal so a dialog opened from an item gets focus cleanly once the menu closes. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            aria-label={`Actions for ${row.full_name}`}
            disabled={isBusy}
          >
            {isBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link to="/admin/students/$id" params={{ id: row.id }}>
                <Eye className="h-4 w-4" aria-hidden="true" /> View profile
              </Link>
            </DropdownMenuItem>
            {!isArchived ? (
              <DropdownMenuItem onSelect={() => setDialog("edit")}>
                <Pencil className="h-4 w-4" aria-hidden="true" /> Edit details
              </DropdownMenuItem>
            ) : null}
            {!isArchived && row.dues.kind === "DUE" ? (
              <DropdownMenuItem onSelect={() => setDialog("payment")}>
                <IndianRupee className="h-4 w-4" aria-hidden="true" /> Record payment
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>

          {!isArchived && (isReviewable || status === "REJECTED" || isLiving) ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Change status
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="w-64">
                    {status === "APPLICANT" ? (
                      <DropdownMenuItem onSelect={() => review.mutate("VERIFIED")}>
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Mark verified
                      </DropdownMenuItem>
                    ) : null}
                    {status === "VERIFIED" ? (
                      <DropdownMenuItem onSelect={() => review.mutate("APPLICANT")}>
                        <Undo2 className="h-4 w-4" aria-hidden="true" /> Back to applicant
                      </DropdownMenuItem>
                    ) : null}
                    {isReviewable ? (
                      <DropdownMenuItem
                        disabled={row.hasOpenAllocation}
                        onSelect={() => setDialog("reject")}
                        className="items-start text-destructive focus:text-destructive"
                      >
                        <CircleX className="mt-0.5 h-4 w-4" aria-hidden="true" />
                        <span>
                          Reject…
                          {row.hasOpenAllocation ? (
                            <ItemHint>They hold a bed allocation</ItemHint>
                          ) : null}
                        </span>
                      </DropdownMenuItem>
                    ) : null}
                    {status === "REJECTED" ? (
                      <DropdownMenuItem onSelect={() => review.mutate("APPLICANT")}>
                        <RotateCcw className="h-4 w-4" aria-hidden="true" /> Restore to applicant
                      </DropdownMenuItem>
                    ) : null}
                    {canGiveNotice ? (
                      <DropdownMenuItem onSelect={() => setDialog("notice")}>
                        <Bell className="h-4 w-4" aria-hidden="true" /> Record move-out notice
                      </DropdownMenuItem>
                    ) : null}
                    {isLiving ? (
                      <DropdownMenuItem asChild>
                        <Link to="/admin/students/$id/move-out" params={{ id: row.id }}>
                          <DoorOpen className="h-4 w-4" aria-hidden="true" /> Start move-out
                        </Link>
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              {row.hasOpenAllocation || isReviewable ? (
                <DropdownMenuItem asChild>
                  <Link to="/admin/allocations" search={{ student: row.id }}>
                    {row.hasOpenAllocation ? (
                      <>
                        <ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> Change bed
                      </>
                    ) : (
                      <>
                        <BedDouble className="h-4 w-4" aria-hidden="true" /> Assign bed
                      </>
                    )}
                  </Link>
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}

          {!isArchived || row.phone ? <DropdownMenuSeparator /> : null}
          {!isArchived ? (
            <DropdownMenuItem asChild>
              <Link to="/admin/students/$id" params={{ id: row.id }}>
                <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Review KYC
              </Link>
            </DropdownMenuItem>
          ) : null}
          {row.phone ? (
            <DropdownMenuItem
              onSelect={() => {
                if (row.phone) void copyPhone(row.phone);
              }}
            >
              <Copy className="h-4 w-4" aria-hidden="true" /> Copy phone
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuSeparator />
          {isArchived ? (
            <DropdownMenuItem
              onSelect={() => setDialog("purge")}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Permanently delete
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={blocker !== null}
              onSelect={() => setDialog("archive")}
              className="items-start"
            >
              <Archive className="mt-0.5 h-4 w-4" aria-hidden="true" />
              <span>
                Archive
                {blocker ? <ItemHint>{blocker}</ItemHint> : null}
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialogs mount only while open, so closed rows run none of their queries. */}
      {dialog === "edit" ? (
        <StudentFormDialog
          open
          onOpenChange={closeDialog}
          mode="edit"
          tenantId={tenantId}
          propertyId={propertyId}
          studentId={row.id}
          onDone={refresh}
        />
      ) : null}
      {dialog === "payment" ? (
        <RecordPaymentDialog
          open
          onOpenChange={closeDialog}
          studentId={row.id}
          studentName={row.full_name}
          onDone={refresh}
        />
      ) : null}
      {dialog === "reject" ? (
        <RejectStudentDialog
          open
          onOpenChange={closeDialog}
          studentId={row.id}
          studentName={row.full_name}
          onDone={refresh}
        />
      ) : null}
      {dialog === "notice" && row.stay ? (
        <StaffGiveNoticeDialog
          open
          onOpenChange={closeDialog}
          allocationId={row.stay.allocationId}
          studentName={row.full_name}
          onDone={refresh}
        />
      ) : null}

      <AlertDialog open={dialog === "archive"} onOpenChange={closeDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {row.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They leave the Students directory. Nothing is deleted — all of their records and
              history are kept, and you can find them under the Archived filter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                archive.mutate();
              }}
              disabled={archive.isPending}
              className="rounded-xl"
            >
              {archive.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "purge"} onOpenChange={closeDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {row.full_name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground" aria-live="polite">
                {purgeCheck.isLoading ? (
                  <p className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking what
                    depends on this student…
                  </p>
                ) : purgeCheck.isError ? (
                  <p className="text-destructive">
                    {purgeCheck.error instanceof Error
                      ? purgeCheck.error.message
                      : "Couldn't check this student's records."}
                  </p>
                ) : check && check.blockers.length > 0 ? (
                  <>
                    <p className="font-medium text-destructive">
                      This student can't be permanently deleted — they still have protected records:
                    </p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      {check.blockers.map((b) => (
                        <li key={b.key}>
                          {b.label}: {b.count}
                        </li>
                      ))}
                    </ul>
                    <p>
                      Financial, attendance and stay history is never erased. Leave this student
                      archived — their records stay intact.
                    </p>
                  </>
                ) : check ? (
                  <>
                    <p className="font-medium text-destructive">
                      This cannot be undone. The student record will be erased for good.
                    </p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      <li>
                        {check.documents} KYC / document file{check.documents === 1 ? "" : "s"} will
                        be deleted
                      </li>
                      <li>
                        {check.guardian_links} guardian link
                        {check.guardian_links === 1 ? "" : "s"} will be removed (guardian records
                        themselves are kept)
                      </li>
                      <li>
                        {check.has_login
                          ? check.delete_auth_user
                            ? "Their student login will be deleted"
                            : "Their login account is shared with other records and will be kept"
                          : "No login account is linked"}
                      </li>
                      <li>An audit entry of this deletion is kept</li>
                    </ul>
                  </>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                purge.mutate();
              }}
              disabled={purge.isPending || !check || check.blockers.length > 0 || !check.archived}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {purge.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
