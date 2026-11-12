"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_ALERT_KINDS } from "@/lib/alertPrefs";
import { deleteAlertEmail, fetchAlertEmail, saveAlertEmail, type AlertEmailResult } from "@/lib/subscription/client";
import { useDemoMode } from "@/lib/useDemoMode";
import type { AlertKinds } from "@/lib/types";

/** The email channel of the grade alerts (account-owned, opt-in; `/api/fiok/jegyriaszto`). */
export interface GradeAlertEmail {
  /** off: no record (email not sent); on: sending, with `kinds`; loading: first load or a save in flight; error: the last call failed; unavailable: demo, or the server cannot send email. */
  status: "off" | "on" | "loading" | "error" | "unavailable";
  /** The kinds sent by email while `status` is "on". */
  kinds?: AlertKinds;
  /** The account address the mails go to, when known. */
  email?: string;
  /** Whether "E-mail küldése" can be switched on now. */
  canEnable: boolean;
  enable(): void;
  disable(): void;
  setKinds(kinds: AlertKinds): void;
}

interface State {
  phase: "loading" | "ready" | "error" | "unavailable";
  kinds: AlertKinds | null;
  email?: string;
  /** Something was loaded before, so a failed save leaves the switches where they were. */
  loaded: boolean;
}

const noop = () => {};

/** Never calls the server in the demo (no account there). */
export function useGradeAlertEmail(): GradeAlertEmail {
  const demo = useDemoMode();
  const [state, setState] = useState<State>({ phase: "loading", kinds: null, loaded: false });

  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    void fetchAlertEmail().then((r) => {
      if (!cancelled) setState(from(r, null));
    });
    return () => {
      cancelled = true;
    };
  }, [demo]);

  const run = useCallback(
    (call: () => Promise<AlertEmailResult>) => {
      setState((s) => ({ ...s, phase: "loading" }));
      void call().then((r) => setState((s) => from(r, s)));
    },
    []
  );

  if (demo) return { status: "unavailable", canEnable: false, enable: noop, disable: noop, setKinds: noop };

  const { phase, kinds, email } = state;
  const status: GradeAlertEmail["status"] = phase === "ready" ? (kinds ? "on" : "off") : phase;
  return {
    status,
    kinds: kinds ?? undefined,
    email,
    canEnable: phase === "ready" || (phase === "error" && state.loaded),
    enable: () => run(() => saveAlertEmail(DEFAULT_ALERT_KINDS)),
    disable: () => run(deleteAlertEmail),
    setKinds: (next) => run(() => saveAlertEmail(next)),
  };
}

/** The next state from a server answer; a failed call keeps what was known. */
function from(r: AlertEmailResult, previous: State | null): State {
  if (r.error) return { phase: "error", kinds: previous?.kinds ?? null, email: previous?.email, loaded: previous?.loaded ?? false };
  if (r.available === false) return { phase: "unavailable", kinds: null, email: r.email, loaded: true };
  return { phase: "ready", kinds: r.kinds ?? null, email: r.email ?? previous?.email, loaded: true };
}
