import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
import { getPlantBySlug } from "@/lib/notion";

type PlantPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function PlantPage({ params }: PlantPageProps) {
  const { slug } = await params;
  const plant = await getPlantBySlug(slug);

  if (!plant) {
    notFound();
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <p className="mb-4">
        <Link href="/">Volver al catalogo</Link>
      </p>

      <h1 className="text-3xl font-bold mb-4">{plant.name}</h1>

      {plant.image && (
        <Image
          src={plant.image}
          alt={plant.name}
          width={800}
          height={400}
          className="w-full h-auto rounded-xl mb-4"
        />
      )}

      <p className="text-gray-600 mb-2">
        Categoría: {plant.category}
      </p>

      <p>{plant.description}</p>
    </div>
  );
}
