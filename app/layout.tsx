import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  title: {
    template: "%s – Hallgatói réteg",
    default: "Hallgatói réteg",
  },
  description: "Tárgyak, határidők és linkek egy helyen, a Neptun, a Canvas, a Moodle és a Teams fölött.",
};

export const viewport: Viewport = {
  themeColor: "#dde2e4",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="hu" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
