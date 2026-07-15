import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { ParentPageFrame } from "@/components/parent/ParentPageFrame";
import { WardenChatThread } from "@/components/parent/WardenChatThread";

export const Route = createFileRoute("/_authenticated/parent/messages")({
  component: ParentMessagesPage,
});

function ParentMessagesPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader title={t("parent.messages.title")} />
      <ParentPageFrame>
        {(child) => (
          <ChatFrame studentId={child.student_id} />
        )}
      </ParentPageFrame>
    </div>
  );
}

function ChatFrame({ studentId }: { studentId: string }) {
  const { useParentChild } = require("@/components/parent/ParentPageFrame");
  const { userId } = useParentChild();
  return <WardenChatThread studentId={studentId} currentUserId={userId} />;
}
