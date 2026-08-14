"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import PlantInfiniteGrid from "@/components/PlantInfiniteGrid";
import type { PlantsPageResult } from "@/lib/notion";
import { getCategoryLabel, getUiCopy } from "@/lib/ui-copy";
import { normalizeSiteLanguage, type SiteLanguage } from "@/lib/site-language";

type PlantCatalogProps = {
  categories: string[];
  initialCategory: string;
  initialQuery: string;
  initialNativo?: boolean;
  initialView?: CatalogViewMode;
  initialPage: PlantsPageResult;
  lang?: SiteLanguage;
};

type CatalogViewMode = "large" | "compact";

type PlantsApiResponse = PlantsPageResult | { error?: string };

const normalize = (value: string) => value.toLowerCase().trim();

function isPlantsPageResult(data: PlantsApiResponse): data is PlantsPageResult {
  return (
    "plants" in data &&
    Array.isArray(data.plants) &&
    "nextCursor" in data &&
    "hasMore" in data
  );
}

function createFilterUrl(
  category?: string,
  searchQuery?: string,
  nativo?: boolean,
  view?: CatalogViewMode,
  lang: SiteLanguage = "es"
): string {
  const params = new URLSearchParams();

  if (category) {
    params.set("category", category);
  }

  if (searchQuery) {
    params.set("q", searchQuery);
  }

  if (nativo !== undefined) {
    params.set("nativo", String(nativo));
  }

  if (view && view !== "large") {
    params.set("view", view);
  }

  params.set("lang", lang);

  const queryString = params.toString();
  return queryString ? `/?${queryString}` : "/";
}

