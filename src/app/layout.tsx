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
    // Default status-bar style keeps the webview *below* the iOS status bar (clock/battery).
    // "black-translucent" would push content under it — the header ended up over the clock.
    title: "Finanças",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2c455d",
  // Chrome/Android otherwise leaves the layout viewport full-height when the software
  // keyboard opens, so a vertically-centered dialog (100dvh-based) ends up hidden behind
  // it. "resizes-content" shrinks the viewport (and `dvh`) to the space above the keyboard,
  // re-centering dialogs into what's actually visible. iOS Safari ignores this today — the
  // focusin scroll-into-view in DialogContent covers that case.
  interactiveWidget: "resizes-content",
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
