import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChangePasswordForm } from "@/components/dashboard/ChangePasswordForm";

export const Route = createFileRoute("/_authenticated/admin/profile/change-password")({
  head: () => ({ meta: [{ title: "Change Password — Hostylia" }] }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <ChangePasswordForm onSuccess={() => navigate({ to: "/admin/profile" })} />
    </div>
  );
}
