import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ChangePasswordForm } from "@/components/dashboard/ChangePasswordForm";

export const Route = createFileRoute("/_authenticated/accountant/profile/change-password")({
  head: () => ({ meta: [{ title: "Change Password — Hostylia" }] }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Change Password"
        description="Keep your account secure with a strong password"
      />
      <ChangePasswordForm onSuccess={() => navigate({ to: "/accountant/profile" })} />
    </div>
  );
}
