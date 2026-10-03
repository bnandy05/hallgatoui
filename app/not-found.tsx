import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { SectionHeading } from "@/components/ui/SectionHeading";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-6 py-12">
      <SectionHeading
        as="h1"
        eyebrow="404"
        title="Ez az oldal eltévedt hazafelé."
        aside="(Mint Odüsszeusz. Csak remélhetőleg nem tíz évig.)"
      />
      <Link href="/" className={buttonClasses()}>
        Vissza a tárgyakhoz
      </Link>
    </div>
  );
}
