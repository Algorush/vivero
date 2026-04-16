import Link from "next/link";
import { getPlantCategories, getPlantsPage } from "@/lib/notion";
import PlantInfiniteGrid from "@/components/PlantInfiniteGrid";

export const revalidate = 60;

type HomeProps = {
  searchParams: Promise<{
    category?: string;
    cursor?: string;
  }>;
};

const normalize = (str: string) => str.toLowerCase().trim();

export default async function Home({ searchParams }: HomeProps) {
  const { category, cursor } = await searchParams;

  const activeCategory = category?.trim() || "";
  const activeCursor = cursor?.trim() || "";

  const [categories, plantsPage] = await Promise.all([
    getPlantCategories(),
    getPlantsPage({
      category: activeCategory || undefined,
      cursor: activeCursor || undefined,
      pageSize: 12,
    }),
  ]);

  const createFilterHref = (nextCategory?: string) => {
    const params = new URLSearchParams();
    if (nextCategory) {
      params.set("category", nextCategory);
    }
    const query = params.toString();
    return query ? `/?${query}` : "/";
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Vivero de Plantas</h1>

      <p className="text-sm text-gray-500 mb-6">Desplazate hacia abajo para cargar mas plantas</p>

      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href={createFilterHref()}
          className={`px-4 py-1.5 rounded-full border text-sm font-medium transition ${
            !activeCategory
              ? "bg-green-600 text-white border-green-600"
              : "border-gray-300 hover:border-green-500 hover:text-green-600 hover:bg-green-50"
          }`}
        >
          Todas
        </Link>

        {categories.map((cat) => (
          <Link
            key={cat}
            href={createFilterHref(cat)}
            className={`px-4 py-1.5 rounded-full border text-sm font-medium transition ${
              normalize(activeCategory) === normalize(cat)
                ? "bg-green-600 text-white border-green-600"
                : "border-gray-300 hover:border-green-500 hover:text-green-600 hover:bg-green-50"
            }`}
          >
            {cat}
          </Link>
        ))}
      </div>

      <PlantInfiniteGrid
        key={activeCategory || "all"}
        initialPlants={plantsPage.plants}
        initialNextCursor={plantsPage.nextCursor}
        initialHasMore={plantsPage.hasMore}
        category={activeCategory}
      />
    </div>
  );
}