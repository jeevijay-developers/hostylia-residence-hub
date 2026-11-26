export type MarketingImage = { src: string; srcSet: string; w: number; h: number };

/** Narrower copies generated next to every image as `<name>-<width>.webp`. */
const VARIANT_WIDTHS = [320, 480, 800] as const;

function image(name: string, w: number, h: number): MarketingImage {
  const variants = VARIANT_WIDTHS.filter((v) => v < w).map(
    (v) => `/marketing/${name}-${v}.webp ${v}w`,
  );
  const src = `/marketing/${name}.webp`;
  return { src, srcSet: [...variants, `${src} ${w}w`].join(", "), w, h };
}

/**
 * Marketing-site images, served from public/marketing/ (WebP, converted from the
 * supplied design PNGs). Plain URL paths, not bundler imports. Each one ships with
 * 320/480/800px variants: pass `srcSet` plus a `sizes` that matches the rendered
 * width so phones don't download desktop-sized files.
 */
export const marketingAssets = {
  hero: image("hero-laptop-pedestal", 1357, 845),
  stepOnboard: image("step-onboard", 640, 607),
  stepOperate: image("step-operate", 640, 445),
  stepAi: image("step-ai", 640, 595),
  room: image("room-isometric", 1100, 825),
  visitorPass: image("visitor-pass", 560, 715),
  complaintBoard: image("complaint-board", 820, 683),
  roleDashboards: image("role-dashboards", 820, 686),
  aiSuite: image("ai-suite", 640, 569),
  planStarter: image("plan-starter", 720, 477),
  planProfessional: image("plan-professional", 720, 555),
  planEnterprise: image("plan-enterprise", 720, 506),
  ctaBuilding: image("cta-building", 1000, 451),
  mobileApp: image("mobile-app", 1000, 1021),
  devices: image("devices", 1200, 625),
  propertyHostel: image("property-hostel", 1200, 528),
  propertyColiving: image("property-coliving", 1200, 528),
  propertySchool: image("property-school", 1200, 675),
  propertyCoaching: image("property-coaching", 1200, 675),
  propertyCollege: image("property-college", 1200, 675),
  propertyStaff: image("property-staff", 1200, 676),
  founder: image("founder-vikas-patel", 640, 912),
} as const;

/**
 * <link rel="preload"> entries for the fonts the redesigned marketing pages paint
 * above the fold (Manrope headings, Inter body; @font-face lives in styles.css).
 * Spread into a marketing route's head().links. Fonts need crossOrigin even
 * when same-origin, or the preload is fetched twice.
 */
export const marketingFontPreloads = [
  {
    rel: "preload",
    as: "font",
    type: "font/woff2",
    href: "/fonts/manrope-latin.woff2",
    crossOrigin: "anonymous",
  },
  {
    rel: "preload",
    as: "font",
    type: "font/woff2",
    href: "/fonts/inter-latin.woff2",
    crossOrigin: "anonymous",
  },
] as const;

/**
 * Extra preload for pages whose Manrope text contains ₹ (U+20B9 lives in the
 * latin-ext subset): the pricing cards on / and /pricing. Without it the subset
 * is discovered late, and its arrival re-lays out every Manrope heading,
 * including the hero h1, which pushes LCP back by ~0.6s.
 */
export const rupeeFontPreload = {
  rel: "preload",
  as: "font",
  type: "font/woff2",
  href: "/fonts/manrope-latin-ext.woff2",
  crossOrigin: "anonymous",
} as const;
