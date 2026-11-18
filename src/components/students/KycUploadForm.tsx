import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileCheck2,
  FileText,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { registerDocument } from "@/lib/student.functions";
import {
  KYC_DOCUMENT_RULES,
  KYC_MAX_FILE_LABEL,
  kycDocumentTypeEnum,
  kycFormatsLabel,
  resolveKycMimeType,
  validateKycFile,
} from "@/schemas/student";

interface ExistingDoc {
  document_type: string;
  verification_status: string;
}

interface Props {
  tenantId: string;
  propertyId: string;
  studentId: string;
  /** Already-submitted docs — KYC only needs one document submitted, ever.
   * Once any document is PENDING or VERIFIED the whole form locks; a
   * REJECTED-only history re-opens it for a fresh submission. */
  existingDocs?: ExistingDoc[];
  /** Preselected type, e.g. the rejected document being re-uploaded. */
  initialDocType?: string;
  onUploaded?: () => void;
}

const DOC_TYPES: readonly string[] = kycDocumentTypeEnum.options;

const CAMERA_UNSUPPORTED =
  "This browser can't access a camera (it may be unsupported, or the page isn't served over HTTPS).";
const CAMERA_DENIED =
  "Camera permission was denied. Allow camera access in your browser settings and try again.";
const CAMERA_UNAVAILABLE =
  "No camera is available, or it is being used by another app. Check your camera and try again.";

function cameraErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return CAMERA_DENIED;
  }
  if (name === "NotSupportedError" || name === "TypeError") return CAMERA_UNSUPPORTED;
  return CAMERA_UNAVAILABLE;
}

/** Phones/tablets hand "Camera" to the OS camera app via `capture`; desktops
 * have no such app, so they get an in-page webcam preview instead. Evaluated at
 * click time (never during render) so it is safe under SSR. */
function isTouchPrimaryDevice(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches &&
    navigator.maxTouchPoints > 0
  );
}

