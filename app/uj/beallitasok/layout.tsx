import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Beállítások",
};

export default function NewSettingsLayout({ children }: LayoutProps<"/uj/beallitasok">) {
  return children;
}
