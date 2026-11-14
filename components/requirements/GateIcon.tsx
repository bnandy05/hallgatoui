import { AlertTriangle, Check, CircleDashed, X } from "lucide-react";
import type { GateStatus } from "@/lib/rules/engine";

/** A condition's state as a mark: met, failed, fixable by a retake, or still open. */
export function GateIcon({ status }: { status: GateStatus }) {
  if (status === "met") return <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />;
  if (status === "failed") return <X className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />;
  if (status === "fixable") return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />;
  return <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-dim" aria-hidden />;
}
