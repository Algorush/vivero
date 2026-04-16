import { Client } from "@notionhq/client";
import { unstable_cache } from "next/cache";
import type { Plant } from "@/types/plant";

// Legacy API (2022-06-28) — workspace not yet migrated to data sources
const notionLegacy = new Client({
  auth: process.env.NOTION_API_KEY,
  notionVersion: "2022-06-28", // legacy support
});

type NotionPage = {
  id: string;
  object: string;
  properties: {
    Title?: { title?: Array<{ plain_text?: string }> };
    Slug?: { rich_text?: Array<{ plain_text?: string }> };
    Description?: { rich_text?: Array<{ plain_text?: string }> };
    Category?: { select?: { name?: string } | null };
    Price?: { number?: number | null };
    Amount?: { number?: number | null };
    Available?: { checkbox?: boolean };
    Image?: { files?: Array<{ file?: { url?: string } }> };
  };
};

type LegacyQueryResponse = {
  results: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
};

type GetPlantsPageOptions = {
  category?: string;
  cursor?: string;
  pageSize?: number;
};

export type PlantsPageResult = {
  plants: Plant[];
  nextCursor: string | null;
  hasMore: boolean;
};

const DEFAULT_PAGE_SIZE = 12;
const CACHE_REVALIDATE_SECONDS = 60;
export const PLANTS_REVALIDATE_TAG = "plants";

function getDatabaseId(): string {
  const databaseId =
    process.env.NOTION_DATA_SOURCE_ID ?? process.env.NOTION_DB_ID;

  if (!databaseId) {
    throw new Error("Missing NOTION_DATA_SOURCE_ID or NOTION_DB_ID.");
  }

  return databaseId;
}

function normalizeCategory(category?: string): string | undefined {
  const value = category?.trim();
  return value || undefined;
}

async function queryPlants(params?: {
  category?: string;
  cursor?: string;
  pageSize?: number;
  slug?: string;
}): Promise<LegacyQueryResponse> {
  const body: Record<string, unknown> = {
    page_size: params?.pageSize ?? DEFAULT_PAGE_SIZE,
  };

  if (params?.cursor) {
    body.start_cursor = params.cursor;
  }

  if (params?.slug) {
    body.filter = {
      property: "Slug",
      rich_text: { equals: params.slug },
    };
  } else if (params?.category) {
    body.filter = {
      property: "Category",
      select: { equals: params.category },
    };
  }

  return notionLegacy.request<LegacyQueryResponse>({
    path: `databases/${getDatabaseId()}/query`,
    method: "post",
    body,
  });
}

export async function getPlants(): Promise<Plant[]> {
  return getPlantsCached();
}

const getPlantsCached = unstable_cache(async (): Promise<Plant[]> => {
  const plants: Plant[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await queryPlants({
      cursor,
      pageSize: 100,
    });

    plants.push(
      ...response.results
        .filter((p) => p.object === "page")
        .map(mapPlant)
    );

    cursor = response.next_cursor ?? undefined;
    hasMore = Boolean(response.has_more && cursor);
  }

  return plants;
}, ["notion-plants-all"], {
  revalidate: CACHE_REVALIDATE_SECONDS,
  tags: [PLANTS_REVALIDATE_TAG],
});

const getPlantsPageCached = unstable_cache(
  async (
    category: string,
    cursor: string,
    pageSize: number
  ): Promise<PlantsPageResult> => {
    const response = await queryPlants({
      category: category || undefined,
      cursor: cursor || undefined,
      pageSize,
    });

    const plants = response.results
      .filter((p) => p.object === "page")
      .map(mapPlant);

    return {
      plants,
      nextCursor: response.next_cursor ?? null,
      hasMore: Boolean(response.has_more && response.next_cursor),
    };
  },
  ["notion-plants-page"],
  {
    revalidate: CACHE_REVALIDATE_SECONDS,
    tags: [PLANTS_REVALIDATE_TAG],
  }
);

export async function getPlantsPage(
  options: GetPlantsPageOptions = {}
): Promise<PlantsPageResult> {
  const category = normalizeCategory(options.category) ?? "";
  const cursor = options.cursor?.trim() ?? "";
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  return getPlantsPageCached(category, cursor, pageSize);
}

export async function getPlantCategories(): Promise<string[]> {
  const plants = await getPlantsCached();
  return Array.from(
    new Set(
      plants
        .map((p) => p.category?.trim())
        .filter((cat): cat is string => Boolean(cat))
    )
  ).sort((a, b) => a.localeCompare(b, "es"));
}

export async function getPlantBySlug(slug: string): Promise<Plant | null> {
  return getPlantBySlugCached(slug.trim());
}

const getPlantBySlugCached = unstable_cache(
  async (slug: string): Promise<Plant | null> => {
    if (!slug) {
      return null;
    }

    const response = await queryPlants({
      slug,
      pageSize: 1,
    });

    const page = response.results.find((p) => p.object === "page");
    return page ? mapPlant(page) : null;
  },
  ["notion-plant-by-slug"],
  {
    revalidate: CACHE_REVALIDATE_SECONDS,
    tags: [PLANTS_REVALIDATE_TAG],
  }
);

function mapPlant(page: NotionPage): Plant {
  return {
    id: page.id,
    name: page.properties.Title?.title?.[0]?.plain_text || "",
    slug: page.properties.Slug?.rich_text?.[0]?.plain_text || "",
    description: page.properties.Description?.rich_text?.[0]?.plain_text || "",
    category: page.properties.Category?.select?.name || "",
    price: page.properties.Price?.number || 0,
    amount: page.properties.Amount?.number || 0,
    available: page.properties.Available?.checkbox || false,
    image: page.properties.Image?.files?.[0]?.file?.url || "",
  };
}