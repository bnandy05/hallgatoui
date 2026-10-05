import type { Metadata } from "next";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  title: "E-mail-összefoglaló",
  robots: { index: false },
};

const PROMPT = "Leiratkozol az e-mail-összefoglalóról? A naptár feliratkozási linkje továbbra is működik.";

const ERRORS: Record<string, string> = {
  invalid: "A link érvénytelen vagy már nem használható.",
};

function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

// The link from the mail only shows a button: a GET never changes anything, so mail scanners
// that open links can't unsubscribe. The button posts to /api/hirlevel.
export default async function Page(props: PageProps<"/hirlevel">) {
  const query = await props.searchParams;
  const result = param(query.eredmeny);
  const userId = param(query.u);
  const key = param(query.k);

  let body;
  if (result === "ok") {
    body = <p className="text-[15px] text-foreground">Sikeresen leiratkoztál, további összefoglalót nem küldünk.</p>;
  } else if (result) {
    body = <p className="text-[15px] font-semibold text-danger">{ERRORS[result] ?? ERRORS.invalid}</p>;
  } else if (!userId || !key) {
    body = <p className="text-[15px] font-semibold text-danger">{ERRORS.invalid}</p>;
  } else {
    body = (
      <form method="post" action="/api/hirlevel" className="flex flex-col items-start gap-4">
        <input type="hidden" name="m" value="leiratkozas" />
        <input type="hidden" name="u" value={userId} />
        <input type="hidden" name="k" value={key} />
        <p className="text-[15px] text-foreground">{PROMPT}</p>
        <Button type="submit" variant="danger">
          Leiratkozom
        </Button>
      </form>
    );
  }

  return (
    <div className="flex max-w-[560px] flex-col gap-6">
      <SectionHeading as="h1" title="Leiratkozás" />
      <Card className="flex flex-col gap-5">
        {body}
        <Link href="/beallitasok#ertesitesek" className={buttonClasses({ variant: "secondary", className: "w-fit" })}>
          Beállítások
        </Link>
      </Card>
    </div>
  );
}
