import Link from "next/link";
import ImageCarousel from "@/components/ImageCarousel";
import AddToCartButton from "@/components/AddToCartButton";
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
        className="relative animate-card-in min-w-0 overflow-hidden rounded-2 bg-white text-[#1f1a17] shadow transition hover:shadow-lg motion-reduce:animate-none dark:bg-[#fffdf8] dark:text-[#1f1a17]"
        style={{ animationDelay: `${animationDelayMs}ms` }}
      >
        {plant.images?.length > 0 && (
          <div className="relative w-full h-48 rounded mb-3 overflow-hidden">
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

        <h2 className="break-words text-lg font-semibold text-[#1f1a17]">
          {plant.name}
        </h2>

        <p className="break-words text-sm text-[#6b5b4c]">{plant.category}</p>

        {plant.price > 0 && (
          <p className="mt-2 font-bold text-[#2f5f4f]">
            ${plant.price}
          </p>
        )}

        <AddToCartButton plant={plant} variant="icon" />
      </div>
    </Link>
  );
}