import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { CourseWeekDetail } from "@/components/week/CourseWeekDetail";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.meta.course };
}

export default async function Page(props: PageProps<"/targy/[id]">) {
  const { id } = await props.params;
  return <CourseWeekDetail id={id} />;
}
