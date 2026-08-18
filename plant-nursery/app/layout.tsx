import type { Metadata } from "next";
import { Suspense } from "react";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import "./globals.css";
import { SITE_NAME, SITE_URL } from "@/lib/site-config";
import { getNurseryProfile } from "@/lib/notion";
import { CartProvider } from "@/lib/cart-context";
import DocumentLanguageSync from "@/components/DocumentLanguageSync";
import FloatingViewSwitcher from "@/components/FloatingViewSwitcher";
import CartControls from "@/components/CartControls";

const defaultDescription =
  "Vivero de plantas nativas y exoticas Carilemu. Descubre nuestro catalogo, precios y disponibilidad.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Plantas nativas y exoticas`,
    template: `%s | ${SITE_NAME}`,
  },
  description: defaultDescription,
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} | Plantas nativas y exoticas`,
    description: defaultDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | Plantas nativas y exoticas`,
    description: defaultDescription,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nurseryProfile = await getNurseryProfile();

  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <CartProvider>
          <Suspense fallback={null}>
            <DocumentLanguageSync />
          </Suspense>
          <Suspense fallback={null}>
            <FloatingViewSwitcher />
          </Suspense>
          {children}
          <CartControls whatsappPhone={nurseryProfile.phone} />
        </CartProvider>
      </body>
    </html>
  );
}
