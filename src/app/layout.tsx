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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
