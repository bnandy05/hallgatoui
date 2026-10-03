import type { Metadata } from "next";
import { CourseWeekDetail } from "@/components/week/CourseWeekDetail";

export const metadata: Metadata = {
  title: "Tárgy",
};

export default async function Page(props: PageProps<"/uj/targy/[id]">) {
  const { id } = await props.params;
  return <CourseWeekDetail id={id} />;
}
