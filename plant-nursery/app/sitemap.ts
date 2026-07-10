import type { MetadataRoute } from "next";
import { getPlants } from "@/lib/notion";
import { SITE_URL } from "@/lib/site-config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const plants = await getPlants();

  const plantEntries: MetadataRoute.Sitemap = plants
    .filter((plant) => plant.slug)
    .map((plant) => ({
      url: `${SITE_URL}/plants/${plant.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    }));

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/sobre-nuestro-vivero`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  return [...staticEntries, ...plantEntries];
}
