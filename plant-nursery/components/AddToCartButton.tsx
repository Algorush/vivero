"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import type { Plant } from "@/types/plant";
import { getUiCopy } from "@/lib/ui-copy";
import { normalizeSiteLanguage, type SiteLanguage } from "@/lib/site-language";

type AddToCartButtonProps = {
  plant: Plant;
  className?: string;
  variant?: "text" | "icon";
  lang?: SiteLanguage;
};

function CartPlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      <path d="M16 10h4M18 8v4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function AddToCartButton({
  plant,
  className,
  variant = "text",
  lang: rawLang = "es",
}: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const lang = normalizeSiteLanguage(rawLang);
  const copy = getUiCopy(lang);

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    addItem(plant);
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1500);
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={copy.addToCart}
        title={copy.addToCart}
        style={{ backgroundColor: "#fff3e3" }}
        className={
          className ??
          [
            "absolute bottom-2 right-2 z-10 grid h-9 w-9 place-items-center rounded-full",
            "text-[#2f5f4f] shadow-md backdrop-blur transition",
            "hover:scale-105 hover:bg-white",
            justAdded ? "text-green-600" : "",
          ].join(" ")
        }
      >
        {justAdded ? <CheckIcon /> : <CartPlusIcon />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ??
        "mt-2 w-full rounded-xl bg-[#2f5f4f] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#254c40]"
      }
    >
      {justAdded ? (lang === "en" ? "Added ✓" : "Agregado ✓") : copy.addToCart}
    </button>
  );
}
