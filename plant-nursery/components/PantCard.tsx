import Image from "next/image";
import Link from "next/link";
import { Plant } from "@/types/plant";

export default function PlantCard({ plant }: { plant: Plant }) {
  return (
    <Link href={`/plants/${plant.slug}`}>
      <div className="border rounded-2xl p-4 shadow hover:shadow-lg transition bg-white">
        {plant.image && (
          <Image
            src={plant.image}
            alt={plant.name}
            width={480}
            height={192}
            className="w-full h-48 object-cover rounded-xl mb-3"
          />
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