export function KycUploadForm({
  tenantId,
  propertyId,
  studentId,
  existingDocs = [],
  initialDocType,
  onUploaded,
}: Props) {
  const [docType, setDocType] = useState(
    initialDocType && DOC_TYPES.includes(initialDocType) ? initialDocType : "AADHAAR",
  );
  const [file, setFile] = useState<File | null>(null);
  const [fileSource, setFileSource] = useState<"camera" | "file" | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Desktop webcam
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const registerFn = useServerFn(registerDocument);

  // KYC needs exactly one document submission — once anything is pending
  // review or already verified, the whole form locks regardless of type.
  const isSubmitted = useMemo(
    () =>
      existingDocs.some(
        (d) => d.verification_status === "PENDING" || d.verification_status === "VERIFIED",
      ),
    [existingDocs],
  );

  // Re-evaluated on every render so changing the document type re-checks an
  // already chosen/captured file against that type's rules. Camera captures
  // and picked files go through the exact same check.
  const fileError = file ? validateKycFile(file, docType) : null;

  // Live webcam: acquire on open, always release the tracks on close/unmount.
  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;
    let stream: MediaStream | null = null;

    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(CAMERA_UNSUPPORTED);
        setCameraOn(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setCameraReady(true);
      } catch (e) {
        if (!cancelled) {
          setCameraError(cameraErrorMessage(e));
          setCameraOn(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      setCameraReady(false);
    };
  }, [cameraOn]);

  // Preview for the selected/captured image; revoked when replaced or removed.
  useEffect(() => {
    if (!file || !resolveKycMimeType(file.name, file.type).startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function clearFile() {
    setFile(null);
    setFileSource(null);
  }

  function acceptFile(next: File | null, source: "camera" | "file") {
    if (!next) return;
    // Kept even when invalid so the reason (derived below from the current
    // document type) stays visible; Upload is disabled until it is resolved.
    setCameraError(null);
    setFile(next);
    setFileSource(source);
  }

  function openCamera() {
    setCameraError(null);
    if (isTouchPrimaryDevice()) {
      // Native camera app; the chosen photo comes back through onChange.
      cameraRef.current?.click();
    } else {
      setCameraOn(true);
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !cameraReady || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCameraError(CAMERA_UNAVAILABLE);
      setCameraOn(false);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError("Could not capture the photo. Please try again.");
          setCameraOn(false);
          return;
        }
        const captured = new File([blob], `kyc-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        setCameraOn(false);
        acceptFile(captured, "camera");
      },
      "image/jpeg",
      0.9,
    );
  }

  function retake() {
    clearFile();
    openCamera();
  }

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file");
      const invalid = validateKycFile(file, docType);
      if (invalid) throw new Error(invalid);
      const contentType = resolveKycMimeType(file.name, file.type);
      const path = `${tenantId}/${propertyId}/students/${studentId}/${docType}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("kyc-documents")
        .upload(path, file, { contentType, upsert: false });
      if (upErr) throw upErr;
      await registerFn({
        data: {
          tenant_id: tenantId,
          property_id: propertyId,
          owner_type: "STUDENT",
          owner_id: studentId,
          document_type: docType,
          storage_bucket: "kyc-documents",
          storage_path: path,
          original_filename: file.name,
          mime_type: contentType || "application/octet-stream",
          size_bytes: file.size,
        },
      });
    },
    onSuccess: () => {
      toast.success("KYC document uploaded");
      clearFile();
      onUploaded?.();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  if (isSubmitted) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm font-medium text-success">
        <CheckCircle2 className="h-4 w-4" />
        Completed — your KYC document has already been submitted.
      </div>
    );
  }

  const busy = upload.isPending;
  const fileAccept =
    KYC_DOCUMENT_RULES[kycDocumentTypeEnum.catch("OTHER").parse(docType)].mimeTypes.join(",");

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40">
          <label className="text-xs font-medium text-muted-foreground">Document type</label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={busy || cameraOn}
          onClick={openCamera}
        >
          <Camera className="h-4 w-4" /> Camera
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" /> Choose file
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Allowed formats for {docType.replace(/_/g, " ")}: {kycFormatsLabel(docType)}. Maximum size:{" "}
        {KYC_MAX_FILE_LABEL}.
      </p>

      <Input
        ref={cameraRef}
        className="hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          acceptFile(e.target.files?.[0] ?? null, "camera");
          e.target.value = "";
        }}
      />
      <Input
        ref={fileRef}
        className="hidden"
        type="file"
        accept={fileAccept}
        onChange={(e) => {
          acceptFile(e.target.files?.[0] ?? null, "file");
          e.target.value = "";
        }}
      />

      {cameraError && (
        <Alert className="border-destructive/30">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription className="space-y-2 text-destructive">
            <p>{cameraError}</p>
            {/* Explicit fallback: only ever opened by this click, never automatically. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> Choose File
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {fileError && (
        <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {fileError}
        </p>
      )}

      {cameraOn && (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-md border border-border bg-black">
            <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting camera…
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" disabled={!cameraReady} onClick={capture}>
              <Camera className="h-4 w-4" /> Capture
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setCameraOn(false)}
            >
              <X className="h-4 w-4" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {file && !cameraOn && (
        <div className="space-y-2">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Selected document preview"
              className="max-h-64 w-full rounded-md border border-border object-contain"
            />
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-border p-3 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{file.name}</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {file.name} ({Math.round(file.size / 1024)} KB)
          </p>
          <div className="flex flex-wrap gap-2">
            {fileSource === "camera" && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={busy}
                onClick={retake}
              >
                <RotateCcw className="h-4 w-4" /> Retake
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={clearFile}
            >
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={busy || !!fileError}
              onClick={() => upload.mutate()}
            >
              <FileCheck2 className="h-4 w-4" />
              {busy ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
