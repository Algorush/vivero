import Link from "next/link";
import ImageCarousel from "@/components/ImageCarousel";
import { Plant } from "@/types/plant";

type PlantCardProps = {
  plant: Plant;
  priority?: boolean;
  animationDelayMs?: number;
};

export default function PlantCard({
  plant,
  priority = false,
  animationDelayMs = 0,
}: PlantCardProps) {
  return (
    <Link href={`/plants/${plant.slug}`} className="block min-w-0">
      <div
        className="animate-card-in min-w-0 overflow-hidden rounded-2xl border bg-white p-4 shadow transition hover:shadow-lg motion-reduce:animate-none"
        style={{ animationDelay: `${animationDelayMs}ms` }}
      >
        {plant.images?.length > 0 && (
          <div className="relative w-full h-48 rounded-xl mb-3 overflow-hidden">
            <ImageCarousel
              images={plant.images}
              alt={plant.name}
              fill
              priority={priority}
              quality={85}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
        )}

        <h2 className="break-words text-lg font-semibold">{plant.name}</h2>

        <p className="break-words text-sm text-gray-500">{plant.category}</p>

        {plant.price > 0 && (
          <p className="text-green-600 font-bold mt-2">
            ${plant.price}
          </p>
        )}
      </div>
    </Link>
  );
}