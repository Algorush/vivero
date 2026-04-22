import { Client } from "@notionhq/client";
import { unstable_cache } from "next/cache";
import type { Plant } from "@/types/plant";

// --- Notion client -----------------------------------------------------------
// Legacy API version while the workspace is not migrated to data sources.
const notionLegacy = new Client({
  auth: process.env.NOTION_API_KEY,
  notionVersion: "2022-06-28",
});

// --- Types -------------------------------------------------------------------
type NotionPage = {
  id: string;
  object: string;
  properties: {
    Title?: { title?: Array<{ plain_text?: string }> };
    Slug?: { rich_text?: Array<{ plain_text?: string }> };
    Description?: { rich_text?: Array<{ plain_text?: string }> };
    Flor?: { rich_text?: Array<{ plain_text?: string }> };
    Riego?: { rich_text?: Array<{ plain_text?: string }> };
    Suelo?: { rich_text?: Array<{ plain_text?: string }> };
    Florece?: { rich_text?: Array<{ plain_text?: string }> };
    Exposicion?: { rich_text?: Array<{ plain_text?: string }> };
    Fruta?: { rich_text?: Array<{ plain_text?: string }> };
    Tamano?: { rich_text?: Array<{ plain_text?: string }> };
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
  query?: string;
  pageSize?: number;
};

type NotionRichTextItem = {
  plain_text?: string;
};

type NotionBlock = {
  type?: string;
  paragraph?: { rich_text?: NotionRichTextItem[] };
  heading_1?: { rich_text?: NotionRichTextItem[] };
  heading_2?: { rich_text?: NotionRichTextItem[] };
  heading_3?: { rich_text?: NotionRichTextItem[] };
  bookmark?: { url?: string };
  embed?: { url?: string };
  link_preview?: { url?: string };
  image?: {
    type?: "file" | "external";
    file?: { url?: string };
    external?: { url?: string };
  };
};

type NotionBlocksResponse = {
  results?: NotionBlock[];
};

export type PlantsPageResult = {
  plants: Plant[];
  nextCursor: string | null;
  hasMore: boolean;
};

export type NurseryProfile = {
  title: string;
  description: string;
  image: string;
  phone: string;
  whatsappText: string;
  ownerName: string;
  location: string;
  mapUrl: string;
};

type NurserySection =
  | "title"
  | "description"
  | "image"
  | "phone"
  | "whatsappText"
  | "ownerName"
  | "location"
  | "mapUrl";

// --- Constants ---------------------------------------------------------------
const DEFAULT_PAGE_SIZE = 12;
const CACHE_REVALIDATE_SECONDS = 60;
const NURSERY_PAGE_RAW_ID = "Vivero-Kar-lemu-plantas-nativas-y-ex-ticas-33a014ba6d4b8024b8caf02162fc9492";
export const PLANTS_REVALIDATE_TAG = "plants";

// --- Small helpers -----------------------------------------------------------
// Resolves the Notion database ID from env vars.
function getDatabaseId(): string {
  const databaseId =
    process.env.NOTION_DATA_SOURCE_ID ?? process.env.NOTION_DB_ID;

  if (!databaseId) {
    throw new Error("Missing NOTION_DATA_SOURCE_ID or NOTION_DB_ID.");
  }

  return databaseId;
}

// Normalizes a category filter value.
function normalizeCategory(category?: string): string | undefined {
  const value = category?.trim();
  return value || undefined;
}

function normalizeSearchQuery(query?: string): string | undefined {
  const value = query?.trim();
  return value || undefined;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function parseOffsetCursor(cursor: string): number {
  if (!cursor.startsWith("offset:")) {
    return 0;
  }

  const offset = Number(cursor.slice("offset:".length));
  return Number.isFinite(offset) && offset >= 0 ? offset : 0;
}

// Extracts and formats a canonical UUID from a mixed page identifier.
function normalizeNotionPageId(value: string): string {
  const compact = value.replace(/-/g, "");
  const match = compact.match(/[0-9a-fA-F]{32}/);

  if (!match) {
    return value;
  }

  const id = match[0].toLowerCase();
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

// Converts rich text array into a plain string.
function richTextToPlain(items?: NotionRichTextItem[]): string {
  return (items ?? []).map((item) => item.plain_text ?? "").join("").trim();
}

function textArrayToPlain(items?: Array<{ plain_text?: string }>): string {
  return (items ?? []).map((item) => item.plain_text ?? "").join("").trim();
}

// Returns heading text from heading_1/2/3 blocks.
function getHeadingText(block: NotionBlock): string {
  if (block.type === "heading_1") {
    return richTextToPlain(block.heading_1?.rich_text);
  }

  if (block.type === "heading_2") {
    return richTextToPlain(block.heading_2?.rich_text);
  }

  if (block.type === "heading_3") {
    return richTextToPlain(block.heading_3?.rich_text);
  }

  return "";
}

// Returns text content from paragraph blocks.
function getParagraphText(block: NotionBlock): string {
  if (block.type !== "paragraph") {
    return "";
  }

  return richTextToPlain(block.paragraph?.rich_text);
}

// Returns a URL from supported link-like blocks.
function getBlockUrl(block: NotionBlock): string {
  if (block.type === "embed") {
    return block.embed?.url ?? "";
  }

  if (block.type === "bookmark") {
    return block.bookmark?.url ?? "";
  }

  if (block.type === "link_preview") {
    return block.link_preview?.url ?? "";
  }

  const paragraph = getParagraphText(block);
  return paragraph.startsWith("http") ? paragraph : "";
}

// Normalizes headings to compare section keys safely.
function normalizeHeading(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Maps heading text to nursery profile section keys.
function headingToSection(heading: string): NurserySection | null {
  const key = normalizeHeading(heading);

  if (key === "description") return "description";
  if (key === "photo principal") return "image";
  if (key === "telefono") return "phone";
  if (key === "text whatsapp") return "whatsappText";
  if (key === "nombre") return "ownerName";
  if (key === "ubicacion") return "location";
  if (key === "direccion") return "mapUrl";

  return null;
}

// Returns image URL from image block.
function getImageFromBlock(block: NotionBlock): string {
  if (block.image?.type === "file") {
    return block.image.file?.url ?? "";
  }

  if (block.image?.type === "external") {
    return block.image.external?.url ?? "";
  }

  return "";
}

// Maps Notion database page to internal Plant model.
function mapPlant(page: NotionPage): Plant {
  const allImages = (page.properties.Image?.files ?? [])
    .map((f) => f.file?.url ?? "")
    .filter(Boolean);

  return {
    id: page.id,
    name: textArrayToPlain(page.properties.Title?.title),
    slug: textArrayToPlain(page.properties.Slug?.rich_text),
    description: textArrayToPlain(page.properties.Description?.rich_text),
    flor: textArrayToPlain(page.properties.Flor?.rich_text),
    riego: textArrayToPlain(page.properties.Riego?.rich_text),
    suelo: textArrayToPlain(page.properties.Suelo?.rich_text),
    florece: textArrayToPlain(page.properties.Florece?.rich_text),
    exposicion: textArrayToPlain(page.properties.Exposicion?.rich_text),
    fruta: textArrayToPlain(page.properties.Fruta?.rich_text),
    tamano: textArrayToPlain(page.properties.Tamano?.rich_text),
    category: page.properties.Category?.select?.name || "",
    price: page.properties.Price?.number || 0,
    amount: page.properties.Amount?.number || 0,
    available: page.properties.Available?.checkbox || false,
    image: allImages[0] ?? "",
    images: allImages,
  };
}

// --- Notion requests ---------------------------------------------------------
// Queries plants with optional category, slug and cursor filters.
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

// --- Public API --------------------------------------------------------------
// Returns all plants from cache.
export async function getPlants(): Promise<Plant[]> {
  return getPlantsCached();
}

// Returns a paginated list of plants.
export async function getPlantsPage(
  options: GetPlantsPageOptions = {}
): Promise<PlantsPageResult> {
  const category = normalizeCategory(options.category) ?? "";
  const cursor = options.cursor?.trim() ?? "";
  const query = normalizeSearchQuery(options.query) ?? "";
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;

  if (query) {
    const normalizedQuery = normalizeSearchText(query);
    const normalizedCategory = normalizeSearchText(category);

    const filteredPlants = (await getPlantsCached()).filter((plant) => {
      if (
        category &&
        normalizeSearchText(plant.category ?? "") !== normalizedCategory
      ) {
        return false;
      }

      const searchableText = [
        plant.name,
        plant.category,
        plant.description,
        plant.flor,
        plant.riego,
        plant.suelo,
        plant.florece,
        plant.exposicion,
        plant.fruta,
        plant.tamano,
      ]
        .map((value) => normalizeSearchText(value ?? ""))
        .join(" ");

      return searchableText.includes(normalizedQuery);
    });

    const startIndex = parseOffsetCursor(cursor);
    const plants = filteredPlants.slice(startIndex, startIndex + pageSize);
    const nextIndex = startIndex + plants.length;
    const hasMore = nextIndex < filteredPlants.length;

    return {
      plants,
      nextCursor: hasMore ? `offset:${nextIndex}` : null,
      hasMore,
    };
  }

  return getPlantsPageCached(category, cursor, pageSize);
}

// Returns unique sorted plant categories.
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

// Returns one plant by slug.
export async function getPlantBySlug(slug: string): Promise<Plant | null> {
  return getPlantBySlugCached(slug.trim());
}

// Returns nursery profile from the dedicated Notion page.
export async function getNurseryProfile(): Promise<NurseryProfile> {
  return getNurseryProfileCached();
}

// --- Cached queries ----------------------------------------------------------
// Cached full list for catalog and category derivation.
const getPlantsCached = unstable_cache(async (): Promise<Plant[]> => {
  const plants: Plant[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const response = await queryPlants({
      cursor,
      pageSize: 100,
    });

    plants.push(...response.results.filter((p) => p.object === "page").map(mapPlant));

    cursor = response.next_cursor ?? undefined;
    hasMore = Boolean(response.has_more && cursor);
  }

  return plants;
}, ["notion-plants-all"], {
  revalidate: CACHE_REVALIDATE_SECONDS,
  tags: [PLANTS_REVALIDATE_TAG],
});

// Cached paginated query for infinite scrolling.
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

// Cached slug lookup for details page.
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

// Cached nursery content: first heading, first paragraph and first image.
const getNurseryProfileCached = unstable_cache(
  async (): Promise<NurseryProfile> => {
    const pageId = normalizeNotionPageId(NURSERY_PAGE_RAW_ID);

    const children = await notionLegacy.request<NotionBlocksResponse>({
      path: `blocks/${pageId}/children?page_size=50`,
      method: "get",
    });

    const blocks = children.results ?? [];

    const firstHeading = blocks
      .map(getHeadingText)
      .find(Boolean);

    const profile: NurseryProfile = {
      title: firstHeading || "Sobre nuestro vivero",
      description: "",
      image: "",
      phone: "",
      whatsappText: "",
      ownerName: "",
      location: "",
      mapUrl: "",
    };

    let currentSection: NurserySection | null = null;

    for (const block of blocks) {
      const heading = getHeadingText(block);
      if (heading) {
        const section = headingToSection(heading);
        currentSection = section;
        continue;
      }

      if (!currentSection) {
        continue;
      }

      if (currentSection === "image" && !profile.image) {
        profile.image = getImageFromBlock(block);
        continue;
      }

      if (currentSection === "mapUrl" && !profile.mapUrl) {
        profile.mapUrl = getBlockUrl(block);
        continue;
      }

      const paragraphText = getParagraphText(block);
      if (!paragraphText) {
        continue;
      }

      if (currentSection === "description" && !profile.description) {
        profile.description = paragraphText;
      } else if (currentSection === "phone" && !profile.phone) {
        profile.phone = paragraphText;
      } else if (currentSection === "whatsappText" && !profile.whatsappText) {
        profile.whatsappText = paragraphText;
      } else if (currentSection === "ownerName" && !profile.ownerName) {
        profile.ownerName = paragraphText;
      } else if (currentSection === "location" && !profile.location) {
        profile.location = paragraphText;
      } else if (currentSection === "mapUrl" && !profile.mapUrl) {
        profile.mapUrl = paragraphText;
      }
    }

    if (!profile.description) {
      profile.description = blocks
        .map(getParagraphText)
        .find(Boolean) ?? "";
    }

    if (!profile.image) {
      profile.image = blocks
        .map(getImageFromBlock)
        .find(Boolean) ?? "";
    }

    return {
      ...profile,
    };
  },
  ["notion-nursery-profile"],
  {
    revalidate: CACHE_REVALIDATE_SECONDS,
    tags: [PLANTS_REVALIDATE_TAG],
  }
);
