import { cn } from "@/lib/utils";
import logoAsset from "@/assets/hostylia-logo.png";

/**
 * The brand asset is a single horizontal lockup: mark + "HOSTYLIA" wordmark +
 * "SMART RESIDENTIAL MANAGEMENT" tagline, at roughly 2.55:1. Rendered whole at
 * UI sizes (24–32px tall) the wordmark and tagline collapse into an illegible
 * smudge, which is why callers were pairing it with a duplicate text wordmark.
 *
 * This component crops the one asset into its parts so no surface has to print
 * the brand name twice:
 *
 *   mark    — icon only. Icon rails, collapsed sidebar, tight mobile headers.
 *   lockup  — mark + wordmark composed side by side, tagline dropped. App chrome.
 *   full    — everything including the tagline. Only above ~48px tall, where the
 *             tagline can actually be read: marketing header and footer.
 *
 * `lockup` recomposes rather than taking one wide crop because the mark spans
 * the asset's full height while the tagline sits below the wordmark: any single
 * crop tall enough to keep the whole building also keeps the tagline.
 *
 * Crops are fractions of the natural image so they survive an asset re-export at
 * a different resolution. The geometry has to be inline style: it is computed
 * from those fractions, not a value the spacing scale could express.
 */

interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Intrinsic size of the asset, needed to turn crop fractions into a real ratio. */
const NATURAL = { w: 1491, h: 584 };

/** Fractions of the natural asset (measured from src/assets/hostylia-logo.png). */
const MARK: Crop = { x: 0.015, y: 0.02, w: 0.255, h: 0.96 };
const WORDMARK: Crop = { x: 0.3, y: 0.43, w: 0.68, h: 0.31 };
const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Crop fractions are relative to different totals on each axis, so the rendered
 * ratio has to fold in the asset's own aspect or every crop comes out squashed.
 */
const ratioOf = (crop: Crop) => (crop.w * NATURAL.w) / (crop.h * NATURAL.h);

/** Wordmark cap-height relative to the mark, tuned so the two sit optically level. */
const WORDMARK_SCALE = "42%";

function CroppedAsset({
  crop,
  className,
  style,
  ...rest
}: {
  crop: Crop;
  className?: string;
  style?: React.CSSProperties;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden", className)}
      style={{ aspectRatio: ratioOf(crop), ...style }}
      {...rest}
    >
      <img
        src={logoAsset}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute max-w-none select-none"
        style={{
          width: `${(1 / crop.w) * 100}%`,
          left: `${(-crop.x / crop.w) * 100}%`,
          top: `${(-crop.y / crop.h) * 100}%`,
        }}
      />
    </span>
  );
}

interface BrandLockupProps {
  variant?: "mark" | "lockup" | "full";
  /** Height utility, e.g. "h-8". Width follows from the crop's aspect ratio. */
  className?: string;
  /** Set when an adjacent element already names the brand. */
  isDecorative?: boolean;
}

export function BrandLockup({
  variant = "lockup",
  className = "h-8",
  isDecorative = false,
}: BrandLockupProps) {
  const label = isDecorative ? undefined : "Hostylia";
  const a11y = isDecorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": label } as const);

  if (variant === "lockup") {
    return (
      <span className={cn("flex items-center gap-2", className)} {...a11y}>
        <CroppedAsset crop={MARK} className="h-full" />
        <CroppedAsset crop={WORDMARK} style={{ height: WORDMARK_SCALE }} />
      </span>
    );
  }

  return <CroppedAsset crop={variant === "mark" ? MARK : FULL} className={className} {...a11y} />;
}
