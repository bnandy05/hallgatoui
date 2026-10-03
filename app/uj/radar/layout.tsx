import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Határidő-radar",
};

export default function NewRadarLayout({ children }: LayoutProps<"/uj/radar">) {
  return children;
}
