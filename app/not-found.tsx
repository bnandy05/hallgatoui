import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="flex flex-col items-start gap-6 py-12">
      <SectionHeading as="h1" title={t.notFound.title} sub={t.notFound.sub} />
      <Link href="/" className={buttonClasses()}>
        {t.notFound.back}
      </Link>
    </div>
  );
}
