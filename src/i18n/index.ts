import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import hi from "./hi.json";

export type AppLocale = "en" | "hi";

const COOKIE_NAME = "hostylia_locale";

function readCookieLocale(): AppLocale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  const v = match?.[1];
  return v === "en" || v === "hi" ? v : null;
}

export function writeCookieLocale(locale: AppLocale) {
  if (typeof document === "undefined") return;
  // 1-year cookie; SameSite=Lax so it survives redirects
  document.cookie = `${COOKIE_NAME}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
    },
    lng: readCookieLocale() ?? "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export default i18n;
