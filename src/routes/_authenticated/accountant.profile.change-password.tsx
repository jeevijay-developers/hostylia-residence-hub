import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChangePasswordForm } from "@/components/dashboard/ChangePasswordForm";

export const Route = createFileRoute("/_authenticated/accountant/profile/change-password")({
  head: () => ({ meta: [{ title: "Change Password — Hostylia" }] }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col gap-3">
      <ChangePasswordForm onSuccess={() => navigate({ to: "/accountant/profile" })} />
    </div>
  );
}
