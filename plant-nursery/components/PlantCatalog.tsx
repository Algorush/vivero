"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import PlantInfiniteGrid from "@/components/PlantInfiniteGrid";
import type { PlantsPageResult } from "@/lib/notion";

type PlantCatalogProps = {
  categories: string[];
  initialCategory: string;
  initialQuery: string;
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

function createFilterUrl(category?: string, searchQuery?: string): string {
  const params = new URLSearchParams();

  if (category) {
    params.set("category", category);
  }

  if (searchQuery) {
    params.set("q", searchQuery);
  }

  const queryString = params.toString();
  return queryString ? `/?${queryString}` : "/";
}

export default function PlantCatalog({
  categories,
  initialCategory,
  initialQuery,
  initialPage,
}: PlantCatalogProps) {
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const [filterError, setFilterError] = useState("");
  const requestIdRef = useRef(0);
  const lastFilterTouchAtRef = useRef(0);

  useEffect(() => {
    setActiveCategory(initialCategory);
    setSearchInput(initialQuery);
    setActiveQuery(initialQuery);
    setPage(initialPage);
    setFilterError("");
    setIsFilterLoading(false);
  }, [initialCategory, initialPage, initialQuery]);

  const applyFilters = useCallback(async (nextCategory: string, rawQuery: string) => {
    const nextQuery = rawQuery.trim();

    if (
      normalize(nextCategory) === normalize(activeCategory) &&
      nextQuery === activeQuery
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
      setPage(data);

      if (typeof window !== "undefined") {
        window.history.replaceState(
          {},
          "",
          createFilterUrl(nextCategory, nextQuery)
        );
      }
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
  }, [activeCategory, activeQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void applyFilters(activeCategory, searchInput);
    }, 320);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeCategory, applyFilters, searchInput]);

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

  return (
    <>
      <div className="mapuche-paper-surface sticky top-2 z-20 -mx-2 mb-8 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-[#fff9f0]/85 md:mx-0 md:border-0 md:bg-transparent md:px-4 md:py-4 md:shadow-none md:backdrop-blur-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#1f1a17] md:text-xl">Catalogo</h2>
          <p className="text-xs text-zinc-500">{categories.length + 1} filtros disponibles</p>
        </div>

        <div className="mb-3">
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Buscar por nombre, descripcion, flor, riego..."
            className="w-full rounded-xl border border-[#d8c0a0] bg-[#fffdf8] px-3 py-2 text-sm text-[#1f1a17] placeholder:text-zinc-500 focus:border-[#2f5f4f] focus:outline-none"
            aria-label="Buscar plantas"
          />
        </div>

        <div className="pt-2">
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              type="button"
              onTouchEnd={() => handleFilterTouchEnd(() => { void applyFilters("", searchInput); })}
              onClick={() => handleFilterClick(() => { void applyFilters("", searchInput); })}
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
                  onTouchEnd={() => handleFilterTouchEnd(() => { void applyFilters(category, searchInput); })}
                  onClick={() => handleFilterClick(() => { void applyFilters(category, searchInput); })}
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
          key={`${activeCategory || "all"}:${activeQuery}`}
          initialPlants={page.plants}
          initialNextCursor={page.nextCursor}
          initialHasMore={page.hasMore}
          category={activeCategory}
          query={activeQuery}
        />
      </div>
    </>
  );
}