import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h1 className="text-2xl font-semibold text-foreground">Az oldal nem található</h1>
      <p className="max-w-sm text-sm text-muted">
        A keresett oldal nem létezik, vagy időközben elköltözött.
      </p>
      <Link href="/" className={buttonClasses()}>
        Vissza a főoldalra
      </Link>
    </div>
  );
}
