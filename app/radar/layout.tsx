import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Határidő-radar",
};

export default function RadarLayout({ children }: LayoutProps<"/radar">) {
  return children;
}
