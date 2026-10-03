import type { Metadata } from "next";
import { Fira_Code } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    template: "%s – Hallgatói réteg",
    default: "Hallgatói réteg",
  },
  description: "Minden tárgyad egy helyen",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="hu"
      className={`${firaCode.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
