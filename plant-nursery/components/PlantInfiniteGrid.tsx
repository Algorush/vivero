"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import PlantCard from "@/components/PlantCard";
import type { Plant } from "@/types/plant";

type PlantInfiniteGridProps = {
  initialPlants: Plant[];
  initialNextCursor: string | null;
  initialHasMore: boolean;
  category: string;
  query: string;
};

type PlantsApiResponse = {
  plants: Plant[];
  nextCursor: string | null;
  hasMore: boolean;
};

export default function PlantInfiniteGrid({
  initialPlants,
  initialNextCursor,
  initialHasMore,
  category,
  query,
}: PlantInfiniteGridProps) {
  const [plants, setPlants] = useState<Plant[]>(initialPlants);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [hasMore, setHasMore] = useState<boolean>(initialHasMore);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPlants(initialPlants);
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
        cursor: nextCursor,
        pageSize: 12,
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
        const uniqueIncoming = data.plants.filter(
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
  }, [category, hasMore, isLoading, nextCursor, query]);

  useEffect(() => {
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
  }, [hasMore, isLoading, loadMore]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const tryAutoLoad = () => {
      if (!hasMore || isLoading) {
        return;
      }

      const scrollBottom = window.innerHeight + window.scrollY;
      const triggerPoint = document.documentElement.scrollHeight - 500;

      if (scrollBottom >= triggerPoint) {
        void loadMore();
      }
    };

    window.addEventListener("scroll", tryAutoLoad, { passive: true });
    window.addEventListener("resize", tryAutoLoad);
    window.addEventListener("touchmove", tryAutoLoad, { passive: true });

    tryAutoLoad();

    return () => {
      window.removeEventListener("scroll", tryAutoLoad);
      window.removeEventListener("resize", tryAutoLoad);
      window.removeEventListener("touchmove", tryAutoLoad);
    };
  }, [hasMore, isLoading, loadMore]);

  return (
    <>
      <div className="grid w-full max-w-full grid-cols-1 gap-6 overflow-x-hidden sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {plants.map((plant, index) => (
          <div key={plant.id} className="min-w-0">
            <PlantCard
              plant={plant}
              priority={index === 0}
              animationDelayMs={(index % 12) * 45}
            />
          </div>
        ))}
      </div>

      {error && (
        <div className="mt-6 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mt-6 text-center text-sm text-gray-500">
          Cargando mas plantas...
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
            {isLoading ? "Cargando..." : "Cargar mas"}
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
