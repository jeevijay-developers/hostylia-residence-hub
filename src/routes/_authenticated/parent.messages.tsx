import { createFileRoute } from "@tanstack/react-router";

import { ParentPageFrame, useParentChild } from "@/components/parent/ParentPageFrame";
import { WardenChatThread } from "@/components/parent/WardenChatThread";

export const Route = createFileRoute("/_authenticated/parent/messages")({
  component: ParentMessagesPage,
});

function ParentMessagesPage() {
  return (
    <div className="space-y-6">
      <ParentPageFrame>
        {(child) => <ChatFrame studentId={child.student_id} />}
      </ParentPageFrame>
    </div>
  );
}

function ChatFrame({ studentId }: { studentId: string }) {
  const { userId } = useParentChild();
  return <WardenChatThread studentId={studentId} currentUserId={userId} />;
}
