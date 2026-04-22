"use client";

import { useEffect, useRef, useState } from "react";

import PlantInfiniteGrid from "@/components/PlantInfiniteGrid";
import type { PlantsPageResult } from "@/lib/notion";

type PlantCatalogProps = {
  categories: string[];
  initialCategory: string;
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

function createFilterUrl(category?: string): string {
  const params = new URLSearchParams();

  if (category) {
    params.set("category", category);
  }

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export default function PlantCatalog({
  categories,
  initialCategory,
  initialPage,
}: PlantCatalogProps) {
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [page, setPage] = useState(initialPage);
  const [isFilterLoading, setIsFilterLoading] = useState(false);
  const [filterError, setFilterError] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    setActiveCategory(initialCategory);
    setPage(initialPage);
    setFilterError("");
    setIsFilterLoading(false);
  }, [initialCategory, initialPage]);

  const applyCategory = async (nextCategory: string) => {
    if (normalize(nextCategory) === normalize(activeCategory)) {
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
      setPage(data);

      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", createFilterUrl(nextCategory));
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
  };

  return (
    <>
      <div className="mapuche-paper-surface sticky top-2 z-20 -mx-2 mb-8 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-[#fff9f0]/85 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[#1f1a17] md:text-xl">Catalogo</h2>
          <p className="text-xs text-zinc-500">{categories.length + 1} filtros disponibles</p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            type="button"
            onClick={() => void applyCategory("")}
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
                onClick={() => void applyCategory(category)}
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

      {filterError && (
        <div className="mb-4 text-sm text-red-600">{filterError}</div>
      )}

      {isFilterLoading && (
        <div className="mb-4 text-sm text-zinc-500">Filtrando plantas...</div>
      )}

      <div className="relative">
        <PlantInfiniteGrid
          key={activeCategory || "all"}
          initialPlants={page.plants}
          initialNextCursor={page.nextCursor}
          initialHasMore={page.hasMore}
          category={activeCategory}
        />
      </div>
    </>
  );
}