import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { appendLanguageParam, normalizeSiteLanguage, type SiteLanguage } from "@/lib/site-language";

const LANDING_BASE_URL = "https://vivero.website";

export const revalidate = 60;

type LandingSearchParams = {
  lang?: string;
};

const copy: Record<SiteLanguage, {
  title: string;
  description: string;
  heroTitle: string;
  heroBody: string;
  primaryCta: string;
  secondaryCta: string;
  smartSearchTitle: string;
  smartSearchBody: string;
  benefitsTitle: string;
  howEditTitle: string;
  howEditBody: string;
  finalTitle: string;
  finalBody: string;
  editCardTitle: string;
  editCardBody: string;
  websiteLabel: string;
}> = {
  es: {
    title: "Catálogo online para viveros | Búsqueda inteligente de plantas",
    description:
      "Catálogos online para viveros con información de plantas, precios, disponibilidad y una experiencia clara para tus clientes.",
    heroTitle: "¿Tienes un vivero?",
    heroBody:
      "Convierte tu catálogo de plantas en una herramienta simple para mostrar especies, precios, disponibilidad y contacto.",
    primaryCta: "Ver demostración",
    secondaryCta: "Visitar vivero.website",
    smartSearchTitle: "Búsqueda inteligente para encontrar plantas más rápido",
    smartSearchBody:
      "Tus clientes pueden buscar por nombre, tipo de planta, tamaño o necesidades como sombra y poco riego.",
    benefitsTitle: "Lo que puedes mostrar en tu catálogo",
    howEditTitle: "Cómo editar el catálogo",
    howEditBody:
      "Aquí puedes añadir tus capturas de Notion para mostrar cómo actualizas plantas, fotos, precios y disponibilidad.",
    finalTitle: "¿Quieres un catálogo así para tu vivero?",
    finalBody:
      "Te mostramos una versión simple y la adaptamos a tu negocio.",
    editCardTitle: "Espacio para capturas de Notion",
    editCardBody: "Agrega aquí tus pantallas cuando quieras.",
    websiteLabel: "vivero.website",
  },
  en: {
    title: "Online Plant Catalogs for Nurseries | Smart Plant Search",
    description:
      "Online plant catalogs for nurseries with plant information, prices, availability, and a clear experience for your customers.",
    heroTitle: "Do you own a plant nursery?",
    heroBody:
      "Turn your plant catalog into a simple tool to show species, prices, availability, and contact details.",
    primaryCta: "See how it works",
    secondaryCta: "Visit vivero.website",
    smartSearchTitle: "Smart search that helps people find plants faster",
    smartSearchBody:
      "Customers can search by name, plant type, size, or needs like shade and low water.",
    benefitsTitle: "What you can show in your catalog",
    howEditTitle: "How to edit the catalog",
    howEditBody:
      "You can add your Notion screenshots here to show how you update plants, photos, prices, and availability.",
    finalTitle: "Want a catalog like this for your nursery?",
    finalBody:
      "We can show you a simple version and adapt it to your business.",
    editCardTitle: "Space for Notion screenshots",
    editCardBody: "Add your screenshots here whenever you're ready.",
    websiteLabel: "vivero.website",
  },
};

function getLandingUrl(lang: SiteLanguage): string {
  return appendLanguageParam("/landing", lang);
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<LandingSearchParams> }): Promise<Metadata> {
  const lang = normalizeSiteLanguage((await searchParams)?.lang);
  const seo = copy[lang];

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: `${LANDING_BASE_URL}/landing`,
      languages: {
        es: `${LANDING_BASE_URL}/landing?lang=es`,
        en: `${LANDING_BASE_URL}/landing?lang=en`,
      },
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: `${LANDING_BASE_URL}/landing`,
      locale: lang === "en" ? "en_US" : "es_ES",
      alternateLocale: [lang === "en" ? "es_ES" : "en_US"],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
    },
  };
}

type LandingPageProps = {
  searchParams?: Promise<LandingSearchParams>;
};

