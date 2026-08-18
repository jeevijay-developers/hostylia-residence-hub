import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CheckCircle2, Loader2, LogIn, LogOut, RotateCcw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type ScanState =
  | "idle"
  | "requesting-camera"
  | "scanning"
  | "validating"
  | "success"
  | "invalid"
  | "expired"
  | "already-used"
  | "denied";

const ERROR_STATES: ScanState[] = ["invalid", "expired", "already-used", "denied"];

/**
 * Classifies scanGatePass's existing thrown messages into a friendly scan
 * outcome — no new validation, this only labels what the server already
 * decided (src/lib/operations.functions.ts:scanGatePass).
 */
function classifyScanError(message: string): "invalid" | "expired" | "already-used" | "denied" {
  const m = message.toLowerCase();
  if (m.includes("invalid qr token") || m.includes("pass not found") || m.includes("no qr issued"))
    return "invalid";
  if (m.includes("expired")) return "expired";
  if (
    m.includes("cannot check out from status") ||
    m.includes("not currently active") ||
    m.includes("not awaiting")
  )
    return "already-used";
  return "denied";
}

const STATE_LABEL: Partial<Record<ScanState, string>> = {
  success: "Success",
  invalid: "Invalid QR",
  expired: "Expired QR",
  "already-used": "Already used",
  denied: "Access denied",
};

export function CameraQrScanner({
  direction,
  onDirectionChange,
  onDetected,
}: {
  direction: "IN" | "OUT";
  onDirectionChange: (d: "IN" | "OUT") => void;
  /** Reuses the same scanGatePass mutation the manual form already calls — this component never validates on its own. */
  onDetected: (payload: { pass_id: string; token: string }) => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const [state, setState] = useState<ScanState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  function stop() {
    scanningRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => stop, []);

  function tick() {
    if (!scanningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          void handleDecoded(code.data);
          return;
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  async function handleDecoded(raw: string) {
    scanningRef.current = false;
    setState("validating");
    let payload: { id?: string; t?: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      setState("invalid");
      setMessage("This QR code isn't a Hostylia gate pass.");
      stop();
      return;
    }
    if (!payload.id || !payload.t) {
      setState("invalid");
      setMessage("This QR code isn't a Hostylia gate pass.");
      stop();
      return;
    }
    try {
      await onDetected({ pass_id: payload.id, token: payload.t });
      setState("success");
      setMessage(`Checked ${direction === "OUT" ? "out" : "in"} successfully.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not validate this pass.";
      setState(classifyScanError(msg));
      setMessage(msg);
    } finally {
      stop();
    }
  }

  async function start() {
    setState("requesting-camera");
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("scanning");
      scanningRef.current = true;
      tick();
    } catch {
      setState("denied");
      setMessage("Camera access denied. Use manual entry below instead.");
    }
  }

  const isError = ERROR_STATES.includes(state);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          className="flex-1"
          variant={direction === "OUT" ? "default" : "outline"}
          disabled={state === "scanning" || state === "validating"}
          onClick={() => onDirectionChange("OUT")}
        >
          <LogOut className="h-4 w-4" /> Check OUT
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1"
          variant={direction === "IN" ? "default" : "outline"}
          disabled={state === "scanning" || state === "validating"}
          onClick={() => onDirectionChange("IN")}
        >
          <LogIn className="h-4 w-4" /> Check IN
        </Button>
      </div>

      {(state === "idle" || state === "denied") && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/30 py-8 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary">
            <Camera className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-xs text-muted-foreground">Camera is off — start it to scan a pass</p>
        </div>
      )}

      {(state === "scanning" || state === "validating") && (
        <div className="relative overflow-hidden rounded-md border border-border bg-black">
          <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
          <canvas ref={canvasRef} className="hidden" />
          {state === "validating" && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {state === "scanning" && (
            <p className="absolute inset-x-0 bottom-0 bg-background/80 p-1.5 text-center text-xs text-muted-foreground">
              Point the camera at the pass QR code
            </p>
          )}
        </div>
      )}

      {state === "success" && (
        <Alert className="border-success/30 text-success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription className="text-success">{message}</AlertDescription>
        </Alert>
      )}

      {isError && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-medium">{STATE_LABEL[state]}.</span> {message}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        {(state === "idle" || state === "denied") && (
          <Button type="button" size="sm" onClick={() => void start()}>
            <Camera className="h-4 w-4" /> Start Camera
          </Button>
        )}
        {state === "requesting-camera" && (
          <Button type="button" size="sm" disabled>
            <Loader2 className="h-4 w-4 animate-spin" /> Requesting camera access…
          </Button>
        )}
        {(state === "scanning" || state === "validating") && (
          <Button type="button" size="sm" variant="outline" onClick={stop}>
            Cancel
          </Button>
        )}
        {(state === "success" || (isError && state !== "denied")) && (
          <Button type="button" size="sm" variant="outline" onClick={() => void start()}>
            <RotateCcw className="h-4 w-4" /> Scan Again
          </Button>
        )}
      </div>
      <p className={cn("text-xs text-muted-foreground", state !== "idle" && "sr-only")}>
        Or paste the Pass ID and token manually below.
      </p>
    </div>
  );
}
