"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import PlantInfiniteGrid from "@/components/PlantInfiniteGrid";
import type { PlantsPageResult } from "@/lib/notion";

type PlantCatalogProps = {
  categories: string[];
  initialCategory: string;
  initialQuery: string;
  initialNativo?: boolean;
  initialPage: PlantsPageResult;
};

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

function createFilterUrl(category?: string, searchQuery?: string, nativo?: boolean): string {
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

  const queryString = params.toString();
  return queryString ? `/?${queryString}` : "/";
}

export default function PlantCatalog({
  categories,
  initialCategory,
  initialQuery,
  initialNativo,
  initialPage,
}: PlantCatalogProps) {
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [activeNativo, setActiveNativo] = useState<boolean | undefined>(initialNativo);
  const [page, setPage] = useState(initialPage);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const [filterError, setFilterError] = useState("");
  const requestIdRef = useRef(0);
  const lastFilterTouchAtRef = useRef(0);
  const activeCategoryRef = useRef(activeCategory);
  const activeQueryRef = useRef(activeQuery);
  const activeNativoRef = useRef(activeNativo);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Keep refs in sync with state
  useEffect(() => { activeCategoryRef.current = activeCategory; }, [activeCategory]);
  useEffect(() => { activeQueryRef.current = activeQuery; }, [activeQuery]);
  useEffect(() => { activeNativoRef.current = activeNativo; }, [activeNativo]);

  // Restore state from URL on popstate (back/forward navigation)
  useEffect(() => {
    const urlQuery = searchParams.get("q") ?? "";
    const urlCategory = searchParams.get("category") ?? "";
    const urlNativoRaw = searchParams.get("nativo");
    const urlNativo = urlNativoRaw === "true" ? true : urlNativoRaw === "false" ? false : undefined;
    setSearchInput(urlQuery);
    setActiveQuery(urlQuery);
    setActiveCategory(urlCategory);
    setActiveNativo(urlNativo);
  }, [searchParams]);

  const applyFilters = useCallback(async (nextCategory: string, rawQuery: string, nextNativo: boolean | undefined) => {
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
      query.set("pageSize", "12");

      const response = await fetch(`/api/plants?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
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

      router.replace(createFilterUrl(nextCategory, nextQuery, nextNativo), { scroll: false });
    } catch (error) {
      if (requestIdRef.current !== requestId) {
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
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void applyFilters(activeCategory, searchInput, activeNativo);
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeCategory, activeNativo, applyFilters, searchInput]);

  const runFilterAction = (action: () => void) => {
    action();
  };

  const handleFilterTouchEnd = (action: () => void) => {
    lastFilterTouchAtRef.current = Date.now();
    runFilterAction(action);
  };

  const handleFilterClick = (action: () => void) => {
    if (Date.now() - lastFilterTouchAtRef.current < 450) {
      return;
    }

    runFilterAction(action);
  };

  const toggleNativo = (value: boolean | undefined) => {
    const next = activeNativo === value ? undefined : value;
    void applyFilters(activeCategory, searchInput, next);
  };

  const catalogLabel =
    activeNativo === true
      ? "Fillke Aliwentu"
      : activeNativo === false
        ? "Fillke Anumka"
        : "";

  return (
    <>
      <div className="sticky top-2 z-20 mb-6">
        <div className="mapuche-paper-surface -mx-2 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-[#fff9f0]/85 md:mx-0 md:border-0 md:bg-transparent md:px-4 md:shadow-none md:backdrop-blur-0">

          {/* Row 1: title + search */}
          <div className="mb-2 flex items-center gap-2">
            <h2 className="shrink-0 text-base font-semibold text-[#1f1a17] md:text-lg">
              {catalogLabel ? (
                <span className="ml-1.5 font-medium text-[#8b4f35]">{catalogLabel}</span>
              ) : null}
            </h2>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar planta..."
              className="min-w-0 flex-1 rounded-xl border border-[#d8c0a0] bg-[#fffdf8] px-3 py-1.5 text-sm text-[#1f1a17] placeholder:text-zinc-400 focus:border-[#2f5f4f] focus:outline-none"
              aria-label="Buscar plantas"
            />
          </div>

          {/* Row 2: nativo toggles + category chips in single scrollable row */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => toggleNativo(true)}
              disabled={isFilterLoading}
              className={`mapuche-chip shrink-0 ${
                activeNativo === true ? "mapuche-chip-active" : "mapuche-chip-idle"
              } disabled:cursor-wait disabled:opacity-70`}
              aria-pressed={activeNativo === true}
            >
              🌿 Nativas
            </button>
            <button
              type="button"
              onClick={() => toggleNativo(false)}
              disabled={isFilterLoading}
              className={`mapuche-chip shrink-0 ${
                activeNativo === false ? "mapuche-chip-active" : "mapuche-chip-idle"
              } disabled:cursor-wait disabled:opacity-70`}
              aria-pressed={activeNativo === false}
            >
              🌺 Exóticas
            </button>
            {/* divider */}
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
              Todas
            </button>

              {categories.map((category) => {
                const isActive = normalize(activeCategory) === normalize(category);

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
                    {category}
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
        <div className="mb-4 text-sm text-zinc-500">Filtrando plantas...</div>
      )}

      <div className="relative">
        <PlantInfiniteGrid
          key={`${activeCategory || "all"}:${activeQuery}:${String(activeNativo)}`}
          initialPlants={page.plants}
          initialNextCursor={page.nextCursor}
          initialHasMore={page.hasMore}
          category={activeCategory}
          query={activeQuery}
          nativo={activeNativo}
        />
      </div>
    </>
  );
}