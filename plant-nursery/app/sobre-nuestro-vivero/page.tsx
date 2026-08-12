import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

import { getNurseryAbout, getNurseryProfile } from "@/lib/notion";
import { getUiCopy } from "@/lib/ui-copy";
import { SITE_URL } from "@/lib/site-config";
import { appendLanguageParam, normalizeSiteLanguage } from "@/lib/site-language";

export const revalidate = 60;

export async function generateMetadata({ searchParams }: AboutPageProps): Promise<Metadata> {
  const lang = normalizeSiteLanguage((await searchParams)?.lang);
  const [about, nurseryProfile] = await Promise.all([
    getNurseryAbout(lang),
    getNurseryProfile(lang),
  ]);

  const title = about.title
    ? `${about.title} | ${lang === "en" ? "Vivero Karu-lemu in Villarrica" : "Vivero Karu-lemu en Villarrica"}`
    : lang === "en"
      ? "About Our Nursery | Vivero Karu-lemu in Villarrica"
      : "Sobre Nuestro Vivero | Vivero Karu-lemu en Villarrica";
  const description =
    about.body ||
    (lang === "en"
      ? "Learn about our native and exotic plant nursery."
      : "Conoce nuestro vivero de plantas nativas y exoticas.");
  const canonicalUrl = appendLanguageParam(`${SITE_URL}/sobre-nuestro-vivero`, lang);

  return {
    title,
    description,
    keywords:
      lang === "en"
        ? ["Vivero Karu-lemu", "about the nursery", "native plants", "exotic plants", "Villarrica"]
        : ["Vivero Karu-lemu", "sobre el vivero", "plantas nativas", "plantas exoticas", "Villarrica"],
    alternates: {
      canonical: canonicalUrl,
      languages: {
        es: appendLanguageParam(`${SITE_URL}/sobre-nuestro-vivero`, "es"),
        en: appendLanguageParam(`${SITE_URL}/sobre-nuestro-vivero`, "en"),
      },
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

type AboutPageProps = {
  searchParams?: Promise<{ lang?: string }>;
};

export default async function SobreNuestroViveroPage({ searchParams }: AboutPageProps) {
  const lang = normalizeSiteLanguage((await searchParams)?.lang);
  const [about, nurseryProfile] = await Promise.all([
    getNurseryAbout(lang),
    getNurseryProfile(lang),
  ]);
  const copy = getUiCopy(lang);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <div className="mb-6">
        <Link href={appendLanguageParam("/", lang)} className="text-sm font-medium text-[#8b4f35] transition hover:text-[#2f5f4f]">
          {copy.catalogBack}
        </Link>
      </div>

      <section className="overflow-hidden rounded-[2rem] border border-[#d8c0a0] bg-[#fff9f0] shadow-[0_18px_45px_rgba(82,58,36,0.12)]">
        {nurseryProfile.image && (
          <div className="relative h-64 w-full sm:h-80">
            <Image
              src={nurseryProfile.image}
              alt="Nuestro vivero"
              fill
              priority
              unoptimized
              className="object-cover"
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#16352f]/45" />
          </div>
        )}

        <div className="p-6 sm:p-8 md:p-10">
          <p className="text-xs uppercase tracking-[0.22em] text-[#8b4f35]">
            {copy.aboutTitle}
          </p>
          <h1 className="mt-3 text-3xl font-bold text-[#1f1a17] sm:text-4xl">
            {about.title}
          </h1>

          <div className="mt-6 max-w-3xl whitespace-pre-line text-base leading-8 text-zinc-700">
            {about.body || (lang === "en"
              ? "No content is available in the About Us section of Notion."
              : copy.aboutBodyFallback)}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={appendLanguageParam("/", lang)} className="mapuche-button-primary">
              {copy.viewCatalog}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}