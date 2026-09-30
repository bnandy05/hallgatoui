import type { Metadata } from "next";
import { CourseDetail } from "@/components/CourseDetail";

export const metadata: Metadata = {
  title: "Tárgy – Hallgatói réteg",
};

export default async function Page(props: PageProps<"/targy/[id]">) {
  const { id } = await props.params;
  return <CourseDetail id={id} />;
}
