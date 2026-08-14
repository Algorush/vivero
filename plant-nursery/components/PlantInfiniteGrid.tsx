"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import PlantCard from "@/components/PlantCard";
import type { Plant } from "@/types/plant";
import { normalizeSiteLanguage, type SiteLanguage } from "@/lib/site-language";

type PlantInfiniteGridProps = {
  initialPlants: Plant[];
  initialNextCursor: string | null;
  initialHasMore: boolean;
  category: string;
  query: string;
  nativo?: boolean;
  viewMode?: "large" | "compact";
  disableAutoLoad?: boolean;
  lang?: SiteLanguage;
};

type PlantsApiResponse = {
  plants: Plant[];
  nextCursor: string | null;
  hasMore: boolean;
};

function filterAvailablePlants(plants: Plant[]): Plant[] {
  return plants.filter((plant) => plant.available === true);
}

function buildCatalogSearchParams(
  category: string,
  query: string,
  nativo: boolean | undefined,
  viewMode: "large" | "compact"
): string {
  const params = new URLSearchParams();

  if (category.trim()) {
    params.set("category", category.trim());
  }

  if (query.trim()) {
    params.set("q", query.trim());
  }

  if (nativo !== undefined) {
    params.set("nativo", String(nativo));
  }

  if (viewMode !== "large") {
    params.set("view", viewMode);
  }

  return params.toString();
}

export default function PlantInfiniteGrid({
  initialPlants,
  initialNextCursor,
  initialHasMore,
  category,
  query,
  nativo,
  viewMode = "large",
  disableAutoLoad = false,
  lang: rawLang = "es",
}: PlantInfiniteGridProps) {
  const lang = normalizeSiteLanguage(rawLang);
  const [plants, setPlants] = useState<Plant[]>(filterAvailablePlants(initialPlants));
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const catalogSearchParams = buildCatalogSearchParams(category, query, nativo, viewMode);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hasUserScrolledRef = useRef(false);
  const isSingleResult = plants.length === 1;

  useEffect(() => {
    setPlants(filterAvailablePlants(initialPlants));
    setNextCursor(initialNextCursor);
    setHasMore(initialHasMore);
    setError("");
    setIsLoading(false);
  }, [initialPlants, initialNextCursor, initialHasMore, category, query]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || !nextCursor) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const payload = {
        category: category || undefined,
        query: query || undefined,
        nativo,
        cursor: nextCursor,
        pageSize: 12,
        lang,
      };

      const response = await fetch("/api/plants", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let serverMessage = "";
        try {
          const body = (await response.json()) as { error?: string };
          serverMessage = body.error ?? "";
        } catch {
          serverMessage = "";
        }
        throw new Error(serverMessage || "Failed to load more plants");
      }

      const data = (await response.json()) as PlantsApiResponse;

      setPlants((prev) => {
        const existingIds = new Set(prev.map((plant) => plant.id));
        const uniqueIncoming = filterAvailablePlants(data.plants).filter(
          (plant) => !existingIds.has(plant.id)
        );

        return [...prev, ...uniqueIncoming];
      });

      if (data.plants.length === 0 && data.hasMore) {
        setError("No llegaron nuevas plantas, intenta de nuevo");
      }

      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo cargar mas plantas";
      setError(message || "No se pudo cargar mas plantas");
    } finally {
      setIsLoading(false);
    }
  }, [category, hasMore, isLoading, lang, nativo, nextCursor, query]);

  useEffect(() => {
    if (disableAutoLoad) {
      return;
    }

    if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return;
    }

    if (!hasMore || isLoading) {
      return;
    }

    const target = sentinelRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "400px 0px" }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [disableAutoLoad, hasMore, isLoading, loadMore]);

  const renderCardGrid = () => {
    const gridClassName =
      viewMode === "compact"
        ? "mx-auto grid w-full max-w-7xl grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 overflow-hidden sm:gap-4 lg:gap-5"
        : "mx-auto grid w-full max-w-7xl grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 overflow-hidden sm:gap-5 lg:gap-6";

    return (
      <div className={gridClassName}>
        {plants.map((plant, index) => (
          <div
            key={plant.id}
            className={`min-w-0 ${isSingleResult ? "lg:w-1/2 lg:max-w-[50%] lg:mx-auto" : ""}`}
          >
            <PlantCard
              plant={plant}
              priority={index === 0}
              animationDelayMs={(index % 12) * 45}
              lang={lang}
              catalogSearchParams={catalogSearchParams}
              size={viewMode === "compact" ? "compact" : "large"}
            />
          </div>
        ))}
      </div>
    );
  };

  useEffect(() => {
    if (disableAutoLoad) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const tryAutoLoad = () => {
      if (!hasUserScrolledRef.current) {
        return;
      }

      if (!hasMore || isLoading) {
        return;
      }

      const scrollBottom = window.innerHeight + window.scrollY;
      const triggerPoint = document.documentElement.scrollHeight - 500;

      if (scrollBottom >= triggerPoint) {
        void loadMore();
      }
    };

    const handleScroll = () => {
      hasUserScrolledRef.current = true;
      tryAutoLoad();
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", tryAutoLoad);
    window.addEventListener("touchmove", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", tryAutoLoad);
      window.removeEventListener("touchmove", handleScroll);
    };
  }, [disableAutoLoad, hasMore, isLoading, loadMore]);

  return (
    <>
      {renderCardGrid()}

      {error && (
        <div className="mt-6 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mt-6 text-center text-sm text-gray-500">
          {lang === "en" ? "Loading more plants..." : "Cargando mas plantas..."}
        </div>
      )}

      {hasMore && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => void loadMore()}
            onTouchEnd={() => void loadMore()}
            disabled={isLoading}
            className="relative z-10 px-4 py-2 rounded-lg border border-green-600 text-green-700 hover:bg-green-50 transition touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
          >
              {isLoading ? (lang === "en" ? "Loading..." : "Cargando...") : (lang === "en" ? "Load more" : "Cargar mas")}
          </button>

          <div
            ref={sentinelRef}
            className="h-12 w-full"
            aria-hidden="true"
          />
        </div>
      )}
    </>
  );
}