export default async function LandingPage({ searchParams }: LandingPageProps) {
  const lang = normalizeSiteLanguage((await searchParams)?.lang);
  const t = copy[lang];
  const websiteHref = "https://vivero.website";

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-10 lg:py-12">
      <header className="mb-8 flex items-center justify-between gap-4 border-b border-[#d9cba8] pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#b99a72]">
            Vivero Website
          </p>
          <h1 className="font-heading mt-2 text-3xl font-semibold leading-tight text-[#1e2a22] sm:text-4xl">
            {t.heroTitle}
          </h1>
        </div>

        <div className="inline-flex items-center rounded-full border border-[#d9cba8] bg-[#fffdf9] p-1 text-xs font-semibold uppercase tracking-[0.14em] text-[#6b7364]">
          <Link
            href={getLandingUrl("es")}
            className={`rounded-full px-3 py-1.5 transition ${lang === "es" ? "bg-[#1e3b2e] text-white" : "hover:text-[#1e3b2e]"}`}
          >
            ES
          </Link>
          <Link
            href={getLandingUrl("en")}
            className={`rounded-full px-3 py-1.5 transition ${lang === "en" ? "bg-[#1e3b2e] text-white" : "hover:text-[#1e3b2e]"}`}
          >
            EN
          </Link>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="rounded-[2rem] border border-[#d9cba8] bg-[#f3f0e6] p-6 shadow-[0_18px_40px_rgba(82,58,36,0.08)] sm:p-8">
          <p className="max-w-2xl text-lg leading-8 text-[#3f4a43] sm:text-xl">
            {t.heroBody}
          </p>

          <div className="mt-6 flex flex-wrap gap-3 text-sm font-medium text-[#1e2a22]">
            {[
              lang === "en" ? "Smart search in the catalog" : "Búsqueda inteligente en el catálogo",
              lang === "en" ? "Plant info" : "Información de plantas",
              lang === "en" ? "Prices and availability" : "Precios y disponibilidad",
              lang === "en" ? "WhatsApp contact" : "Contacto por WhatsApp",
            ].map((item) => (
              <span key={item} className="rounded-full border border-[#d9cba8] bg-[#fffdf9] px-3 py-1.5">
                {item}
              </span>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href={websiteHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-[#1e3b2e] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#162e24]"
            >
              {t.primaryCta}
            </a>
            <a
              href={websiteHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-[#1e3b2e] px-5 py-3 text-sm font-semibold text-[#1e3b2e] transition hover:bg-[#edf3ee]"
            >
              {t.secondaryCta}
            </a>
          </div>

          <p className="mt-4 text-sm text-[#6b7364]">
            {lang === "en"
              ? "You only pay if you're satisfied with the result."
              : "Pagas solo si estás satisfecho con el resultado."}
          </p>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-[#d9cba8] bg-[#fffdf9] shadow-[0_18px_40px_rgba(82,58,36,0.08)]">
          <div className="border-b border-[#d9cba8] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b99a72]">
              {lang === "en" ? "Overview" : "Resumen"}
            </p>
            <h2 className="font-heading mt-2 text-2xl font-semibold text-[#1e2a22]">
              {t.benefitsTitle}
            </h2>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {[
              {
                title: lang === "en" ? "Plant name" : "Nombre de la planta",
                detail: lang === "en" ? "Common name and scientific name" : "Nombre común y nombre científico",
              },
              {
                title: lang === "en" ? "Photos" : "Fotografías",
                detail: lang === "en" ? "Images of the plant, flowers or growth" : "Imágenes de la planta, flores o crecimiento",
              },
              {
                title: lang === "en" ? "Price" : "Precio",
                detail: lang === "en" ? "Price by size, format or unit" : "Precio por tamaño, formato o unidad",
              },
              {
                title: lang === "en" ? "Availability" : "Disponibilidad",
                detail: lang === "en" ? "Stock, reserve status and updated quantity" : "Stock, reserva y cantidad actualizada",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-[#d9cba8] bg-[#f9f6ee] p-4">
                <p className="text-sm font-semibold text-[#1e3b2e]">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-[#6b7364]">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-[2rem] border border-[#d9cba8] bg-[#fffdf9] p-6 shadow-[0_18px_40px_rgba(82,58,36,0.06)] sm:p-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b99a72]">
            {lang === "en" ? "Smart search" : "Búsqueda inteligente"}
          </p>
          <h2 className="font-heading mt-2 text-2xl font-semibold text-[#1e2a22] sm:text-3xl">
            {t.smartSearchTitle}
          </h2>
          <p className="mt-3 text-base leading-7 text-[#3f4a43]">
            {t.smartSearchBody}
          </p>

          <div className="mt-5 flex flex-wrap gap-3 text-sm font-medium text-[#1e2a22]">
            {[
              lang === "en" ? "Natural language" : "Lenguaje natural",
              lang === "en" ? "Filters by needs" : "Filtros por necesidades",
              lang === "en" ? "Fast results" : "Resultados rápidos",
            ].map((item) => (
              <span key={item} className="rounded-full border border-[#d9cba8] bg-[#f3f0e6] px-3 py-1.5">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {[
            {
              query: lang === "en" ? "I'm looking for a tree for a small garden, with lots of sun and low water requirements." : "Busco un árbol para un jardín pequeño, con mucho sol y poco riego.",
              result: lang === "en" ? "Shows trees that fit full sun, low watering and compact spaces." : "Muestra árboles que se adapten al sol, poco riego y espacios reducidos.",
            },
            {
              query: lang === "en" ? "Shade plant for a patio" : "Planta de sombra para patio",
              result: lang === "en" ? "Helps customers find plants for shaded outdoor areas." : "Ayuda a encontrar plantas para zonas exteriores con sombra.",
            },
            {
              query: lang === "en" ? "Low-maintenance native plant" : "Planta nativa de bajo mantenimiento",
              result: lang === "en" ? "Highlights plants with easy care and native characteristics." : "Destaca plantas de cuidado simple y con características nativas.",
            },
          ].map((item) => (
            <div key={item.query} className="rounded-2xl border border-[#d9cba8] bg-[#faf8f1] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#b99a72]">
                {lang === "en" ? "Example search" : "Ejemplo de búsqueda"}
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-[#1e2a22]">
                {item.query}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#3f4a43]">
                {item.result}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-[2rem] border border-[#d9cba8] bg-white p-6 shadow-[0_18px_40px_rgba(82,58,36,0.06)] sm:p-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b99a72]">
            {lang === "en" ? "Useful features" : "Funciones útiles"}
          </p>
          <h2 className="font-heading mt-2 text-2xl font-semibold text-[#1e2a22] sm:text-3xl">
            {lang === "en"
              ? "Everything a nursery needs to sell plants online"
              : "Todo lo que un vivero necesita para mostrar sus plantas online"}
          </h2>
          <p className="mt-3 text-base leading-7 text-[#3f4a43]">
            {lang === "en"
              ? "The catalog is useful because it helps customers find plants, compare options, and contact you without unnecessary back-and-forth."
              : "El catálogo es útil porque ayuda a los clientes a encontrar plantas, comparar opciones y contactarte sin vueltas innecesarias."}
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            {
              title: lang === "en" ? "Smart search" : "Búsqueda inteligente",
              body: lang === "en"
                ? "Search by use, size, light, watering, or plant type."
                : "Busca por uso, tamaño, luz, riego o tipo de planta.",
            },
            {
              title: lang === "en" ? "Plant catalog" : "Catálogo de plantas",
              body: lang === "en"
                ? "Show photos, common names, scientific names and descriptions."
                : "Muestra fotos, nombres comunes, nombres científicos y descripciones.",
            },
            {
              title: lang === "en" ? "WhatsApp contact" : "Contacto por WhatsApp",
              body: lang === "en"
                ? "Let customers message you directly when they find a plant."
                : "Permite que te escriban directo cuando encuentran una planta.",
            },
            {
              title: lang === "en" ? "Prices and availability" : "Precios y disponibilidad",
              body: lang === "en"
                ? "Keep prices and stock visible and easier to update."
                : "Mantén precios y stock visibles y más fáciles de actualizar.",
            },
            {
              title: lang === "en" ? "Easy updates" : "Actualización fácil",
              body: lang === "en"
                ? "Change plants, photos, prices and availability without extra complexity."
                : "Cambia plantas, fotos, precios y disponibilidad sin complicarte.",
            },
            {
              title: lang === "en" ? "Custom development" : "Desarrollo a medida",
              body: lang === "en"
                ? "Add extra functionality if your nursery needs it later."
                : "Agrega funciones extra si tu vivero las necesita después.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-[#d9cba8] bg-[#f9f6ee] p-4">
              <p className="text-sm font-semibold text-[#1e3b2e]">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-[#6b7364]">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-[#d9cba8] bg-[#faf8f1] p-4">
          <p className="text-sm font-semibold text-[#1e3b2e]">
            {lang === "en" ? "Plant characteristics you can show" : "Características de la planta que puedes mostrar"}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#6b7364]">
            {lang === "en"
              ? "Watering, soil, exposure, size, flowering, fruit, use, propagation and medicinal information."
              : "Riego, suelo, exposición, tamaño, floración, fruto, uso, propagación e información medicinal."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-[#1e2a22]">
            {[
              lang === "en" ? "Watering" : "Riego",
              lang === "en" ? "Exposure" : "Exposición",
              lang === "en" ? "Size" : "Tamaño",
              lang === "en" ? "Soil" : "Suelo",
              lang === "en" ? "Flowering" : "Floración",
              lang === "en" ? "Fruit" : "Fruto",
              lang === "en" ? "Use" : "Uso",
              lang === "en" ? "Propagation" : "Propagación",
              lang === "en" ? "Medicinal" : "Medicinal",
            ].map((item) => (
              <span key={item} className="rounded-full border border-[#d9cba8] bg-white px-3 py-1.5">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-[2rem] border border-[#d9cba8] bg-white p-6 shadow-[0_18px_40px_rgba(82,58,36,0.06)] sm:p-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b99a72]">
            {lang === "en" ? "Catalog editing" : "Edición del catálogo"}
          </p>
          <h2 className="font-heading mt-2 text-2xl font-semibold text-[#1e2a22] sm:text-3xl">
            {t.howEditTitle}
          </h2>
          <p className="mt-3 text-base leading-7 text-[#3f4a43]">
            {t.howEditBody}
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {[
            {
              src: "/landing-notion/notion_table1.jpg",
              alt: lang === "en" ? "Notion table view with plant rows and columns" : "Vista de tabla de Notion con filas y columnas de plantas",
              title: lang === "en" ? "Plant table" : "Tabla de plantas",
              body: lang === "en"
                ? "This is the base table used to organize plant data."
                : "Esta es la tabla base para organizar los datos de cada planta.",
            },
            {
              src: "/landing-notion/notion_table2.jpg",
              alt: lang === "en" ? "Notion table detail with image and property columns" : "Detalle de tabla de Notion con imagen y columnas de propiedades",
              title: lang === "en" ? "Plant detail" : "Detalle de planta",
              body: lang === "en"
                ? "Each plant can include images, price and available stock."
                : "Cada planta puede incluir imágenes, precio y stock disponible.",
            },
            {
              src: "/landing-notion/notion_table3.jpg",
              alt: lang === "en" ? "Notion record detail with fields and description" : "Detalle de un registro en Notion con campos y descripción",
              title: lang === "en" ? "Edit mode" : "Modo de edición",
              body: lang === "en"
                ? "The nursery team can edit the catalog directly in Notion."
                : "El equipo del vivero puede editar el catálogo directamente en Notion.",
            },
          ].map((item) => (
            <a
              key={item.src}
              href={item.src}
              target="_blank"
              rel="noreferrer"
              className="overflow-hidden rounded-2xl border border-[#d9cba8] bg-[#faf8f1] transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_rgba(82,58,36,0.12)]"
              aria-label={lang === "en" ? `Open ${item.title} screenshot` : `Abrir captura de ${item.title.toLowerCase()}`}
            >
              <div className="relative aspect-[4/3] bg-[#f3f0e6]">
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#10231db3] via-transparent to-transparent opacity-0 transition hover:opacity-100" />
                <span className="absolute bottom-3 right-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#1e2a22] shadow-sm">
                  {lang === "en" ? "Open image" : "Abrir imagen"}
                </span>
              </div>
              <div className="p-4">
                <p className="text-sm font-semibold text-[#1e3b2e]">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-[#6b7364]">{item.body}</p>
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-[2rem] border border-[#d9cba8] bg-[#fffdf9] p-6 shadow-[0_18px_40px_rgba(82,58,36,0.06)] sm:p-8">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b99a72]">
            {lang === "en" ? "Reference" : "Referencia"}
          </p>
          <h2 className="font-heading mt-2 text-2xl font-semibold text-[#1e2a22] sm:text-3xl">
            {lang === "en" ? "Another custom design example" : "Otro ejemplo con diseño personalizado"}
          </h2>
          <p className="mt-3 text-base leading-7 text-[#3f4a43]">
            {lang === "en"
              ? "You can also see a different visual direction at vivero-laforesta.vercel.app. It is still unfinished, but it shows how the catalog can be adapted to another style."
              : "También puedes ver una propuesta visual distinta en vivero-laforesta.vercel.app. Aún no está terminada, pero muestra cómo el catálogo puede adaptarse a otro estilo."}
          </p>
        </div>
      </section>

      <section className="mt-8 rounded-[2rem] border border-[#d9cba8] bg-[#1e3b2e] p-6 text-white shadow-[0_18px_40px_rgba(82,58,36,0.12)] sm:p-8">
        <div className="max-w-3xl">
          <h2 className="font-heading text-2xl font-semibold sm:text-3xl">
            {t.finalTitle}
          </h2>
          <p className="mt-3 text-base leading-7 text-white/88 sm:text-lg">
            {t.finalBody}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={websiteHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#1e3b2e] transition hover:bg-[#f2f5ef]"
            >
              {t.primaryCta}
            </a>
            <Link
              href={appendLanguageParam("/landing", lang)}
              className="inline-flex items-center justify-center rounded-full border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              {t.websiteLabel}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}