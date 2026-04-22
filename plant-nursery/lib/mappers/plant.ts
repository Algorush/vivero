import { Plant } from "@/types/plant";

type NotionPageLike = {
  id: string;
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

function textArrayToPlain(items?: Array<{ plain_text?: string }>): string {
  return (items ?? []).map((item) => item.plain_text ?? "").join("").trim();
}

export function mapPlant(page: NotionPageLike): Plant {
  const allImages = (page.properties.Image?.files ?? [])
    .map((file) => file.file?.url || "")
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