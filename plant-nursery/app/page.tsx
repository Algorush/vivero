import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { getNurseryProfile, getPlantCategories, getPlantsPage } from "../lib/notion";
import PlantCatalog from "@/components/PlantCatalog";
import ImageCarousel from "@/components/ImageCarousel";
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
    title: "Vivero Karu-lemu en Villarrica | Plantas nativas y exoticas en catalogo online",
    description: "Explora el catalogo de plantas nativas y exoticas del Vivero Karu-lemu en Villarrica: precios, disponibilidad y caracteristicas de cada especie.",
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
    title: "Vivero Karu-lemu in Villarrica | Native and exotic plants online catalog",
    description: "Browse the Vivero Karu-lemu catalog in Villarrica of native and exotic plants: prices, availability, and details for each species.",
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
  const canonicalUrl = appendLanguageParam(SITE_URL, lang);
  const alternateUrls = {
    es: appendLanguageParam(SITE_URL, "es"),
    en: appendLanguageParam(SITE_URL, "en"),
  };

  const keywords =
    lang === "en"
      ? ["Vivero Karu-lemu", "native plants", "exotic plants", "nursery", "Villarrica"]
      : ["Vivero Karu-lemu", "plantas nativas", "plantas exoticas", "vivero", "Villarrica"];

  const robots = hasSearchParams(params) ? { index: false, follow: true } : undefined;

  const nurseryProfile = await getNurseryProfile(lang);

  return {
    title,
    description,
    keywords,
    robots,
    alternates: {
      canonical: canonicalUrl,
      languages: alternateUrls,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      locale: lang === "en" ? "en_US" : "es_ES",
      alternateLocale: [lang === "en" ? "es_ES" : "en_US"],
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

function buildHeroImages(primaryImage?: string): string[] {
  const candidates = [
    primaryImage,
    "/notion-images/nursery/hero.jpg",
    "/notion-images/plants/araucaria-araucana-6.jpg",
    "/notion-images/plants/ulmo-eucryphia-cordifolia-1.jpg",
    "/notion-images/plants/rododendro-virginia-richard-1.jpg",
    "/notion-images/plants/arrayan-luma-apiculata-1.jpg",
    "/notion-images/plants/campanilla-calceolaria-uniflora-1.jpg",
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(candidates));
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const { category, cursor, q, nativo } = params;
  const lang = normalizeSiteLanguage(params.lang);

  const activeCategory = category?.trim() || "";
  const activeCursor = cursor?.trim() || "";
  const activeQuery = q?.trim() || "";
  const activeNativo = nativo === "true" ? true : nativo === "false" ? false : undefined;

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
    getNurseryProfile(lang),
  ]);

  const waPhone = sanitizePhoneToWa(nurseryProfile.phone);
  const waHref =
    waPhone && nurseryProfile.whatsappText
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(nurseryProfile.whatsappText)}`
      : waPhone
        ? `https://wa.me/${waPhone}`
        : "";

  const mapHref = nurseryProfile.mapUrl?.trim() || "";
  const heroImages = buildHeroImages(nurseryProfile.image);

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
        className="relative left-1/2 right-1/2 -mx-[50vw] mb-8 w-screen overflow-hidden bg-gradient-to-br from-[#16352f] via-[#2f5f4f] to-[#8b4f35]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.12),transparent_34%),linear-gradient(180deg,rgba(22,53,47,0.2),rgba(22,53,47,0.48))]" />

        <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-4 px-3 py-4 sm:gap-6 sm:px-6 sm:py-6 md:gap-8 md:px-8 md:py-8 lg:grid-cols-[1.02fr_0.98fr] lg:px-10 lg:py-10 lg:min-h-[88svh] lg:items-center">
          <div className="order-2 lg:order-1">
            <div className="mapuche-hero-overlay relative overflow-hidden rounded-2xl p-4 backdrop-blur-sm sm:rounded-[2rem] sm:p-6 md:p-8">
              <div className="inline-flex rounded-full border border-[#f2dcc0]/45 bg-white/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#f8f0e4] sm:px-3 sm:text-xs sm:tracking-[0.18em]">
                {lang === "en" ? "Native plants · living catalog" : "Plantas nativas · catalogo vivo"}
              </div>

              <h1 className="mt-3 text-2xl font-bold leading-tight text-[#f8f0e4] sm:mt-4 sm:text-3xl md:text-5xl">
                {nurseryProfile.title || copy[lang].heroTitle}
              </h1>

              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-white sm:mt-4 sm:leading-7 md:text-lg">
                {nurseryProfile.description || copy[lang].catalogFallback}
              </p>

              {(nurseryProfile.phone || nurseryProfile.location) && (
                <div className="mt-4 space-y-1 text-sm text-white/90">
                  {nurseryProfile.phone && (
                    <p>{lang === "en" ? "Phone" : "Telefono"}: {nurseryProfile.phone}</p>
                  )}

                  {nurseryProfile.location && (
                    <p>{lang === "en" ? "Location" : "Ubicacion"}: {nurseryProfile.location}</p>
                  )}
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                {mapHref && (
                  <a
                    href={mapHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mapuche-button-primary"
                  >
                    {copy[lang].directions}
                  </a>
                )}

                <Link href={appendLanguageParam("/sobre-nuestro-vivero", lang)} className="mapuche-button-secondary">
                  {copy[lang].aboutButton}
                </Link>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/20 bg-white/10 shadow-[0_18px_40px_rgba(9,14,13,0.3)] ring-1 ring-white/10 md:rounded-[2rem] md:shadow-[0_28px_60px_rgba(9,14,13,0.34)]">
              <div className="relative aspect-[4/3] sm:aspect-[16/10] lg:aspect-[4/5] lg:min-h-[34rem]">
                <ImageCarousel
                  images={heroImages}
                  alt={copy[lang].profileAlt}
                  fill
                  priority
                  autoPlay
                  autoPlayIntervalMs={4200}
                  quality={90}
                  sizes="(max-width: 768px) 100vw, 46vw"
                  className="object-cover"
                />

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0f231d66] via-transparent to-transparent" />
              </div>
            </div>
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