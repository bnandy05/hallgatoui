"use client";

import { useRef } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useConfirm } from "@/components/ui/ConfirmDialog";
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
  const dirty = useRef(false);
  const { confirm, dialog } = useConfirm();

  async function requestClose() {
    if (!dirty.current || (await confirm({
      title: t.deadlineForm.discardTitle,
      message: t.deadlineForm.discardMessage,
      confirmLabel: t.deadlineForm.discard,
      cancelLabel: t.deadlineForm.keepEditing,
    }))) {
      onClose();
    }
  }

  function handleSubmit(values: DeadlineFormValues[]) {
    if (deadline) {
      updateDeadline(deadline.id, values[0]);
    } else {
      addDeadlines(values);
    }
    onClose();
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={requestClose}
        title={deadline ? t.deadlineDetail.editTitle : t.deadlineDetail.newTitle}
      >
        <DeadlineForm
          initial={deadline}
          defaultCourseId={defaultCourseId}
          initialQuickText={initialQuickText}
          dirtyRef={dirty}
          onSubmit={handleSubmit}
          onCancel={requestClose}
        />
      </Dialog>
      {dialog}
    </>
  );
}
