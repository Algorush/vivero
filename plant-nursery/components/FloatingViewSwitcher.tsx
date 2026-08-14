"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { normalizeSiteLanguage, type SiteLanguage } from "@/lib/site-language";

type CatalogViewMode = "large" | "compact";

function ViewModeIcon({ mode }: { mode: CatalogViewMode }) {
  if (mode === "compact") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="5" width="6" height="6" rx="1.5" />
        <rect x="14" y="5" width="6" height="6" rx="1.5" />
        <rect x="4" y="13" width="6" height="6" rx="1.5" />
        <rect x="14" y="13" width="6" height="6" rx="1.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M4 12h16" />
    </svg>
  );
}

function buildHref(pathname: string, searchParams: URLSearchParams, view: CatalogViewMode, lang: SiteLanguage): string {
  const params = new URLSearchParams(searchParams);

  if (view === "large") {
    params.delete("view");
  } else {
    params.set("view", view);
  }

  params.set("lang", lang);

  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export default function FloatingViewSwitcher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname !== "/") {
    return null;
  }

  const currentLang = normalizeSiteLanguage(searchParams.get("lang"));
  const currentView: CatalogViewMode = searchParams.get("view") === "compact" ? "compact" : "large";
  const currentParams = new URLSearchParams(searchParams.toString());

  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-full border border-white/20 bg-[#1f1a17]/70 p-1 text-white shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-md">
      <Link
        href={buildHref(pathname, currentParams, "large", currentLang)}
        className={[
          "rounded-full px-3 py-2 transition",
          currentView === "large" ? "bg-white text-[#1f1a17]" : "text-white/80 hover:text-white",
        ].join(" ")}
        aria-label="Vista de tarjetas grandes"
        title="Tarjetas grandes"
      >
        <ViewModeIcon mode="large" />
      </Link>
      <Link
        href={buildHref(pathname, currentParams, "compact", currentLang)}
        className={[
          "rounded-full px-3 py-2 transition",
          currentView === "compact" ? "bg-white text-[#1f1a17]" : "text-white/80 hover:text-white",
        ].join(" ")}
        aria-label="Vista de tarjetas pequeñas"
        title="Tarjetas pequeñas"
      >
        <ViewModeIcon mode="compact" />
      </Link>
    </div>
  );
}