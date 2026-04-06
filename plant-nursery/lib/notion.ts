import { Client, isFullPage } from "@notionhq/client";
import type { Plant } from "@/types/plant";

const notion = new Client({
  auth: process.env.NOTION_API_KEY,
});

export async function getPlants(): Promise<Plant[]> {
  const dataSourceId =
    process.env.NOTION_DATA_SOURCE_ID ?? process.env.NOTION_DB_ID;

  if (!dataSourceId) {
    throw new Error("Missing NOTION_DATA_SOURCE_ID (or NOTION_DB_ID)");
  }

  const response = await notion.dataSources.query({
    data_source_id: dataSourceId,
  });

  return response.results.filter(isFullPage).map(mapPlant);
}

export async function getPlantBySlug(slug: string): Promise<Plant | null> {
  const plants = await getPlants();
  return plants.find((plant) => plant.slug === slug) ?? null;
}

function mapPlant(plant: Parameters<typeof isFullPage>[0] & { properties: Record<string, unknown> }): Plant {
  const nameProperty = plant.properties["Name"] as
    | { type: "title"; title?: Array<{ plain_text?: string }> }
    | undefined;
  const slugProperty = plant.properties["Slug"] as
    | { type: "rich_text"; rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  const descriptionProperty = plant.properties["Description"] as
    | { type: "rich_text"; rich_text?: Array<{ plain_text?: string }> }
    | undefined;
  const categoryProperty = plant.properties["Category"] as
    | { type: "select"; select?: { name?: string } | null }
    | undefined;
  const priceProperty = plant.properties["Price"] as
    | { type: "number"; number?: number | null }
    | undefined;
  const amountProperty = plant.properties["Amount"] as
    | { type: "number"; number?: number | null }
    | undefined;
  const availableProperty = plant.properties["Available"] as
    | { type: "checkbox"; checkbox?: boolean }
    | undefined;
  const imageProperty = plant.properties["Image"] as
    | { type: "url"; url?: string | null }
    | undefined;

  return {
    id: plant.id,
    name:
      nameProperty?.type === "title"
        ? nameProperty.title?.[0]?.plain_text ?? "Untitled"
        : "Untitled",
    slug:
      slugProperty?.type === "rich_text"
        ? slugProperty.rich_text?.[0]?.plain_text ?? ""
        : "",
    description:
      descriptionProperty?.type === "rich_text"
        ? descriptionProperty.rich_text?.[0]?.plain_text ?? ""
        : "",
    category:
      categoryProperty?.type === "select"
        ? categoryProperty.select?.name ?? ""
        : "",
    price:
      priceProperty?.type === "number" ? priceProperty.number ?? 0 : 0,
    amount:
      amountProperty?.type === "number" ? amountProperty.number ?? 0 : 0,
    available:
      availableProperty?.type === "checkbox"
        ? availableProperty.checkbox ?? false
        : false,
    image: imageProperty?.type === "url" ? imageProperty.url ?? "" : "",
  };
}