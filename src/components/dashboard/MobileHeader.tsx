import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { BrandLockup } from "@/components/BrandLockup";
import { SignOutDialog } from "@/components/dashboard/SignOutDialog";

export function MobileHeader() {
  const { t } = useTranslation();
  const [signOutOpen, setSignOutOpen] = useState(false);
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
      <Link to="/" className="flex items-center gap-2">
        <BrandLockup variant="lockup" className="h-7" />
      </Link>
      <div className="flex items-center gap-1">
        <NotificationBell />
        <LanguageSwitcher />
        <Button
          variant="ghost"
          size="sm"
          className="min-h-10"
          onClick={() => setSignOutOpen(true)}
        >
          {t("common.signOut")}
        </Button>
      </div>
      <SignOutDialog open={signOutOpen} onOpenChange={setSignOutOpen} />
    </header>
  );
}

