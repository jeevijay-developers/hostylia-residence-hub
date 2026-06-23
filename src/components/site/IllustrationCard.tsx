type Props = {
  src: string;
  alt: string;
  eager?: boolean;
  className?: string;
  /** Aspect ratio override, defaults to 1/1 */
  ratio?: string;
};

/**
 * Premium rounded illustration frame used to present generated brand visuals
 * across the marketing site (CribApp-style cards in Hostylia palette).
 */
export function IllustrationCard({ src, alt, eager = false, className = "", ratio = "aspect-square" }: Props) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-dark-border bg-gradient-to-br from-[color:var(--indigo-deep)] via-[#0c1530] to-[color:var(--navy)] shadow-2xl ${className}`}
    >
      {/* Soft inner glow accents */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--soft-teal)_30%,transparent),transparent_70%)] blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--brand-blue)_30%,transparent),transparent_70%)] blur-2xl" />
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className={`relative z-[1] block h-full w-full object-cover ${ratio}`}
      />
      {/* Subtle gradient edge */}
      <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/5" />
    </div>
  );
}
