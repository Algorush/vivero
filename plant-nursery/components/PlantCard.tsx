import Image from "next/image";
import Link from "next/link";
import { Plant } from "@/types/plant";

type PlantCardProps = {
  plant: Plant;
  priority?: boolean;
};

export default function PlantCard({
  plant,
  priority = false,
}: PlantCardProps) {
  return (
    <Link href={`/plants/${plant.slug}`}>
      <div className="border rounded-2xl p-4 shadow hover:shadow-lg transition bg-white">
        {plant.image && (
          <div className="relative w-full h-48 rounded-xl mb-3 overflow-hidden">
            <Image
              src={plant.image}
              alt={plant.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              priority={priority}
              quality={70}
            />
          </div>
        )}

        <h2 className="text-lg font-semibold">{plant.name}</h2>

        <p className="text-sm text-gray-500">{plant.category}</p>

        {plant.price > 0 && (
          <p className="text-green-600 font-bold mt-2">
            ${plant.price}
          </p>
        )}
      </div>
    </Link>
  );
}