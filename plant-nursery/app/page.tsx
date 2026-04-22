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

  const mapHref = nurseryProfile.mapUrl?.trim() || "";

  return (
    <>
      <section className="relative left-1/2 right-1/2 -mx-[50vw] mb-8 w-screen min-h-[100svh] overflow-hidden bg-gradient-to-br from-[#16352f] via-[#2f5f4f] to-[#8b4f35]">
        {nurseryProfile.image && (
          <Image
            src={nurseryProfile.image}
            alt="Vivero de plantas nativas y exoticas Carilemu"
            fill
            priority
            unoptimized
            className="object-cover"
            sizes="100vw"
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-b from-[#16352f]/45 via-[#2f5f4f]/30 to-[#16352f]/50" />

        <div className="relative z-10 flex min-h-[100svh] items-start p-4 pt-8 sm:p-6 sm:pt-10 md:items-end md:p-10">
          <div className="mapuche-hero-overlay w-full max-w-3xl rounded-3xl p-5 backdrop-blur-md sm:p-6 md:p-8">
            <h1 className="text-3xl font-bold leading-tight text-[#f8f0e4] md:text-5xl">
              Vivero &quot;karū-lemu&quot; -
plantas nativas y exóticas
            </h1>

            <p className="mt-4 whitespace-pre-line text-sm leading-7 text-white md:text-lg">
              {nurseryProfile.description || "Explora el catalogo y descubre plantas nativas y exoticas para tu espacio."}
            </p>

            <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[#f2dcc0]">
              {/* Inspirado en la identidad mapuche de la Araucania */}
            </p>

            {nurseryProfile.phone && (
              <p className="mt-4 text-sm text-white/90">
                Telefono: {nurseryProfile.phone}
              </p>
            )}

            {nurseryProfile.location && (
              <p className="text-sm text-white/90">
                Ubicacion: {nurseryProfile.location}
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
                    Escribir por WhatsApp
                  </a>
                )}

                {mapHref && (
                  <a
                    href={mapHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mapuche-button-secondary"
                  >
                    Ver direccion en mapa
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="mapuche-pattern-strip relative left-1/2 -mx-[50vw] mb-8 h-24 w-screen" />

      <div className="mx-auto max-w-6xl px-4 py-8">

        <div className="mapuche-paper-surface sticky top-2 z-20 -mx-2 mb-8 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-[#fff9f0]/85 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-[#1f1a17] md:text-xl">Catalogo</h2>
            <p className="text-xs text-zinc-500">{categories.length + 1} filtros disponibles</p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2">
            <Link
              href={createFilterHref()}
              className={`mapuche-chip shrink-0 ${
                !activeCategory
                  ? "mapuche-chip-active"
                  : "mapuche-chip-idle"
              }`}
            >
              Todas
            </Link>

            {categories.map((cat) => (
              <Link
                key={cat}
                href={createFilterHref(cat)}
                className={`mapuche-chip shrink-0 ${
                  normalize(activeCategory) === normalize(cat)
                    ? "mapuche-chip-active"
                    : "mapuche-chip-idle"
                }`}
              >
                {cat}
              </Link>
            ))}
          </div>
        </div>

        <div className="relative">
          <PlantInfiniteGrid
            key={activeCategory || "all"}
            initialPlants={plantsPage.plants}
            initialNextCursor={plantsPage.nextCursor}
            initialHasMore={plantsPage.hasMore}
            category={activeCategory}
          />
        </div>
      </div>
    </>
  );
}