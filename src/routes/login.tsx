import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { LoginForm } from "@/components/auth/LoginForm";

const loginSearchSchema = z.object({
  mode: z.enum(["phone", "email"]).optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — Hostylia" },
      { name: "description", content: "Sign in to your Hostylia account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { mode } = Route.useSearch();
  const { t } = require("react-i18next").useTranslation();
  return (
    <AuthLayout title={t("auth.loginTitle")} subtitle={t("auth.loginSubtitle")}>
      <LoginForm defaultMode={mode ?? "phone"} />
    </AuthLayout>
  );
}

