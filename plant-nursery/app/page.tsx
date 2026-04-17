import Link from "next/link";
import Image from "next/image";
import { getNurseryProfile, getPlantCategories, getPlantsPage } from "../lib/notion";
import PlantInfiniteGrid from "@/components/PlantInfiniteGrid";

export const revalidate = 60;

type HomeProps = {
  searchParams: Promise<{
    category?: string;
    cursor?: string;
  }>;
};

const normalize = (str: string) => str.toLowerCase().trim();

function sanitizePhoneToWa(value: string): string {
  return value.replace(/[^\d]/g, "");
}

export default async function Home({ searchParams }: HomeProps) {
  const { category, cursor } = await searchParams;

  const activeCategory = category?.trim() || "";
  const activeCursor = cursor?.trim() || "";

  const [nurseryProfile, categories, plantsPage] = await Promise.all([
    getNurseryProfile(),
    getPlantCategories(),
    getPlantsPage({
      category: activeCategory || undefined,
      cursor: activeCursor || undefined,
      pageSize: 12,
    }),
  ]);

  const createFilterHref = (nextCategory?: string) => {
    const params = new URLSearchParams();
    if (nextCategory) {
      params.set("category", nextCategory);
    }
    const query = params.toString();
    return query ? `/?${query}` : "/";
  };

  const waPhone = sanitizePhoneToWa(nurseryProfile.phone);
  const waHref =
    waPhone && nurseryProfile.whatsappText
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(nurseryProfile.whatsappText)}`
      : waPhone
        ? `https://wa.me/${waPhone}`
        : "";

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Vivero de Plantas</h1>

      <p className="text-sm text-gray-500 mb-6">Desplazate hacia abajo para cargar mas plantas</p>

      {(nurseryProfile.image || nurseryProfile.description || nurseryProfile.phone || nurseryProfile.ownerName || nurseryProfile.location || nurseryProfile.mapUrl) && (
        <section className="mb-8 rounded-2xl border border-green-100 bg-green-50/40 p-4 md:p-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center">
            {nurseryProfile.image && (
              <div className="overflow-hidden rounded-xl bg-white">
                <Image
                  src={nurseryProfile.image}
                  alt={nurseryProfile.title || "Vivero Carilemu"}
                  width={1600}
                  height={1200}
                  className="block h-auto w-full object-contain"
                  priority
                  unoptimized
                  sizes="(max-width: 1024px) 100vw, 60vw"
                />
              </div>
            )}

            <div>
              <h2 className="mb-2 text-2xl font-semibold text-green-900">
                {nurseryProfile.title || "Vivero Carilemu"}
              </h2>

              {nurseryProfile.ownerName && (
                <p className="mb-2 text-sm font-medium text-green-900/90">
                  {nurseryProfile.ownerName}
                </p>
              )}

              {nurseryProfile.description && (
                <p className="whitespace-pre-line text-sm leading-6 text-green-900/90">
                  {nurseryProfile.description}
                </p>
              )}

              <div className="mt-4 space-y-1 text-sm text-green-900/90">
                {nurseryProfile.phone && (
                  <p>Telefono: {nurseryProfile.phone}</p>
                )}
                {nurseryProfile.location && (
                  <p>Ubicacion: {nurseryProfile.location}</p>
                )}
              </div>

              {(waHref || nurseryProfile.mapUrl) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {waHref && (
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                    >
                      Escribir por WhatsApp
                    </a>
                  )}

                  {nurseryProfile.mapUrl && (
                    <a
                      href={nurseryProfile.mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-green-600 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
                    >
                      Ver direccion en mapa
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href={createFilterHref()}
          className={`px-4 py-1.5 rounded-full border text-sm font-medium transition ${
            !activeCategory
              ? "bg-green-600 text-white border-green-600"
              : "border-gray-300 hover:border-green-500 hover:text-green-600 hover:bg-green-50"
          }`}
        >
          Todas
        </Link>

        {categories.map((cat) => (
          <Link
            key={cat}
            href={createFilterHref(cat)}
            className={`px-4 py-1.5 rounded-full border text-sm font-medium transition ${
              normalize(activeCategory) === normalize(cat)
                ? "bg-green-600 text-white border-green-600"
                : "border-gray-300 hover:border-green-500 hover:text-green-600 hover:bg-green-50"
            }`}
          >
            {cat}
          </Link>
        ))}
      </div>

      <PlantInfiniteGrid
        key={activeCategory || "all"}
        initialPlants={plantsPage.plants}
        initialNextCursor={plantsPage.nextCursor}
        initialHasMore={plantsPage.hasMore}
        category={activeCategory}
      />
    </div>
  );
}