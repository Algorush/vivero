"use client";

import { useCart } from "@/lib/cart-context";

export default function CartButton() {
  const { totalCount, openCart } = useCart();

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label="Ver carrito"
      className="fixed bottom-5 left-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#8b4f35] text-white shadow-[0_14px_28px_rgba(10,80,38,0.35)] transition-all duration-300 hover:scale-105 hover:shadow-[0_18px_36px_rgba(10,80,38,0.42)]"
    >
      <svg
        viewBox="0 0 24 24"
        width="26"
        height="26"
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
      </svg>

      {totalCount > 0 && (
        <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-xs font-bold text-white">
          {totalCount}
        </span>
      )}
    </button>
  );
}
