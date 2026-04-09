import { Client } from "@notionhq/client";
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
};

export async function getPlants(): Promise<Plant[]> {
  const databaseId =
    process.env.NOTION_DATA_SOURCE_ID ?? process.env.NOTION_DB_ID;

  if (!databaseId) {
    throw new Error("Missing NOTION_DATA_SOURCE_ID or NOTION_DB_ID.");
  }

  const response = await notionLegacy.request<LegacyQueryResponse>({
    path: `databases/${databaseId}/query`,
    method: "post",
    body: {},
  });

  return response.results
    .filter((p) => p.object === "page")
    .map(mapPlant);
}

export async function getPlantBySlug(slug: string): Promise<Plant | null> {
  const plants = await getPlants();
  return plants.find((plant) => plant.slug === slug) ?? null;
}

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