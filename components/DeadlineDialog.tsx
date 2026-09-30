"use client";

import { Dialog } from "@/components/ui/Dialog";
import { DeadlineForm, type DeadlineFormValues } from "@/components/DeadlineForm";
import { useStore } from "@/lib/store";
import type { Deadline } from "@/lib/types";

export interface DeadlineDialogProps {
  open: boolean;
  onClose: () => void;
  deadline?: Deadline;
  defaultCourseId?: string | null;
}

export function DeadlineDialog({
  open,
  onClose,
  deadline,
  defaultCourseId,
}: DeadlineDialogProps) {
  const addDeadline = useStore((s) => s.addDeadline);
  const updateDeadline = useStore((s) => s.updateDeadline);

  function handleSubmit(values: DeadlineFormValues) {
    if (deadline) {
      updateDeadline(deadline.id, values);
    } else {
      addDeadline(values);
    }
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={deadline ? "Határidő szerkesztése" : "Új határidő"}
    >
      <DeadlineForm
        initial={deadline}
        defaultCourseId={defaultCourseId}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
    </Dialog>
  );
}
