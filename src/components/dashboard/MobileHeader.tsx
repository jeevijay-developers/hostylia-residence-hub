import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import logoAsset from "@/assets/hostylia-logo.png.asset.json";

export function MobileHeader() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
      <Link to="/" className="flex items-center gap-2">
        <img src={logoAsset.url} alt="Hostylia" className="h-6 w-auto" />
      </Link>
      <div className="flex items-center gap-1">
        <NotificationBell />
        <LanguageSwitcher />
        <Button
          variant="ghost"
          size="sm"
          className="min-h-10"
          onClick={async () => {
            await signOut();
            window.location.href = "/login";
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> {t("common.signOut")}
        </Button>
      </div>
    </header>
  );
}

