import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Beállítások",
};

export default function SettingsLayout({ children }: LayoutProps<"/beallitasok">) {
  return children;
}
