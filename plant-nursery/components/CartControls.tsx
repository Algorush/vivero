"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import CartButton from "@/components/CartButton";
import CartDrawer from "@/components/CartDrawer";
import { normalizeSiteLanguage } from "@/lib/site-language";

type CartControlsProps = {
  whatsappPhone: string;
};

function CartControlsInner({ whatsappPhone }: CartControlsProps) {
  const searchParams = useSearchParams();
  const lang = normalizeSiteLanguage(searchParams.get("lang"));

  return (
    <>
      <CartButton lang={lang} />
      <CartDrawer whatsappPhone={whatsappPhone} lang={lang} />
    </>
  );
}

export default function CartControls({ whatsappPhone }: CartControlsProps) {
  return (
    <Suspense fallback={null}>
      <CartControlsInner whatsappPhone={whatsappPhone} />
    </Suspense>
  );
}