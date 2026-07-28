import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import "./globals.css";
import { SITE_NAME, SITE_URL } from "@/lib/site-config";
import { getNurseryProfile } from "@/lib/notion";
import { CartProvider } from "@/lib/cart-context";
import CartButton from "@/components/CartButton";
import CartDrawer from "@/components/CartDrawer";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const defaultDescription =
  "Vivero de plantas nativas y exoticas Carilemu. Descubre nuestro catalogo, precios y disponibilidad.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Plantas nativas y exoticas`,
    template: `%s | ${SITE_NAME}`,
  },
  description: defaultDescription,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "es_ES",
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
    <html
      lang="es"
      className={`${manrope.variable} ${sora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CartProvider>
          {children}
          <CartButton />
          <CartDrawer whatsappPhone={nurseryProfile.phone} />
        </CartProvider>
      </body>
    </html>
  );
}
