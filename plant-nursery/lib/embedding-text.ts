export type PlantEmbeddingSource = {
  name?: string;
  category?: string;
  description?: string;
  flor?: string;
  riego?: string;
  suelo?: string;
  florece?: string;
  exposicion?: string;
  fruta?: string;
  tamano?: string;
  utilizacion?: string;
  propagacion?: string;
  medicinal?: string;
};

function cleanParagraph(value: string | undefined): string {
  return (value ?? "").trim();
}

function section(label: string, value: string | undefined): string | null {
  const cleaned = cleanParagraph(value);
  if (!cleaned) return null;
  return `${label}:\n${cleaned}`;
}

export function buildStructuredEmbeddingText(
  plant: PlantEmbeddingSource
): string {
  const sections = [
    `Nombre: ${cleanParagraph(plant.name)}`,
    `Categoría: ${cleanParagraph(plant.category)}`,
    section("Descripción", plant.description),
    section("Flor", plant.flor),
    section("Riego", plant.riego),
    section("Suelo", plant.suelo),
    section("Florece", plant.florece),
    section("Exposición", plant.exposicion),
    section("Fruta", plant.fruta),
    section("Tamaño", plant.tamano),
    section("Utilización", plant.utilizacion),
    section("Propagación", plant.propagacion),
    section("Medicinal", plant.medicinal),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");

  return `${sections}`.trim();
}

export const MAQUI_EMBEDDING_TEXT = buildStructuredEmbeddingText({
  name: "Maqui",
  category: "Árbol nativo",
  description: "Árbol perenne originario de Chile, valorado por sus frutos y su uso ecológico.",
  flor: "Flor pequeña y melífera, útil para atraer polinizadores.",
  riego: "Riego moderado en etapa juvenil.",
  suelo: "Prefiere suelos bien drenados y con buen contenido orgánico.",
  florece: "Florece a fines de primavera.",
  exposicion: "Tolera sol pleno y semisombra.",
  fruta: "Produce bayas comestibles de color violeta oscuro.",
  tamano: "Puede alcanzar porte medio a alto según las condiciones.",
  utilizacion: "Frutos comestibles, restauración ecológica, jardín nativo.",
  propagacion: "Se propaga por semillas y requiere cuidados en germinación.",
  medicinal: "Uso tradicional asociado a frutos antioxidantes y aplicaciones naturales.",
});