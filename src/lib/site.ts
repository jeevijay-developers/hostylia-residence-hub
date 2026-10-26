export const SITE_ORIGIN = "https://www.hostylia.com";

export const PUBLIC_EMAIL = "info@jeevijay.com";
export const PUBLIC_EMAIL_MAILTO = "mailto:info@jeevijay.com";
export const PUBLIC_EMAIL_HREF = PUBLIC_EMAIL_MAILTO;
export const PUBLIC_PHONE_DISPLAY = "+91 86194 83010";
export const PUBLIC_PHONE_TEL = "tel:+918619483010";
export const OG_IMAGE_URL = `${SITE_ORIGIN}/og.png`;

/** Absolute URL on the canonical www origin. `"/"` stays `https://www.hostylia.com/`. */
export function canonicalUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_ORIGIN}${normalized}`;
}

export const siteUrl = canonicalUrl;
