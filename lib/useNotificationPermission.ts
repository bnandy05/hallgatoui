"use client";

import { useSyncExternalStore } from "react";

export type NotificationPermissionState = NotificationPermission | "unsupported";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("focus", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("focus", listener);
  };
}

function getSnapshot(): NotificationPermissionState {
  try {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission;
  } catch {
    return "unsupported";
  }
}

/** Tells subscribed components to re-read the permission (e.g. after requesting it). */
export function refreshNotificationPermission(): void {
  listeners.forEach((l) => l());
}

/** Current notification permission; "unsupported" on the server and in browsers without the API. */
export function useNotificationPermission(): NotificationPermissionState {
  return useSyncExternalStore(subscribe, getSnapshot, () => "unsupported");
}
