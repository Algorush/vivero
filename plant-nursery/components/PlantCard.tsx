import Link from "next/link";
import ImageCarousel from "@/components/ImageCarousel";
import AddToCartButton from "@/components/AddToCartButton";
import { Plant } from "@/types/plant";
import { appendLanguageParam, normalizeSiteLanguage, type SiteLanguage } from "@/lib/site-language";

type PlantCardProps = {
  plant: Plant;
  priority?: boolean;
  animationDelayMs?: number;
  lang?: SiteLanguage;
};

export default function PlantCard({
  plant,
  priority = false,
  animationDelayMs = 0,
  lang: rawLang = "es",
}: PlantCardProps) {
  const lang = normalizeSiteLanguage(rawLang);
  return (
    <Link href={appendLanguageParam(`/plants/${plant.slug}`, lang)} className="block h-full min-w-0">
      <div
        className="relative animate-card-in flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-white text-[#1f1a17] shadow transition hover:shadow-lg motion-reduce:animate-none dark:bg-[#fffdf8] dark:text-[#1f1a17]"
        style={{ animationDelay: `${animationDelayMs}ms` }}
      >
        {plant.images?.length > 0 && (
          <div className="relative h-52 w-full overflow-hidden rounded-t-2xl">
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

        <div className="flex flex-1 flex-col px-4 pb-4 pt-3">
          <h2 className="font-heading break-words text-xl font-semibold leading-tight text-[#1f1a17]">
            {plant.name}
          </h2>

          <p className="mt-1 break-words text-xs font-medium uppercase tracking-[0.14em] text-[#7a6a59]">
            {plant.category}
          </p>

          {plant.price > 0 && (
            <p className="mt-2 text-base font-semibold text-[#2f5f4f]">
              ${plant.price}
            </p>
          )}

          <div className="mt-auto pt-3">
            <AddToCartButton plant={plant} variant="icon" />
          </div>
        </div>
      </div>
    </Link>
  );
}