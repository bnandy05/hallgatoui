import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.meta.digest, robots: { index: false } };
}

function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

// The link from the mail only shows a button: a GET never changes anything, so mail scanners
// that open links can't unsubscribe. The button posts to /api/hirlevel.
export default async function Page(props: PageProps<"/hirlevel">) {
  const t = await getT();
  const query = await props.searchParams;
  const result = param(query.eredmeny);
  const userId = param(query.u);
  const key = param(query.k);

  let body;
  if (result === "ok") {
    body = <p className="text-[15px] text-foreground">{t.unsubscribe.done}</p>;
  } else if (result) {
    body = <p className="text-[15px] font-semibold text-danger">{t.unsubscribe.invalid}</p>;
  } else if (!userId || !key) {
    body = <p className="text-[15px] font-semibold text-danger">{t.unsubscribe.invalid}</p>;
  } else {
    body = (
      <form method="post" action="/api/hirlevel" className="flex flex-col items-start gap-4">
        <input type="hidden" name="m" value="leiratkozas" />
        <input type="hidden" name="u" value={userId} />
        <input type="hidden" name="k" value={key} />
        <p className="text-[15px] text-foreground">{t.unsubscribe.prompt}</p>
        <Button type="submit" variant="danger">
          {t.unsubscribe.button}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex max-w-[560px] flex-col gap-6">
      <SectionHeading as="h1" title={t.unsubscribe.title} />
      <Card className="flex flex-col gap-5">
        {body}
        <Link href="/beallitasok#ertesitesek" className={buttonClasses({ variant: "secondary", className: "w-fit" })}>
          {t.unsubscribe.settings}
        </Link>
      </Card>
    </div>
  );
}
