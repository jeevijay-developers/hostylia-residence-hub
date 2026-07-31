import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/theme-store";
import darkLogoAsset from "@/assets/hostylia-logo.png";
import lightLogoAsset from "@/assets/hostylia-logo-light.png";

/**
 * The brand has one lockup per theme, each a single raster asset (icon +
 * "HOSTYLIA" wordmark, dark asset also carries a tagline). Rendered whole at
 * UI sizes (24–32px tall) the wordmark collapses into an illegible smudge,
 * which is why callers were pairing it with a duplicate text wordmark.
 *
 * This component crops each asset into its parts so no surface has to print
 * the brand name twice:
 *
 *   mark    — icon only. Icon rails, collapsed sidebar, tight mobile headers.
 *   lockup  — mark + wordmark composed side by side. App chrome.
 *   full    — everything the asset has (dark: + tagline). Only above ~48px
 *             tall, where the tagline can actually be read: marketing header/footer.
 *
 * `lockup` recomposes rather than taking one wide crop because the two parts
 * don't share a consistent aspect relationship across assets.
 *
 * Crops are fractions of each asset's own natural size (measured with pngjs
 * against the actual file — not eyeballed) so they survive a re-export at a
 * different resolution. The geometry has to be inline style: it is computed
 * from those fractions, not a value the spacing scale could express.
 *
 * The light-theme asset (src/assets/hostylia-logo-light.png) has no alpha
 * channel — its background is an off-white ~#F7F7F7, close enough to the
 * light theme's --card (#FFFFFF) to be imperceptible at icon sizes, but it
 * would show as a visible box on the dark theme's navy chrome. That's why
 * the two assets are swapped per-theme rather than the light one replacing
 * the dark one outright.
 */

interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AssetSpec {
  src: string;
  natural: { w: number; h: number };
  mark: Crop;
  wordmark: Crop;
  wordmarkScale: string;
  full: Crop;
}

const DARK_ASSET: AssetSpec = {
  src: darkLogoAsset,
  natural: { w: 1491, h: 584 },
  mark: { x: 0.015, y: 0.02, w: 0.255, h: 0.96 },
  wordmark: { x: 0.3, y: 0.43, w: 0.68, h: 0.31 },
  wordmarkScale: "42%",
  full: { x: 0, y: 0, w: 1, h: 1 },
};

const LIGHT_ASSET: AssetSpec = {
  src: lightLogoAsset,
  natural: { w: 1536, h: 1024 },
  mark: { x: 0.0807, y: 0.2471, w: 0.2402, h: 0.5137 },
  wordmark: { x: 0.3522, y: 0.5039, w: 0.6042, h: 0.1455 },
  wordmarkScale: "37%",
  full: { x: 0.0807, y: 0.2471, w: 0.8757, h: 0.5137 },
};

/**
 * Crop fractions are relative to different totals on each axis, so the rendered
 * ratio has to fold in the asset's own aspect or every crop comes out squashed.
 */
const ratioOf = (crop: Crop, natural: { w: number; h: number }) =>
  (crop.w * natural.w) / (crop.h * natural.h);

function CroppedAsset({
  asset,
  crop,
  className,
  style,
  ...rest
}: {
  asset: AssetSpec;
  crop: Crop;
  className?: string;
  style?: React.CSSProperties;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("relative block shrink-0 overflow-hidden", className)}
      style={{ aspectRatio: ratioOf(crop, asset.natural), ...style }}
      {...rest}
    >
      <img
        src={asset.src}
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
  const theme = useThemeStore((s) => s.theme);
  const asset = theme === "dark" ? DARK_ASSET : LIGHT_ASSET;

  const label = isDecorative ? undefined : "Hostylia";
  const a11y = isDecorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": label } as const);

  if (variant === "lockup") {
    return (
      <span className={cn("flex items-center gap-2", className)} {...a11y}>
        <CroppedAsset asset={asset} crop={asset.mark} className="h-full" />
        <CroppedAsset
          asset={asset}
          crop={asset.wordmark}
          style={{ height: asset.wordmarkScale }}
        />
      </span>
    );
  }

  return (
    <CroppedAsset
      asset={asset}
      crop={variant === "mark" ? asset.mark : asset.full}
      className={className}
      {...a11y}
    />
  );
}
