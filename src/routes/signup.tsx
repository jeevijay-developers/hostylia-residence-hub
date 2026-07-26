import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useTranslation } from "react-i18next";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { SignupForm } from "@/components/auth/SignupForm";

const signupSearchSchema = z.object({
  mode: z.enum(["phone", "email"]).optional(),
});

export const Route = createFileRoute("/signup")({
  validateSearch: signupSearchSchema,
  head: () => ({
    meta: [
      { title: "Create account — Hostylia" },
      { name: "description", content: "Create your Hostylia account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const { mode } = Route.useSearch();
  const { t } = useTranslation();
  return (
    <AuthLayout title={t("auth.signupTitle")} subtitle={t("auth.signupSubtitle")}>
      <SignupForm defaultMode={mode ?? "email"} />
    </AuthLayout>
  );
}
