import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { NoticeComposer } from "@/components/notifications/NoticeComposer";
import { usePropertyStore } from "@/stores/property-store";

export const Route = createFileRoute("/_authenticated/admin/notices")({
  component: AdminNoticesPage,
});

function AdminNoticesPage() {
  const propertyId = usePropertyStore((s) => s.activePropertyId);

  // Lock html/body scroll on this page so only DesktopShell's main content
  // area scrolls (matches the accountant layout's scroll-lock pattern);
  // restore on unmount so other admin pages are unaffected.
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  return (
    <div className="w-full max-w-full space-y-6 overflow-x-hidden">
      {propertyId ? (
        <NoticeComposer propertyId={propertyId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a property from the switcher to compose notices.
        </p>
      )}
    </div>
  );
}
