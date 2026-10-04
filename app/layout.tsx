import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { THEME_COLOR, THEME_SCRIPT } from "@/lib/theme";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
  // Android: the keyboard shrinks the layout viewport, so dvh and fixed bars stay above it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets data-theme before the first paint, so <html> differs from the server render.
    <html lang="hu" className={`${archivo.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
