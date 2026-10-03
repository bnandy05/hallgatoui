import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Határidők",
};

export default function RadarLayout({ children }: LayoutProps<"/radar">) {
  return children;
}
