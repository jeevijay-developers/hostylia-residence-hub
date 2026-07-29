import { Link } from "@tanstack/react-router";
import { BrandLockup } from "@/components/BrandLockup";

/**
 * Marketing-surface brand mark. Defaults to the full lockup including the
 * tagline, which only reads at these larger sizes; app chrome should use
 * <BrandLockup variant="lockup" /> instead.
 */
export function Logo({
  className = "h-9",
  withLink = true,
  variant = "full",
}: {
  className?: string;
  withLink?: boolean;
  variant?: "mark" | "lockup" | "full";
}) {
  const mark = <BrandLockup variant={variant} className={className} />;
  if (!withLink) return mark;
  return (
    <Link to="/" className="inline-flex items-center" aria-label="Hostylia home">
      {mark}
    </Link>
  );
}