export default function PlantCatalog({
  categories,
  initialCategory,
  initialQuery,
  initialNativo,
  initialView = "large",
  initialPage,
  lang: rawLang = "es",
}: PlantCatalogProps) {
  const lang = normalizeSiteLanguage(rawLang);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [activeNativo, setActiveNativo] = useState<boolean | undefined>(initialNativo);
  const [viewMode, setViewMode] = useState<CatalogViewMode>(initialView);
  const [page, setPage] = useState(initialPage);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const [filterError, setFilterError] = useState("");
  const requestIdRef = useRef(0);
  const lastFilterTouchAtRef = useRef(0);
  const filterTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const filterDragRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeCategoryRef = useRef(activeCategory);
  const activeQueryRef = useRef(activeQuery);
  const activeNativoRef = useRef(activeNativo);
  const viewModeRef = useRef(viewMode);
  const copy = getUiCopy(lang);

  // Keep refs in sync with state
  useEffect(() => { activeCategoryRef.current = activeCategory; }, [activeCategory]);
  useEffect(() => { activeQueryRef.current = activeQuery; }, [activeQuery]);
  useEffect(() => { activeNativoRef.current = activeNativo; }, [activeNativo]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { setViewMode(initialView); }, [initialView]);

  const readFiltersFromUrl = useCallback(() => {
    const currentUrl = new URL(window.location.href);
    const urlQuery = currentUrl.searchParams.get("q") ?? "";
    const urlCategory = currentUrl.searchParams.get("category") ?? "";
    const urlNativoRaw = currentUrl.searchParams.get("nativo");
    const urlNativo = urlNativoRaw === "true" ? true : urlNativoRaw === "false" ? false : undefined;
    const urlView = currentUrl.searchParams.get("view");
    const urlViewMode: CatalogViewMode = urlView === "compact" ? urlView : "large";

    return {
      category: urlCategory,
      query: urlQuery,
      nativo: urlNativo,
      view: urlViewMode,
    };
  }, []);

  const applyFilters = useCallback(async (
    nextCategory: string,
    rawQuery: string,
    nextNativo: boolean | undefined,
    syncUrl: boolean = true
  ) => {
    const nextQuery = rawQuery.trim();

    if (
      normalize(nextCategory) === normalize(activeCategoryRef.current) &&
      nextQuery === activeQueryRef.current &&
      nextNativo === activeNativoRef.current
    ) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsFilterLoading(true);
    setFilterError("");

    try {
      const query = new URLSearchParams();
      if (nextCategory) {
        query.set("category", nextCategory);
      }
      if (nextQuery) {
        query.set("q", nextQuery);
      }
      if (nextNativo !== undefined) {
        query.set("nativo", String(nextNativo));
      }
      query.set("lang", lang);
      query.set("pageSize", "12");

      const response = await fetch(`/api/plants?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal: abortController.signal,
      });

      const data = (await response.json()) as PlantsApiResponse;

      if (!response.ok || !isPlantsPageResult(data)) {
        throw new Error(
          ("error" in data && data.error) || "No se pudo filtrar el catalogo"
        );
      }

      if (requestIdRef.current !== requestId) {
        return;
      }

      setActiveCategory(nextCategory);
      setActiveQuery(nextQuery);
      setActiveNativo(nextNativo);
      setPage(data);

      if (syncUrl) {
        window.history.replaceState(
          window.history.state,
          "",
            createFilterUrl(nextCategory, nextQuery, nextNativo, viewModeRef.current, lang)
        );
      }
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setFilterError(
        error instanceof Error && error.message
          ? error.message
          : "No se pudo filtrar el catalogo"
      );
    } finally {
      if (requestIdRef.current === requestId) {
        setIsFilterLoading(false);
      }
    }
  }, [lang]);

  useEffect(() => {
    const handleViewChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ view?: CatalogViewMode }>;
      const nextView = customEvent.detail?.view;

      if (nextView === "large" || nextView === "compact") {
        setViewMode(nextView);
      }
    };

    window.addEventListener("catalog-view-change", handleViewChange as EventListener);
    return () => window.removeEventListener("catalog-view-change", handleViewChange as EventListener);
  }, []);

  // Restore state from URL on back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const { category: urlCategory, query: urlQuery, nativo: urlNativo, view: urlView } = readFiltersFromUrl();

      setSearchInput(urlQuery);
      setActiveQuery(urlQuery);
      setActiveCategory(urlCategory);
      setActiveNativo(urlNativo);
      setViewMode(urlView);

      void applyFilters(urlCategory, urlQuery, urlNativo, false);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyFilters, readFiltersFromUrl]);

  const runFilterAction = (action: () => void) => {
    action();
  };

  const handleFilterTouchEnd = (action: () => void) => {
    if (filterDragRef.current) {
      return;
    }

    lastFilterTouchAtRef.current = Date.now();
    runFilterAction(action);
  };

  const handleFilterClick = (action: () => void) => {
    if (filterDragRef.current || Date.now() - lastFilterTouchAtRef.current < 450) {
      return;
    }

    runFilterAction(action);
  };

  const handleFilterTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    filterTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
    filterDragRef.current = false;
  };

  const handleFilterTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = filterTouchStartRef.current;
    const touch = event.touches[0];

    if (!start || !touch) {
      return;
    }

    const deltaX = Math.abs(touch.clientX - start.x);
    const deltaY = Math.abs(touch.clientY - start.y);

    if (deltaX > 8 && deltaX > deltaY) {
      filterDragRef.current = true;
    }
  };

  const handleFilterTouchCancel = () => {
    filterTouchStartRef.current = null;
    filterDragRef.current = false;
  };

  const handleFilterTouchEndCapture = () => {
    filterTouchStartRef.current = null;
  };

  const toggleNativo = (value: boolean | undefined) => {
    const next = activeNativo === value ? undefined : value;
    void applyFilters(activeCategory, searchInput, next);
  };

  const runSearch = () => {
    void applyFilters(activeCategory, searchInput, activeNativo);
  };

  const handleSearchInputChange = (value: string) => {
    setSearchInput(value);

    if (value.trim() === "") {
      void applyFilters(activeCategoryRef.current, "", activeNativoRef.current);
    }
  };

  const catalogLabel =
    activeNativo === true
      ? "Fillke Aliwentu"
      : activeNativo === false
        ? "Fillke Anumka"
        : "";

  return (
    <>
      {catalogLabel ? (
        <div className="mb-4 px-1 sm:mb-5">
          <h2 className="font-heading text-xl font-bold leading-tight text-[#1f1a17] sm:text-2xl md:text-3xl">
            {catalogLabel}
          </h2>
        </div>
      ) : null}

      <div className="sticky top-2 z-20 mb-6">
        <div className="mapuche-paper-surface -mx-2 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-[#fff9f0]/85 md:mx-0 md:border-0 md:bg-transparent md:px-4 md:shadow-none md:backdrop-blur-0">
          {/* Row 1: title + search */}
          <div className="mb-1 flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-center gap-2">
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => handleSearchInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      runSearch();
                    }
                  }}
                  placeholder={copy.catalogSearchPlaceholder}
                  className="min-w-0 flex-1 rounded-xl border border-[#d8c0a0] bg-[#fffdf8] px-3 py-1.5 text-sm text-[#1f1a17] placeholder:text-zinc-400 focus:border-[#2f5f4f] focus:outline-none"
                  aria-label={copy.catalogSearchAria}
                />
                <button
                  type="button"
                  onClick={runSearch}
                  disabled={isFilterLoading}
                  className="flex shrink-0 items-center justify-center rounded-xl border border-[#d8c0a0] bg-[#f6ebda] px-3 py-1.5 text-sm text-[#1f1a17] transition hover:bg-[#ebdbc1] disabled:cursor-wait disabled:opacity-70"
                  aria-label={copy.catalogSearchAria}
                  title={copy.catalogSearchButton}
                >
                  <span aria-hidden="true">🔍</span>
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: nativo toggles + category chips in single scrollable row */}
          <div 
            className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden"
            style={{ paddingTop: "2px" }}
            onTouchStart={handleFilterTouchStart}
            onTouchMove={handleFilterTouchMove}
            onTouchEndCapture={handleFilterTouchEndCapture}
            onTouchCancel={handleFilterTouchCancel}
          >
            <div className="inline-flex shrink-0 overflow-hidden rounded-full border border-[#d8c0a0] bg-[#fffdf8] shadow-sm">
              <button
                type="button"
                onClick={() => toggleNativo(true)}
                disabled={isFilterLoading}
                className={`px-3 py-1.5 text-xs font-semibold transition sm:px-3.5 ${
                  activeNativo === true
                    ? "bg-[#2f5f4f] text-white"
                    : "text-[#1f1a17] hover:bg-[#f3eadb]"
                } disabled:cursor-wait disabled:opacity-70`}
                aria-pressed={activeNativo === true}
              >
                {copy.nativas}
              </button>
              <button
                type="button"
                onClick={() => toggleNativo(false)}
                disabled={isFilterLoading}
                className={`border-l border-[#d8c0a0] px-3 py-1.5 text-xs font-semibold transition sm:px-3.5 ${
                  activeNativo === false
                    ? "bg-[#2f5f4f] text-white"
                    : "text-[#1f1a17] hover:bg-[#f3eadb]"
                } disabled:cursor-wait disabled:opacity-70`}
                aria-pressed={activeNativo === false}
              >
                {copy.exoticas}
              </button>
              <button
                type="button"
                onClick={() => handleFilterClick(() => { void applyFilters(activeCategory, searchInput, undefined); })}
                onTouchEnd={() => handleFilterTouchEnd(() => { void applyFilters(activeCategory, searchInput, undefined); })}
                disabled={isFilterLoading}
                className={`border-l border-[#d8c0a0] px-3 py-1.5 text-xs font-semibold transition sm:px-3.5 ${
                  activeNativo === undefined
                    ? "bg-[#2f5f4f] text-white"
                    : "text-[#1f1a17] hover:bg-[#f3eadb]"
                } disabled:cursor-wait disabled:opacity-70`}
                aria-pressed={activeNativo === undefined}
              >
                {copy.allPlants}
              </button>
            </div>

            <span className="mx-0.5 self-center text-[#d8c0a0]">|</span>
            <button
              type="button"
              onTouchEnd={() => handleFilterTouchEnd(() => { void applyFilters("", searchInput, activeNativo); })}
              onClick={() => handleFilterClick(() => { void applyFilters("", searchInput, activeNativo); })}
              disabled={isFilterLoading}
              className={`mapuche-chip shrink-0 ${
                !activeCategory ? "mapuche-chip-active" : "mapuche-chip-idle"
              } disabled:cursor-wait disabled:opacity-70`}
              aria-pressed={!activeCategory}
            >
              {copy.allCategories}
            </button>

              {categories.map((category) => {
                const isActive = normalize(activeCategory) === normalize(category);
                const categoryLabel = getCategoryLabel(lang, category);

                return (
                  <button
                    key={category}
                    type="button"
                    onTouchEnd={() => handleFilterTouchEnd(() => { void applyFilters(category, searchInput, activeNativo); })}
                    onClick={() => handleFilterClick(() => { void applyFilters(category, searchInput, activeNativo); })}
                    disabled={isFilterLoading}
                    className={`mapuche-chip shrink-0 ${
                      isActive ? "mapuche-chip-active" : "mapuche-chip-idle"
                    } disabled:cursor-wait disabled:opacity-70`}
                    aria-pressed={isActive}
                  >
                    {categoryLabel}
                  </button>
                );
              })}
          </div>

        </div>
      </div>

      {filterError && (
        <div className="mb-4 text-sm text-red-600">{filterError}</div>
      )}

      {isFilterLoading && (
        <div className="mb-4 text-sm text-zinc-500">
          {lang === "en" ? "Filtering plants..." : "Filtrando plantas..."}
        </div>
      )}

      <div className="relative">
        <PlantInfiniteGrid
          key={`${activeCategory || "all"}:${activeQuery}:${String(activeNativo)}:${viewMode}:${lang}`}
          initialPlants={page.plants}
          initialNextCursor={page.nextCursor}
          initialHasMore={page.hasMore}
          category={activeCategory}
          query={activeQuery}
          nativo={activeNativo}
          viewMode={viewMode}
          lang={lang}
          disableAutoLoad={Boolean(activeQuery.trim())}
        />
      </div>
    </>
  );
}