import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ImageCarousel from "@/components/ImageCarousel";
import AddToCartButton from "@/components/AddToCartButton";

import { getNurseryProfile, getPlantBySlug } from "@/lib/notion";
import { getCategoryLabel, getUiCopy } from "@/lib/ui-copy";
import { SITE_URL } from "@/lib/site-config";
import { appendLanguageParam, normalizeSiteLanguage } from "@/lib/site-language";

type PlantPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams?: Promise<{ lang?: string; category?: string; q?: string; nativo?: string }>;
};

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}\u2026`;
}

function sanitizePhoneToWa(value: string): string {
  return value.replace(/[^\d]/g, "");
}

export async function generateMetadata({
  params,
  searchParams,
}: PlantPageProps): Promise<Metadata> {
  const { slug } = await params;
  const lang = normalizeSiteLanguage((await searchParams)?.lang);
  const plant = await getPlantBySlug(slug, lang);

  if (!plant) {
    return {};
  }

  const title = plant.category ? `${plant.name} - ${getCategoryLabel(lang, plant.category)}` : plant.name;
  const description = plant.description
    ? truncate(plant.description, 160)
    : lang === "en"
      ? `Discover ${plant.name} in our nursery: characteristics, care, and availability.`
      : `Conoce ${plant.name} en nuestro vivero: caracteristicas, cuidados y disponibilidad.`;
  const image = plant.images?.[0] || plant.image;
  const url = `${SITE_URL}/plants/${plant.slug}`;
  const canonicalUrl = appendLanguageParam(url, lang);
  const alternateUrls = {
    es: appendLanguageParam(url, "es"),
    en: appendLanguageParam(url, "en"),
  };
  const keywords =
    lang === "en"
      ? [plant.name, plant.category || "", "native plant", "exotic plant", "nursery"]
      : [plant.name, plant.category || "", "planta nativa", "planta exotica", "vivero"];

  return {
    title,
    description,
    keywords: keywords.filter((value): value is string => Boolean(value)),
    alternates: {
      canonical: canonicalUrl,
      languages: alternateUrls,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: "website",
      locale: lang === "en" ? "en_US" : "es_ES",
      alternateLocale: [lang === "en" ? "es_ES" : "en_US"],
      images: image ? [{ url: image, alt: plant.name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PlantPage({ params, searchParams }: PlantPageProps) {
  const { slug } = await params;
  const search = await searchParams;
  const lang = normalizeSiteLanguage(search?.lang);
  const [plant, nurseryProfile] = await Promise.all([
    getPlantBySlug(slug, lang),
    getNurseryProfile(lang),
  ]);

  if (!plant) {
    notFound();
  }

  const waPhone = sanitizePhoneToWa(nurseryProfile.phone);
  const consultMessage =
    lang === "en"
      ? `Hello, I would like to ask about the plant ${plant.name}.`
      : `Hola, quiero consultar por la planta ${plant.name}.`;
  const waHref = waPhone
    ? `https://wa.me/${waPhone}${consultMessage ? `?text=${encodeURIComponent(consultMessage)}` : ""}`
    : "";
  const copy = getUiCopy(lang);

  const catalogParams = new URLSearchParams();
  if (search?.category?.trim()) {
    catalogParams.set("category", search.category.trim());
  }
  if (search?.q?.trim()) {
    catalogParams.set("q", search.q.trim());
  }
  if (search?.nativo === "true" || search?.nativo === "false") {
    catalogParams.set("nativo", search.nativo);
  }

  const catalogHref = appendLanguageParam(
    catalogParams.toString() ? `/?${catalogParams.toString()}` : "/",
    lang
  );

  const normalizeDetailValue = (value: unknown): string =>
    typeof value === "string" ? value.trim() : "";

  const details = [
    { label: lang === "en" ? "Flower" : "Flor", value: normalizeDetailValue(plant.flor) },
    { label: lang === "en" ? "Watering" : "Riego", value: normalizeDetailValue(plant.riego) },
    { label: lang === "en" ? "Soil" : "Suelo", value: normalizeDetailValue(plant.suelo) },
    { label: lang === "en" ? "Blooms" : "Florece", value: normalizeDetailValue(plant.florece) },
    { label: lang === "en" ? "Exposure" : "Exposicion", value: normalizeDetailValue(plant.exposicion) },
    { label: lang === "en" ? "Fruit" : "Fruta", value: normalizeDetailValue(plant.fruta) },
    { label: lang === "en" ? "Size" : "Tamano", value: normalizeDetailValue(plant.tamano) },
    { label: lang === "en" ? "Use" : "Utilizacion", value: normalizeDetailValue(plant.utilizacion) },
    { label: lang === "en" ? "Propagation" : "Propagacion", value: normalizeDetailValue(plant.propagacion) },
    { label: lang === "en" ? "Medicinal" : "Medicinal", value: normalizeDetailValue(plant.medicinal) },
  ].filter((item) => item.value.length > 0);

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: plant.name,
    description: plant.description || undefined,
    category: plant.category || undefined,
    image: plant.images?.length > 0 ? plant.images : plant.image ? [plant.image] : undefined,
    url: `${SITE_URL}/plants/${plant.slug}`,
    offers:
      plant.price > 0
        ? {
            "@type": "Offer",
            priceCurrency: "CLP",
            price: plant.price,
            availability:
              plant.available !== false
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
            url: `${SITE_URL}/plants/${plant.slug}`,
          }
        : undefined,
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />

      <p className="mb-4">
        <Link href={catalogHref}>
          {copy.backToCatalog}
        </Link>
      </p>

      <h1 className="text-3xl font-bold mb-4">{plant.name}</h1>

      {plant.images?.length > 0 && (
        <div className="mb-4 aspect-[4/3] w-full overflow-hidden rounded-xl">
          <ImageCarousel
            images={plant.images}
            alt={plant.name}
            fill
            priority
            quality={95}
            sizes="(max-width: 768px) 100vw, 768px"
          />
        </div>
      )}

      <div className="relative -mx-6 my-4 h-24 w-[calc(100%+3rem)] overflow-hidden sm:h-32">
        <Image
          src="/illustrations/ornament-plant-page-2.png"
          alt="Ornamento"
          fill
          className="object-contain"
        />
      </div>

      <p className="text-gray-600 mb-2">
        {copy.category}: {getCategoryLabel(lang, plant.category)}
      </p>

      {plant.price > 0 && (
        <p className="mb-2 text-lg font-semibold text-green-700">
          {copy.price}: ${plant.price}
        </p>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <AddToCartButton plant={plant} lang={lang} className="w-full rounded-xl bg-[#2f5f4f] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#254c40] sm:w-auto" />

        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#2f5f4f] px-4 py-2 text-sm font-semibold text-[#2f5f4f] transition hover:bg-[#f1f7f4] sm:w-auto"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M19.05 4.94A9.94 9.94 0 0 0 12 2a9.96 9.96 0 0 0-8.67 14.88L2 22l5.27-1.3A9.96 9.96 0 1 0 19.05 4.94ZM12 20.2a8.2 8.2 0 0 1-4.17-1.14l-.3-.18-3.13.77.84-3.05-.2-.32A8.2 8.2 0 1 1 12 20.2Zm4.5-6.13c-.25-.12-1.45-.71-1.68-.8-.23-.08-.4-.12-.57.12-.16.25-.65.8-.8.96-.14.17-.3.18-.56.06-.25-.12-1.08-.4-2.05-1.28-.75-.66-1.25-1.48-1.4-1.73-.14-.25-.02-.38.1-.5.1-.1.25-.26.37-.39.12-.14.17-.24.25-.4.08-.17.04-.3-.02-.43-.06-.12-.57-1.37-.78-1.87-.2-.49-.4-.42-.57-.43h-.49a.95.95 0 0 0-.68.32c-.24.25-.92.9-.92 2.2 0 1.3.95 2.55 1.08 2.73.12.17 1.86 2.86 4.5 4 .63.27 1.13.43 1.52.55.64.2 1.22.17 1.68.1.52-.08 1.45-.6 1.66-1.18.2-.58.2-1.08.14-1.18-.05-.1-.22-.16-.47-.28Z" />
            </svg>
            {copy.askAboutPlant}
          </a>
        )}
      </div>

      <p className="whitespace-pre-line">{plant.description}</p>

      {details.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[#d8c0a0] bg-[#fff9f0] p-4">
          <h2 className="mb-3 text-lg font-semibold text-[#1f1a17]">
            {copy.characteristics}
          </h2>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {details.map((item) => (
              <div key={item.label}>
                <dt className="text-xs uppercase tracking-wide text-[#8b4f35]">
                  {item.label}
                </dt>
                <dd className="whitespace-pre-line text-sm text-zinc-700">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}
