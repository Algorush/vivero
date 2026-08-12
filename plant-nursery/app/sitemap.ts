import type { MetadataRoute } from "next";
import { getPlants } from "@/lib/notion";
import { SITE_URL } from "@/lib/site-config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const plants = await getPlants();

  const homeEntries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}?lang=en`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];

  const aboutEntries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/sobre-nuestro-vivero`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/sobre-nuestro-vivero?lang=en`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  const plantEntries: MetadataRoute.Sitemap = plants.flatMap((plant) => {
    if (!plant.slug) {
      return [];
    }

    return [
      {
        url: `${SITE_URL}/plants/${plant.slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.8,
      },
      {
        url: `${SITE_URL}/plants/${plant.slug}?lang=en`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.8,
      },
    ];
  });

  return [...homeEntries, ...aboutEntries, ...plantEntries];
}
