"use client";

import { Dialog } from "@/components/ui/Dialog";
import { CourseForm, type CourseFormValues } from "@/components/CourseForm";
import { useStore } from "@/lib/store";
import { pickCourseColor } from "@/lib/colors";
import type { Course } from "@/lib/types";

export interface CourseDialogProps {
  open: boolean;
  onClose: () => void;
  course?: Course;
}

export function CourseDialog({ open, onClose, course }: CourseDialogProps) {
  const courses = useStore((s) => s.courses);
  const addCourse = useStore((s) => s.addCourse);
  const updateCourse = useStore((s) => s.updateCourse);

  function handleSubmit(values: CourseFormValues) {
    if (course) {
      updateCourse(course.id, values);
    } else {
      addCourse(values);
    }
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={course ? "Tárgy szerkesztése" : "Új tárgy"}>
      <CourseForm
        initial={course}
        defaultColor={pickCourseColor(courses.length)}
        onSubmit={handleSubmit}
        onCancel={onClose}
      />
    </Dialog>
  );
}
