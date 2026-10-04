import type { Metadata } from "next";
import Link from "next/link";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  title: "E-mail-összefoglaló",
  robots: { index: false },
};

type Action = "megerosites" | "leiratkozas";

const COPY: Record<Action, { title: string; prompt: string; button: string; ok: string }> = {
  megerosites: {
    title: "Feliratkozás megerősítése",
    prompt: "Erősítsd meg, hogy erre a címre kéred az összefoglalót a határidőidről.",
    button: "Megerősítem",
    ok: "Kész, megerősítetted. Az első összefoglaló a következő időszak elején érkezik.",
  },
  leiratkozas: {
    title: "Leiratkozás",
    prompt: "Leiratkozol az e-mailes összefoglalóról? A naptár-előfizetésed megmarad.",
    button: "Leiratkozom",
    ok: "Leiratkoztál, több összefoglalót nem küldünk.",
  },
};

const ERRORS: Record<string, string> = {
  invalid: "A link érvénytelen vagy már nem használható.",
  expired: "A megerősítő link lejárt. Kérj újat a Beállítások → Értesítések oldalon.",
};

function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

// The link from the mail only shows a button: a GET never changes anything, so mail scanners
// that open links can't confirm or unsubscribe. The button posts to /api/hirlevel.
export default async function Page(props: PageProps<"/hirlevel">) {
  const query = await props.searchParams;
  const action: Action = param(query.m) === "leiratkozas" ? "leiratkozas" : "megerosites";
  const result = param(query.eredmeny);
  const token = param(query.t);
  const key = param(query.k);
  const copy = COPY[action];

  let body;
  if (result === "ok") {
    body = <p className="text-[15px] text-foreground">{copy.ok}</p>;
  } else if (result) {
    body = <p className="text-[15px] font-semibold text-danger">{ERRORS[result] ?? ERRORS.invalid}</p>;
  } else if (!token || !key) {
    body = <p className="text-[15px] font-semibold text-danger">{ERRORS.invalid}</p>;
  } else {
    body = (
      <form method="post" action="/api/hirlevel" className="flex flex-col items-start gap-4">
        <input type="hidden" name="m" value={action} />
        <input type="hidden" name="t" value={token} />
        <input type="hidden" name="k" value={key} />
        <p className="text-[15px] text-foreground">{copy.prompt}</p>
        <Button type="submit" variant={action === "leiratkozas" ? "danger" : "primary"}>
          {copy.button}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex max-w-[560px] flex-col gap-6">
      <SectionHeading as="h1" title={copy.title} />
      <Card className="flex flex-col gap-5">
        {body}
        <Link href="/beallitasok#ertesitesek" className={buttonClasses({ variant: "secondary", className: "w-fit" })}>
          Beállítások
        </Link>
      </Card>
    </div>
  );
}
