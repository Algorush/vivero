"use client";

import { useCart } from "@/lib/cart-context";
import type { CartItem } from "@/types/cart";

type CartDrawerProps = {
  whatsappPhone: string;
};

function sanitizePhoneToWa(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function buildOrderMessage(items: CartItem[]): string {
  const lines = items.map(
    (item, index) =>
      `${index + 1}. ${item.name} x${item.quantity}${
        item.price > 0 ? ` - $${item.price * item.quantity}` : ""
      }`
  );
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return [
    "Hola! Me interesan estas plantas:",
    "",
    ...lines,
    "",
    total > 0 ? `Total: $${total}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export default function CartDrawer({ whatsappPhone }: CartDrawerProps) {
  const { items, isOpen, closeCart, removeItem, updateQuantity, clear } =
    useCart();

  if (!isOpen) {
    return null;
  }

  const message = buildOrderMessage(items);
  const waPhone = sanitizePhoneToWa(whatsappPhone);
  const waHref = waPhone
    ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
    : "";
  const mailHref = `mailto:?subject=${encodeURIComponent(
    "Consulta de plantas - Vivero"
  )}&body=${encodeURIComponent(message)}`;

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/40"
      onClick={closeCart}
    >
      <div
        className="flex h-full w-full max-w-sm flex-col bg-[#fffdf8] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#1f1a17]">Tu carrito</h2>
          <button
            type="button"
            onClick={closeCart}
            aria-label="Cerrar carrito"
            className="text-2xl leading-none text-zinc-500"
          >
            &times;
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Todavia no agregaste plantas.
          </p>
        ) : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.slug}
                  className="flex items-center gap-3 rounded-xl border border-[#d8c0a0] p-2"
                >
                  {item.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-14 w-14 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#1f1a17]">
                      {item.name}
                    </p>
                    {item.price > 0 && (
                      <p className="text-xs text-zinc-500">
                        ${item.price} c/u
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(item.slug, item.quantity - 1)
                        }
                        className="h-6 w-6 rounded-full border border-[#d8c0a0] text-sm"
                        aria-label="Restar cantidad"
                      >
                        -
                      </button>
                      <span className="text-sm">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(item.slug, item.quantity + 1)
                        }
                        className="h-6 w-6 rounded-full border border-[#d8c0a0] text-sm"
                        aria-label="Sumar cantidad"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.slug)}
                    aria-label="Quitar del carrito"
                    className="text-sm text-red-600"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2 border-t border-[#d8c0a0] pt-4">
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full rounded-xl bg-[#25D366] px-3 py-2 text-center text-sm font-semibold text-white"
                >
                  Enviar por WhatsApp
                </a>
              )}
              <a
                href={mailHref}
                className="block w-full rounded-xl bg-[#2f5f4f] px-3 py-2 text-center text-sm font-semibold text-white"
              >
                Enviar por Email
              </a>
              <button
                type="button"
                onClick={clear}
                className="block w-full rounded-xl border border-[#d8c0a0] px-3 py-2 text-center text-sm text-zinc-600"
              >
                Vaciar carrito
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
