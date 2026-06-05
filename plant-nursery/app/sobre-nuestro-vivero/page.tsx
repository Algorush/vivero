import Image from "next/image";
import Link from "next/link";

import { getNurseryAbout, getNurseryProfile } from "@/lib/notion";

export const revalidate = 60;

export default async function SobreNuestroViveroPage() {
  const [about, nurseryProfile] = await Promise.all([
    getNurseryAbout(),
    getNurseryProfile(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <div className="mb-6">
        <Link href="/" className="text-sm font-medium text-[#8b4f35] transition hover:text-[#2f5f4f]">
          ← Volver al catalogo
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
            Sobre el vivero
          </p>
          <h1 className="mt-3 text-3xl font-bold text-[#1f1a17] sm:text-4xl">
            {about.title}
          </h1>

          <div className="mt-6 max-w-3xl whitespace-pre-line text-base leading-8 text-zinc-700">
            {about.body || "No hay contenido disponible en la sección Sobre Nosotros de Notion."}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/" className="mapuche-button-primary">
              Ver catálogo
            </Link>
            <Link href="/" className="mapuche-button-secondary">
              Volver al inicio
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}