"use client";

import Image from "next/image";
import { useState } from "react";

type ImageCarouselProps = {
  images: string[];
  alt: string;
  priority?: boolean;
  quality?: number;
  sizes?: string;
} & (
  | { fill: true; className?: string }
  | { natural: true; className?: string }
  | { fill?: false; natural?: false; width: number; height: number; className?: string }
);

export default function ImageCarousel({
  images,
  alt,
  priority = false,
  quality,
  sizes,
  ...rest
}: ImageCarouselProps) {
  const [index, setIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const validImages = images.length > 0 ? images : [];
  const count = validImages.length;

  if (count === 0) return null;

  const current = validImages[index];

  const prev = () => setIndex((i) => (i - 1 + count) % count);
  const next = () => setIndex((i) => (i + 1) % count);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(delta) > 40) {
      if (delta < 0) {
        next();
      } else {
        prev();
      }
    }
    setTouchStartX(null);
  };

  const isFill = "fill" in rest && rest.fill === true;
  const isNatural = "natural" in rest && rest.natural === true;
  const resolvedQuality = quality ?? (isFill ? 80 : 95);
  const resolvedSizes =
    sizes ??
    (isFill
      ? "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      : "100vw");
  const extraClass = (rest as { className?: string }).className ?? "";

  return (
    <div
      className={`relative select-none ${isFill ? "w-full h-full" : "w-full"}`}
      style={{ touchAction: "pan-y" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {isFill ? (
        <Image
          key={current}
          src={current}
          alt={alt}
          fill
          className={`object-cover ${extraClass}`}
          priority={priority}
          quality={resolvedQuality}
          sizes={resolvedSizes}
        />
      ) : isNatural ? (
        <Image
          key={current}
          src={current}
          alt={alt}
          width={1600}
          height={1600}
          className={`w-full h-auto rounded-xl ${extraClass}`}
          style={{ width: "100%", height: "auto" }}
          priority={priority}
          quality={resolvedQuality}
          sizes={resolvedSizes}
        />
      ) : (
        <Image
          key={current}
          src={current}
          alt={alt}
          width={(rest as { width: number; height: number }).width}
          height={(rest as { width: number; height: number }).height}
          className={`w-full h-auto ${extraClass}`}
          priority={priority}
          quality={resolvedQuality}
          sizes={resolvedSizes}
        />
      )}

      {count > 1 && (
        <>
          {/* Arrow buttons */}
          <button
            onClick={(e) => { e.preventDefault(); prev(); }}
            className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm z-10 hover:bg-black/60"
            aria-label="Foto anterior"
          >
            ‹
          </button>
          <button
            onClick={(e) => { e.preventDefault(); next(); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm z-10 hover:bg-black/60"
            aria-label="Siguiente foto"
          >
            ›
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {validImages.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.preventDefault(); setIndex(i); }}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? "bg-white" : "bg-white/50"}`}
                aria-label={`Foto ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
