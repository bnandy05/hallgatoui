import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-6 py-12">
      <SectionHeading as="h1" title="Ez az oldal nem található" sub="Lehet, hogy elírtad a címet, vagy az oldal már nem létezik." />
      <Link href="/" className={buttonClasses()}>
        Vissza a héthez
      </Link>
    </div>
  );
}
