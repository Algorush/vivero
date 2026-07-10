import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ImageCarousel from "@/components/ImageCarousel";

import { getPlantBySlug } from "@/lib/notion";
import { SITE_URL } from "@/lib/site-config";

type PlantPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}\u2026`;
}

export async function generateMetadata({
  params,
}: PlantPageProps): Promise<Metadata> {
  const { slug } = await params;
  const plant = await getPlantBySlug(slug);

  if (!plant) {
    return {};
  }

  const title = plant.category ? `${plant.name} - ${plant.category}` : plant.name;
  const description = plant.description
    ? truncate(plant.description, 160)
    : `Conoce ${plant.name} en nuestro vivero: caracteristicas, cuidados y disponibilidad.`;
  const image = plant.images?.[0] || plant.image;
  const url = `${SITE_URL}/plants/${plant.slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
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

export default async function PlantPage({ params }: PlantPageProps) {
  const { slug } = await params;
  const plant = await getPlantBySlug(slug);

  if (!plant) {
    notFound();
  }

  const normalizeDetailValue = (value: unknown): string =>
    typeof value === "string" ? value.trim() : "";

  const details = [
    { label: "Flor", value: normalizeDetailValue(plant.flor) },
    { label: "Riego", value: normalizeDetailValue(plant.riego) },
    { label: "Suelo", value: normalizeDetailValue(plant.suelo) },
    { label: "Florece", value: normalizeDetailValue(plant.florece) },
    { label: "Exposicion", value: normalizeDetailValue(plant.exposicion) },
    { label: "Fruta", value: normalizeDetailValue(plant.fruta) },
    { label: "Tamano", value: normalizeDetailValue(plant.tamano) },
    { label: "Utilizacion", value: normalizeDetailValue(plant.utilizacion) },
    { label: "Propagacion", value: normalizeDetailValue(plant.propagacion) },
    { label: "Medicinal", value: normalizeDetailValue(plant.medicinal) },
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
        <Link href="/">Volver al catalogo</Link>
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
          className="object-cover"
        />
      </div>

      <p className="text-gray-600 mb-2">
        Categoría: {plant.category}
      </p>

      {plant.price > 0 && (
        <p className="mb-2 text-lg font-semibold text-green-700">
          Precio: ${plant.price}
        </p>
      )}

      <p className="whitespace-pre-line">{plant.description}</p>

      {details.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[#d8c0a0] bg-[#fff9f0] p-4">
          <h2 className="mb-3 text-lg font-semibold text-[#1f1a17]">Caracteristicas</h2>
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
