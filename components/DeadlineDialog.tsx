"use client";

import { Dialog } from "@/components/ui/Dialog";
import { DeadlineForm, type DeadlineFormValues } from "@/components/DeadlineForm";
import { useStore } from "@/lib/store";
import { useT } from "@/lib/i18n/I18nProvider";
import type { Deadline } from "@/lib/types";

export interface DeadlineDialogProps {
  open: boolean;
  onClose: () => void;
  deadline?: Deadline;
  defaultCourseId?: string | null;
  initialQuickText?: string;
}

export function DeadlineDialog({
  open,
  onClose,
  deadline,
  defaultCourseId,
  initialQuickText,
}: DeadlineDialogProps) {
  const t = useT();
  const addDeadlines = useStore((s) => s.addDeadlines);
  const updateDeadline = useStore((s) => s.updateDeadline);

  function handleSubmit(values: DeadlineFormValues[]) {
    if (deadline) {
      updateDeadline(deadline.id, values[0]);
    } else {
      addDeadlines(values);
    }
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={deadline ? t.deadlineDetail.editTitle : t.deadlineDetail.newTitle}
    >
      <DeadlineForm
        initial={deadline}
        defaultCourseId={defaultCourseId}
        initialQuickText={initialQuickText}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
    </Dialog>
  );
}
