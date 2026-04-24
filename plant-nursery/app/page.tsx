import Image from "next/image";
import { getNurseryProfile, getPlantCategories, getPlantsPage } from "../lib/notion";
import PlantCatalog from "@/components/PlantCatalog";
import FloatingWhatsAppButton from "@/components/FloatingWhatsAppButton";

export const revalidate = 60;

type HomeProps = {
  searchParams: Promise<{
    category?: string;
    cursor?: string;
    q?: string;
  }>;
};

function sanitizePhoneToWa(value: string): string {
  return value.replace(/[^\d]/g, "");
}

export default async function Home({ searchParams }: HomeProps) {
  const { category, cursor, q } = await searchParams;

  const activeCategory = category?.trim() || "";
  const activeCursor = cursor?.trim() || "";
  const activeQuery = q?.trim() || "";

  const [nurseryProfile, categories, plantsPage] = await Promise.all([
    getNurseryProfile(),
    getPlantCategories(),
    getPlantsPage({
      category: activeCategory || undefined,
      cursor: activeCursor || undefined,
      query: activeQuery || undefined,
      pageSize: 12,
    }),
  ]);

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
      <section
        id="home-hero"
        className="relative left-1/2 right-1/2 -mx-[50vw] mb-8 w-screen min-h-[100svh] overflow-hidden bg-gradient-to-br from-[#16352f] via-[#2f5f4f] to-[#8b4f35]"
      >
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

        <div className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-6xl items-end px-4 pb-8 sm:px-6 sm:pb-10 md:px-10 md:pb-10 md:pt-10">
          <div className="mapuche-hero-overlay w-full rounded-3xl p-5 backdrop-blur-md sm:p-6 md:p-8">
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

      <div className="mx-auto w-screen px-4 py-8">
        <PlantCatalog
          categories={categories}
          initialCategory={activeCategory}
          initialQuery={activeQuery}
          initialPage={plantsPage}
        />
      </div>

      {waHref && <FloatingWhatsAppButton href={waHref} />}
    </>
  );
}