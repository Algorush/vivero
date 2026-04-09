import Link from "next/link";
import { getPlants } from "@/lib/notion";
import PlantCard from "../components/PlantCard";

export const revalidate = 60;

type HomeProps = {
  searchParams: {
    category?: string;
  };
};

const normalize = (str: string) => str.toLowerCase().trim();

export default async function Home({ searchParams }: HomeProps) {
  const plants = await getPlants();
  const category = searchParams.category;

  const activeCategory = category?.trim() || "";

  const CATEGORY_ORDER = ["Árbol", "Arbusto", "Flor", "Suculenta"];

  // const categories = CATEGORY_ORDER.filter((cat) =>
  //   plants.some((p) => p.category === cat)
  // );

  const filteredPlants = activeCategory
    ? plants.filter(
        (plant) =>
          normalize(plant.category) === normalize(activeCategory)
      )
    : plants;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">Vivero de Plantas</h1>

      <p className="text-sm text-gray-500 mb-6">
        {filteredPlants.length} plantas encontradas
      </p>

      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href="/"
          className={`px-4 py-1.5 rounded-full border text-sm font-medium transition ${
            !activeCategory
              ? "bg-green-600 text-white border-green-600"
              : "border-gray-300 hover:border-green-500 hover:text-green-600 hover:bg-green-50"
          }`}
        >
          Todas
        </Link>

        {CATEGORY_ORDER.map((cat) => (
          <Link
            key={cat}
            href={`/?category=${encodeURIComponent(cat)}`}
            className={`px-4 py-1.5 rounded-full border text-sm font-medium transition ${
              activeCategory === cat
                ? "bg-green-600 text-white border-green-600"
                : "border-gray-300 hover:border-green-500 hover:text-green-600 hover:bg-green-50"
            }`}
          >
            {cat}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {filteredPlants.map((plant) => (
          <PlantCard key={plant.id} plant={plant} />
        ))}
      </div>
    </div>
  );
}