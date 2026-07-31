import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getNurseryProfile, getPlantCategories, getPlantsPage } from "../lib/notion";
import PlantCatalog from "@/components/PlantCatalog";
import FloatingWhatsAppButton from "@/components/FloatingWhatsAppButton";
import { SITE_NAME, SITE_URL } from "@/lib/site-config";
import { appendLanguageParam, normalizeSiteLanguage, type SiteLanguage } from "@/lib/site-language";

export const revalidate = 60;

type PageSearchParams = {
  category?: string;
  cursor?: string;
  q?: string;
  nativo?: string;
  lang?: string;
};

function hasSearchParams(searchParams?: PageSearchParams): boolean {
  return Boolean(
    searchParams?.category?.trim() ||
      searchParams?.cursor?.trim() ||
      searchParams?.q?.trim() ||
      searchParams?.nativo?.trim()
  );
}

const copy: Record<SiteLanguage, {
  title: string;
  description: string;
  heroTitle: string;
  heroDescription: string;
  aboutButton: string;
  catalogFallback: string;
  profileAlt: string;
  whatsapp: string;
  directions: string;
  languageLabel: string;
  languageLabelShort: string;
}> = {
  es: {
    title: "Vivero Karu-lemu | Plantas nativas y exoticas en catalogo online",
    description: "Explora el catalogo de plantas nativas y exoticas del Vivero Karu-lemu: precios, disponibilidad y caracteristicas de cada especie.",
    heroTitle: "Vivero \"karū-lemu\" - plantas nativas y exóticas",
    heroDescription: "Explora el catalogo y descubre plantas nativas y exoticas para tu espacio.",
    aboutButton: "Sobre Nuestro Vivero",
    catalogFallback: "Explora el catalogo y descubre plantas nativas y exoticas para tu espacio.",
    profileAlt: "Vivero de plantas nativas y exoticas Carilemu",
    whatsapp: "Escribir por WhatsApp",
    directions: "Ver direccion en mapa",
    languageLabel: "English",
    languageLabelShort: "EN",
  },
  en: {
    title: "Vivero Karu-lemu | Native and exotic plants online catalog",
    description: "Browse the Vivero Karu-lemu catalog of native and exotic plants: prices, availability, and details for each species.",
    heroTitle: "Vivero \"karū-lemu\" - native and exotic plants",
    heroDescription: "Browse the catalog and discover native and exotic plants for your space.",
    aboutButton: "About Our Nursery",
    catalogFallback: "Browse the catalog and discover native and exotic plants for your space.",
    profileAlt: "Vivero Karilemu native and exotic plants nursery",
    whatsapp: "Contact via WhatsApp",
    directions: "View directions on map",
    languageLabel: "Español",
    languageLabelShort: "ES",
  },
};

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<PageSearchParams> }
): Promise<Metadata> {
  const params = await searchParams;
  const lang = normalizeSiteLanguage(params.lang);
  const title = copy[lang].title;
  const description = copy[lang].description;

  if (hasSearchParams(params)) {
    return {
      title,
      description,
      alternates: { canonical: SITE_URL },
      openGraph: {
        title,
        description,
        url: SITE_URL,
      },
    };
  }

  const nurseryProfile = await getNurseryProfile(lang);

  return {
    title,
    description,
    alternates: { canonical: SITE_URL },
    openGraph: {
      title,
      description,
      url: SITE_URL,
      images: nurseryProfile.image ? [{ url: nurseryProfile.image }] : undefined,
    },
  };
}

type HomeProps = {
  searchParams: Promise<PageSearchParams>;
};

