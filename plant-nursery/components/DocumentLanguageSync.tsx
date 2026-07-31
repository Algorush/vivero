"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { normalizeSiteLanguage } from "@/lib/site-language";

export default function DocumentLanguageSync() {
  const searchParams = useSearchParams();
  const lang = normalizeSiteLanguage(searchParams.get("lang"));

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}