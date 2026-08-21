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
        {(child) => <ChatFrame studentId={child.student_id} studentName={child.student_name} />}
      </ParentPageFrame>
    </div>
  );
}

function ChatFrame({ studentId, studentName }: { studentId: string; studentName: string }) {
  const { userId } = useParentChild();
  return (
    <WardenChatThread studentId={studentId} currentUserId={userId} studentName={studentName} />
  );
}
