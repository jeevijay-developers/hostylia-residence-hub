import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "auto" | "light" | "dark";
    },
  ) => string;
  remove: (widgetId: string) => void;
};

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

function turnstileSiteKey(): string | undefined {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  const key = env.VITE_TURNSTILE_SITE_KEY;
  return typeof key === "string" && key.length > 0 ? key : undefined;
}

function turnstileApi(): TurnstileApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (turnstileApi()) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load captcha."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function useCaptchaToken() {
  const [token, setToken] = useState("");
  const [key, setKey] = useState(0);
  const reset = useCallback(() => {
    setToken("");
    setKey((current) => current + 1);
  }, []);
  return { token, setToken, key, reset };
}

export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const siteKey = turnstileSiteKey();

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let widgetId: string | undefined;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        const api = turnstileApi();
        if (cancelled || !containerRef.current || !api) return;
        widgetId = api.render(containerRef.current, {
          sitekey: siteKey,
          theme: "auto",
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(""),
          "error-callback": () => onTokenRef.current(""),
        });
      })
      .catch(() => onTokenRef.current(""));

    return () => {
      cancelled = true;
      const api = turnstileApi();
      if (widgetId && api) api.remove(widgetId);
    };
  }, [siteKey]);

  if (!siteKey) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Captcha is not configured.
      </p>
    );
  }

  return <div ref={containerRef} className="min-h-16.25" />;
}
