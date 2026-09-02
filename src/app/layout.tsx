import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

const barlow = Barlow({
  variable: "--font-body-family",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-heading-family",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "Finanças — Controle Financeiro Pessoal",
  description: "Dashboard de controle financeiro pessoal",
  applicationName: "Finanças",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Finanças",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2c455d",
  // Required for `env(safe-area-inset-*)` to report real values on notched iOS devices.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <head>
        {/* Chrome fires `beforeinstallprompt` before React hydrates — stash it so the
            in-app "Instalar app" banner can still use it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__installPrompt=e;window.dispatchEvent(new Event('installpromptready'))});",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
