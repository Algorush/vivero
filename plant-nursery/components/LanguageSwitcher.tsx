"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { appendLanguageParam, normalizeSiteLanguage, type SiteLanguage } from "@/lib/site-language";

type LanguageSwitcherProps = {
  variant?: "floating" | "inline";
};

const languageLabels: Record<SiteLanguage, { short: string; full: string }> = {
  es: { short: "ES", full: "Español" },
  en: { short: "EN", full: "English" },
};

export default function LanguageSwitcher({ variant = "floating" }: LanguageSwitcherProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLang = normalizeSiteLanguage(searchParams.get("lang"));
  const nextLang: SiteLanguage = currentLang === "en" ? "es" : "en";

  const currentQuery = searchParams.toString();
  const currentHref = currentQuery ? `${pathname}?${currentQuery}` : pathname;
  const switchHref = appendLanguageParam(currentHref, nextLang);

  if (variant === "inline") {
    return (
      <div className="inline-flex rounded-full border border-[#d8c0a0] bg-[#fffdf8] p-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#1f1a17] shadow-sm">
        <Link
          href={appendLanguageParam(currentHref, "es")}
          className={[
            "rounded-full px-3 py-2 transition",
            currentLang === "es" ? "bg-[#2f5f4f] text-white" : "text-[#1f1a17] hover:bg-[#f3eadb]",
          ].join(" ")}
          aria-label="Cambiar a español"
          title={languageLabels.es.full}
        >
          {languageLabels.es.short}
        </Link>
        <Link
          href={switchHref}
          className={[
            "rounded-full px-3 py-2 transition",
            currentLang === "en" ? "bg-[#2f5f4f] text-white" : "text-[#1f1a17] hover:bg-[#f3eadb]",
          ].join(" ")}
          aria-label="Switch to English"
          title={languageLabels.en.full}
        >
          {languageLabels.en.short}
        </Link>
      </div>
    );
  }

  return (
    <div className="fixed top-4 left-4 z-50 hidden rounded-full border border-white/20 bg-[#1f1a17]/70 p-1 text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-md md:flex">
      <Link
        href={appendLanguageParam(currentHref, "es")}
        className={[
          "rounded-full px-3 py-2 transition",
          currentLang === "es" ? "bg-white text-[#1f1a17]" : "text-white/80 hover:text-white",
        ].join(" ")}
        aria-label="Cambiar a español"
        title={languageLabels.es.full}
      >
        {languageLabels.es.short}
      </Link>
      <Link
        href={switchHref}
        className={[
          "rounded-full px-3 py-2 transition",
          currentLang === "en" ? "bg-white text-[#1f1a17]" : "text-white/80 hover:text-white",
        ].join(" ")}
        aria-label="Switch to English"
        title={languageLabels.en.full}
      >
        {languageLabels.en.short}
      </Link>
    </div>
  );
}
