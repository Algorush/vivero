"use client";

import { useEffect, useState } from "react";
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
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 12h18" />
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
  const [currentView, setCurrentView] = useState<CatalogViewMode>(
    searchParams.get("view") === "compact" ? "compact" : "large"
  );

  const currentLang = normalizeSiteLanguage(searchParams.get("lang"));
  const currentParams = new URLSearchParams(searchParams.toString());

  useEffect(() => {
    const handlePopState = () => {
      const nextView: CatalogViewMode =
        new URLSearchParams(window.location.search).get("view") === "compact" ? "compact" : "large";

      setCurrentView(nextView);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const setView = (view: CatalogViewMode) => {
    const href = buildHref(pathname, currentParams, view, currentLang);
    window.history.replaceState(window.history.state, "", href);
    setCurrentView(view);
    window.dispatchEvent(new CustomEvent("catalog-view-change", { detail: { view } }));
  };

  if (pathname !== "/") {
    return null;
  }

  return (
    <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-full border border-white/20 bg-[#1f1a17]/70 p-1 text-white shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-md">
      <button
        type="button"
        onClick={() => setView("large")}
        className={[
          "rounded-full px-3 py-2 transition",
          currentView === "large" ? "bg-white text-[#1f1a17]" : "text-white/80 hover:text-white",
        ].join(" ")}
        aria-label="Vista de tarjetas grandes"
        title="Tarjetas grandes"
      >
        <ViewModeIcon mode="large" />
      </button>
      <button
        type="button"
        onClick={() => setView("compact")}
        className={[
          "rounded-full px-3 py-2 transition",
          currentView === "compact" ? "bg-white text-[#1f1a17]" : "text-white/80 hover:text-white",
        ].join(" ")}
        aria-label="Vista de tarjetas pequeñas"
        title="Tarjetas pequeñas"
      >
        <ViewModeIcon mode="compact" />
      </button>
    </div>
  );
}