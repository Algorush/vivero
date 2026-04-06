import Link from "next/link";
import { getPlants } from "@/lib/notion";

type HomeProps = {
  searchParams: Promise<{
    category?: string;
  }>;
};

export const revalidate = 60;

export default async function Home({ searchParams }: HomeProps) {
  const plants = await getPlants();
  const { category } = await searchParams;

  const activeCategory = category?.trim() || "";
  const categories = Array.from(
    new Set(plants.map((plant) => plant.category).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "es"));

  const filteredPlants = activeCategory
    ? plants.filter((plant) => plant.category === activeCategory)
    : plants;

  return (
    <div>
      <h1>Vivero de Plantas</h1>

      <div>
        <p>Filtrar por categoria:</p>
        <Link href="/">Todas</Link>
        {categories.map((cat) => (
          <Link key={cat} href={`/?category=${encodeURIComponent(cat)}`}>
            {cat}
          </Link>
        ))}
      </div>

      <div>
        {filteredPlants.map((plant) => (
          <a key={plant.id} href={`/plants/${plant.slug}`}>
            <div>
              <h2>{plant.name}</h2>
              <p>Categoria: {plant.category || "Sin categoria"}</p>
              <p>Cantidad: {plant.amount}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}