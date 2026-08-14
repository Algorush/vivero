import Link from "next/link";
import ImageCarousel from "@/components/ImageCarousel";
import AddToCartButton from "@/components/AddToCartButton";
import { Plant } from "@/types/plant";
import { appendLanguageParam, normalizeSiteLanguage, type SiteLanguage } from "@/lib/site-language";
import { getCategoryLabel } from "@/lib/ui-copy";

type PlantCardProps = {
  plant: Plant;
  priority?: boolean;
  animationDelayMs?: number;
  lang?: SiteLanguage;
  catalogSearchParams?: string;
  size?: "large" | "compact";
};

export default function PlantCard({
  plant,
  priority = false,
  animationDelayMs = 0,
  lang: rawLang = "es",
  catalogSearchParams = "",
  size = "large",
}: PlantCardProps) {
  const lang = normalizeSiteLanguage(rawLang);
  const detailHref = appendLanguageParam(
    catalogSearchParams ? `/plants/${plant.slug}?${catalogSearchParams}` : `/plants/${plant.slug}`,
    lang
  );
  return (
    <Link href={detailHref} className="block h-full min-w-0">
      <div
        className="relative animate-card-in flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-white text-[#1f1a17] shadow transition hover:shadow-lg motion-reduce:animate-none dark:bg-[#fffdf8] dark:text-[#1f1a17]"
        style={{ animationDelay: `${animationDelayMs}ms` }}
      >
        {plant.images?.length > 0 && (
          <div className={size === "compact" ? "relative h-40 w-full overflow-hidden rounded-t-2xl" : "relative h-70 w-full overflow-hidden rounded-t-2xl"}>
            <ImageCarousel
              images={plant.images}
              alt={plant.name}
              fill
              priority={priority}
              quality={85}
              sizes={size === "compact" ? "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"}
            />
          </div>
        )}

        <div className={size === "compact" ? "flex flex-1 flex-col px-3 pb-3 pt-2" : "flex flex-1 flex-col px-4 pb-3 pt-2"}>
          <h2 className={size === "compact" ? "font-heading break-words text-sm font-semibold leading-tight text-[#1f1a17]" : "font-heading break-words text-xl font-semibold leading-tight text-[#1f1a17]"}>
            {plant.name}
          </h2>

          <p className={size === "compact" ? "mt-1 break-words text-[10px] font-medium uppercase tracking-[0.14em] text-[#7a6a59]" : "mt-1 break-words text-xs font-medium uppercase tracking-[0.14em] text-[#7a6a59]"}>
            {getCategoryLabel(lang, plant.category)}
          </p>

          {plant.price > 0 && (
            <p className={size === "compact" ? "mt-2 text-sm font-semibold text-[#2f5f4f]" : "mt-2 text-base font-semibold text-[#2f5f4f]"}>
              ${plant.price}
            </p>
          )}

          <div className="mt-auto pt-3">
            <AddToCartButton plant={plant} variant="icon" lang={lang} />
          </div>
        </div>
      </div>
    </Link>
  );
}