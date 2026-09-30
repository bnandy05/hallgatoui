import type { Metadata } from "next";
import { CourseDetail } from "@/components/CourseDetail";

export const metadata: Metadata = {
  title: "Tárgy",
};

export default async function Page(props: PageProps<"/targy/[id]">) {
  const { id } = await props.params;
  return <CourseDetail id={id} />;
}
