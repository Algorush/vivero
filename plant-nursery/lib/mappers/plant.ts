import { Plant } from "@/types/plant";

type NotionPageLike = {
  id: string;
  properties: {
    Name?: { title?: Array<{ plain_text?: string }> };
    Slug?: { rich_text?: Array<{ plain_text?: string }> };
    Description?: { rich_text?: Array<{ plain_text?: string }> };
    Category?: { select?: { name?: string } | null };
    Price?: { number?: number | null };
    Amount?: { number?: number | null };
    Available?: { checkbox?: boolean };
    Image?: { files?: Array<{ file?: { url?: string } }> };
  };
};

export function mapPlant(page: NotionPageLike): Plant {
  return {
    id: page.id,
    name: page.properties.Name?.title?.[0]?.plain_text || "",
    slug: page.properties.Slug?.rich_text?.[0]?.plain_text || "",
    description: page.properties.Description?.rich_text?.[0]?.plain_text || "",
    category: page.properties.Category?.select?.name || "",
    price: page.properties.Price?.number || 0,
    amount: page.properties.Amount?.number || 0,
    available: page.properties.Available?.checkbox || false,
    image: page.properties.Image?.files?.[0]?.file?.url || "",
  };
}