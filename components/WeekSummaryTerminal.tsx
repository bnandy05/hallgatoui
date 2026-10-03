import { Terminal, TerminalLine } from "@/components/ui/Terminal";

export function WeekSummaryTerminal({ total, critical }: { total: number; critical: number }) {
  return (
    <Terminal title="hallgato@reteg: ~/radar">
      <TerminalLine prompt>heti-osszesito</TerminalLine>
      <TerminalLine>
        Ezen a héten {total} dolog jár le, ebből{" "}
        <span className={critical > 0 ? "text-danger" : undefined}>{critical}</span> kritikus.
      </TerminalLine>
    </Terminal>
  );
}