function sanitizePhoneToWa(value: string): string {
  return value.replace(/[^\d]/g, "");
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const { category, cursor, q, nativo } = params;
  const lang = normalizeSiteLanguage(params.lang);

  const activeCategory = category?.trim() || "";
  const activeCursor = cursor?.trim() || "";
  const activeQuery = q?.trim() || "";
  const activeNativo = nativo === "true" ? true : nativo === "false" ? false : undefined;
  const searchMode = hasSearchParams({ category, cursor, q, nativo });

  const [categories, plantsPage, nurseryProfile] = await Promise.all([
    getPlantCategories(),
    getPlantsPage({
      category: activeCategory || undefined,
      cursor: activeCursor || undefined,
      query: activeQuery || undefined,
      nativo: activeNativo,
      pageSize: 12,
      lang,
    }),
    searchMode
      ? Promise.resolve({
          description: "",
          image: "",
          phone: "",
          whatsappText: "",
          location: "",
          mapUrl: "",
        })
        : getNurseryProfile(lang),
  ]);

  const waPhone = sanitizePhoneToWa(nurseryProfile.phone);
  const waHref =
    waPhone && nurseryProfile.whatsappText
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(nurseryProfile.whatsappText)}`
      : waPhone
        ? `https://wa.me/${waPhone}`
        : "";

  const mapHref = nurseryProfile.mapUrl?.trim() || "";

  const localBusinessJsonLd = {
    "@context": "https://schema.org",
    "@type": "GardenStore",
    name: SITE_NAME,
    description: nurseryProfile.description || undefined,
    url: SITE_URL,
    image: nurseryProfile.image || undefined,
    telephone: nurseryProfile.phone || undefined,
    address: nurseryProfile.location
      ? { "@type": "PostalAddress", addressLocality: nurseryProfile.location }
      : undefined,
    hasMap: mapHref || undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
      />

      <section
        id="home-hero"
        className="relative left-1/2 right-1/2 -mx-[50vw] mb-8 w-screen min-h-[100svh] overflow-hidden bg-gradient-to-br from-[#16352f] via-[#2f5f4f] to-[#8b4f35]"
      >
        {nurseryProfile.image && (
          <Image
            src={nurseryProfile.image}
            alt={copy[lang].profileAlt}
            fill
            priority
            unoptimized
            className="object-cover"
            sizes="100vw"
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-b from-[#16352f]/45 via-[#2f5f4f]/30 to-[#16352f]/50" />

        <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-6xl items-end px-4 pb-8 sm:px-6 sm:pb-10 md:px-10 md:pb-10 md:pt-10">
          <div className="mapuche-hero-overlay w-full rounded-3xl p-5 backdrop-blur-sm sm:p-6 md:p-8">
            <h1 className="text-3xl font-bold leading-tight text-[#f8f0e4] md:text-5xl">
              {copy[lang].heroTitle}
            </h1>

            <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white md:text-lg">
              {nurseryProfile.description || copy[lang].catalogFallback}
            </p>

            <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[#f2dcc0]">
              {/* Inspirado en la identidad mapuche de la Araucania */}
            </p>

            {nurseryProfile.phone && (
              <p className="mt-4 text-sm text-white/90">
                {lang === "en" ? "Phone" : "Telefono"}: {nurseryProfile.phone}
              </p>
            )}

            {nurseryProfile.location && (
              <p className="text-sm text-white/90">
                {lang === "en" ? "Location" : "Ubicacion"}: {nurseryProfile.location}
              </p>
            )}

            {(waHref || mapHref) && (
              <div className="mt-5 flex flex-wrap gap-3">
                {waHref && (
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mapuche-button-primary"
                  >
                    {copy[lang].whatsapp}
                  </a>
                )}

                {mapHref && (
                  <a
                    href={mapHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mapuche-button-secondary"
                  >
                    {copy[lang].directions}
                  </a>
                )}

                <Link href={appendLanguageParam("/sobre-nuestro-vivero", lang)} className="mapuche-button-secondary">
                  {copy[lang].aboutButton}
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="mapuche-ornament-band">
        <div className="lg:hidden">
          <Image
            src="/illustrations/ornament-mapuche1.png"
            alt="Ornamento mapuche"
            width={1920}
            height={120}
            unoptimized
            className="mapuche-ornament-mobile"
          />
        </div>

        <div className="hidden lg:flex mapuche-ornament-desktop">
          <Image
            src="/illustrations/ornament-mapuche1.png"
            alt="Ornamento mapuche"
            width={1200}
            height={120}
            unoptimized
            className="mapuche-ornament-center"
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <PlantCatalog
          categories={categories}
          initialCategory={activeCategory}
          initialQuery={activeQuery}
          initialNativo={activeNativo}
          initialPage={plantsPage}
          lang={lang}
        />
      </div>

      {waHref && <FloatingWhatsAppButton href={waHref} />}
    </>
  );
}