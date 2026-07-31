export type SiteLanguage = "es" | "en";

export function normalizeSiteLanguage(value?: string | null): SiteLanguage {
  return value?.toLowerCase() === "en" ? "en" : "es";
}

export function localizedValue(
  lang: SiteLanguage,
  spanish: string,
  english?: string | null
): string {
  const primary = spanish.trim();
  const fallback = english?.trim() ?? "";

  if (lang === "en") {
    return fallback || primary;
  }

  return primary || fallback;
}

export function appendLanguageParam(href: string, lang: SiteLanguage): string {
  if (!href) {
    return href;
  }

  try {
    const url = new URL(href, "https://placeholder.local");
    url.searchParams.set("lang", lang);
    return href.startsWith("/") ? `${url.pathname}${url.search}` : url.toString();
  } catch {
    return href;
  }
}