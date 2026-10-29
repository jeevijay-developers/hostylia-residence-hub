import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Eye, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  documentId: string;
  /** Shown in the modal title, e.g. "AADHAAR". */
  documentType: string;
}

interface Loaded {
  url: string;
  kind: "image" | "pdf" | "other";
}

const SIGNED_URL_SECONDS = 60;

/**
 * "View" action for the Admin/Warden KYC review UI. Resolves the document's
 * bucket/path through the reviewer's own session (so `documents` RLS applies),
 * then signs a short-lived URL with that same session (so the existing
 * `kyc-documents` storage policies apply — HOSTEL_ADMIN tenant-wide, WARDEN per
 * property). The bucket stays private; the file is fetched into a blob so the
 * signed URL is never embedded in the page or left in browser history.
 */
export function KycDocumentViewButton({ documentId, documentType }: Props) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setLoaded(null);

    (async () => {
      try {
        const { data: doc, error: dErr } = await supabase
          .from("documents")
          .select("storage_bucket, storage_path, mime_type")
          .eq("id", documentId)
          .is("deleted_at", null)
          .maybeSingle();
        if (dErr) throw new Error(dErr.message);
        if (!doc) throw new Error("Document not found or you do not have access to it.");

        const { data: signed, error: sErr } = await supabase.storage
          .from(doc.storage_bucket)
          .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS);
        if (sErr || !signed) throw new Error(sErr?.message ?? "Could not open the file.");

        const res = await fetch(signed.signedUrl);
        if (!res.ok) throw new Error("The file could not be loaded.");
        const blob = await res.blob();

        const mime = (doc.mime_type || blob.type || "").toLowerCase();
        const kind: Loaded["kind"] = mime.startsWith("image/")
          ? "image"
          : mime === "application/pdf"
            ? "pdf"
            : "other";
        // Re-type the blob from the stored mime so the browser previews it
        // inline even when storage served a generic content type.
        objectUrl = URL.createObjectURL(mime ? new Blob([blob], { type: mime }) : blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setLoaded({ url: objectUrl, kind });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load the document.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, attempt, documentId]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Eye className="h-4 w-4" /> View
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{documentType.replace(/_/g, " ")}</DialogTitle>
            <DialogDescription>Uploaded KYC document</DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading document…
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            >
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Couldn't load this document. {error}
              </p>
              <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </Button>
            </div>
          )}

          {loaded?.kind === "image" && (
            <img
              src={loaded.url}
              alt={`${documentType} document`}
              className="max-h-[70vh] w-full rounded-md object-contain"
            />
          )}
          {loaded?.kind === "pdf" && (
            <iframe
              src={loaded.url}
              title={`${documentType} document`}
              className="h-[70vh] w-full rounded-md border border-border"
            />
          )}
          {loaded?.kind === "other" && (
            <p className="text-sm text-muted-foreground">
              This file type can't be previewed here — use "Open in new tab".
            </p>
          )}
          {loaded && (
            <Button asChild size="sm" variant="outline" className="self-start">
              <a href={loaded.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Open in new tab
              </a>
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
