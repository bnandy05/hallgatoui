import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Heti menetrend",
};

export default function NewLayout({ children }: LayoutProps<"/uj">) {
  return children;
}
