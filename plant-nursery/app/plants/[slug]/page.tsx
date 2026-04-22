import Link from "next/link";
import { notFound } from "next/navigation";
import ImageCarousel from "@/components/ImageCarousel";

import { getPlantBySlug } from "@/lib/notion";

type PlantPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

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
  ].filter((item) => item.value.length > 0);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <p className="mb-4">
        <Link href="/">Volver al catalogo</Link>
      </p>

      <h1 className="text-3xl font-bold mb-4">{plant.name}</h1>

      {plant.images?.length > 0 && (
        <ImageCarousel
          images={plant.images}
          alt={plant.name}
          natural
          priority
          quality={95}
          sizes="100vw"
          className="mb-4"
        />
      )}

      <p className="text-gray-600 mb-2">
        Categoría: {plant.category}
      </p>

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
