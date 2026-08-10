import type { SiteLanguage } from "@/lib/site-language";

function normalizeCategory(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const categoryLabels = {
  es: {
    arbol: "Arbol",
    arbusto: "Arbusto",
    conifera: "Conifera",
    cubresuelo: "Cubresuelo",
    flor: "Flor",
    herbacea: "Herbacea",
    trepadora: "Trepadora",
  },
  en: {
    arbol: "Tree",
    arbusto: "Shrub",
    conifera: "Conifer",
    cubresuelo: "Ground cover",
    flor: "Flower",
    herbacea: "Herbaceous",
    trepadora: "Climber",
  },
} as const;

export const uiCopy = {
  es: {
    backToCatalog: "Volver al catalogo",
    category: "Categoría",
    price: "Precio",
    characteristics: "Caracteristicas",
    addToCart: "Agregar al carrito",
    askAboutPlant: "Pedir consulta por esta planta",
    phone: "Telefono",
    location: "Ubicacion",
    catalogSearchAria: "Buscar plantas",
    catalogSearchButton: "Buscar",
    catalogSearchPlaceholder:
      "Búsqueda inteligente: plantas para sombra, poca agua y jardín nativo...",
    nativas: "🌿 Nativas",
    exoticas: "🌺 Exóticas",
    allCategories: "Todas las categorias",
    aboutTitle: "Sobre el vivero",
    aboutBodyFallback: "No hay contenido disponible en la sección Sobre Nosotros de Notion.",
    aboutButton: "Ver catálogo",
    catalogBack: "← Volver al catalogo",
    cartTitle: "Tu carrito",
    cartClose: "Cerrar carrito",
    cartEmpty: "Todavia no agregaste plantas.",
    cartRemove: "Quitar",
    cartDecrease: "Restar cantidad",
    cartIncrease: "Sumar cantidad",
    cartSendWhatsapp: "Enviar por WhatsApp",
    cartSendEmail: "Enviar por Email",
    cartClear: "Vaciar carrito",
    cartUnit: "c/u",
    cartTotal: "Total",
    aboutNursery: "Sobre el vivero",
    viewCatalog: "Ver catálogo",
    whatsapp: "Escribir por WhatsApp",
    directions: "Ver direccion en mapa",
    languageEn: "English",
    languageEs: "Español",
  },
  en: {
    backToCatalog: "Back to catalog",
    category: "Category",
    price: "Price",
    characteristics: "Characteristics",
    addToCart: "Add to cart",
    askAboutPlant: "Ask about this plant",
    phone: "Phone",
    location: "Location",
    catalogSearchAria: "Search plants",
    catalogSearchButton: "Search",
    catalogSearchPlaceholder:
      "Smart search: shade plants, low-water plants, and native garden plants...",
    nativas: "Native",
    exoticas: "Exotic",
    allCategories: "All categories",
    aboutTitle: "About the nursery",
    aboutBodyFallback: "No content is available in the About Us section of Notion.",
    aboutButton: "View catalog",
    catalogBack: "← Back to catalog",
    cartTitle: "Your cart",
    cartClose: "Close cart",
    cartEmpty: "You have not added any plants yet.",
    cartRemove: "Remove",
    cartDecrease: "Decrease quantity",
    cartIncrease: "Increase quantity",
    cartSendWhatsapp: "Send via WhatsApp",
    cartSendEmail: "Send by email",
    cartClear: "Clear cart",
    cartUnit: "each",
    cartTotal: "Total",
    aboutNursery: "About the nursery",
    viewCatalog: "View catalog",
    whatsapp: "Contact via WhatsApp",
    directions: "View directions on map",
    languageEn: "English",
    languageEs: "Español",
  },
} satisfies Record<SiteLanguage, Record<string, string>>;

export type UiCopy = typeof uiCopy.es;

export function getUiCopy(lang: SiteLanguage): UiCopy {
  return uiCopy[lang];
}

export function getCategoryLabel(lang: SiteLanguage, category: string): string {
  const normalized = normalizeCategory(category);
  const labels = categoryLabels[lang];

  return labels[normalized as keyof typeof labels] ?? category;
}
