import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Upload, FileCheck2, CheckCircle2 } from "lucide-react";

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
  onUploaded?: () => void;
}

const DOC_TYPES = ["AADHAAR", "COLLEGE_ID", "PHOTO", "OTHER"];

export function KycUploadForm({
  tenantId,
  propertyId,
  studentId,
  existingDocs = [],
  onUploaded,
}: Props) {
  const [docType, setDocType] = useState("AADHAAR");
  const [file, setFile] = useState<File | null>(null);
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

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file");
      const path = `${tenantId}/${propertyId}/students/${studentId}/${docType}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("kyc-documents")
        .upload(path, file, { contentType: file.type, upsert: false });
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
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
        },
      });
    },
    onSuccess: () => {
      toast.success("KYC document uploaded");
      setFile(null);
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
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="h-4 w-4" /> Camera
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" /> Choose file
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={!file || upload.isPending}
          onClick={() => upload.mutate()}
        >
          <FileCheck2 className="h-4 w-4" />
          {upload.isPending ? "Uploading…" : "Upload"}
        </Button>
      </div>
      <Input
        ref={cameraRef}
        className="hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <Input
        ref={fileRef}
        className="hidden"
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {file && (
        <p className="text-xs text-muted-foreground">
          Selected: {file.name} ({Math.round(file.size / 1024)} KB)
        </p>
      )}
    </div>
  );
}
