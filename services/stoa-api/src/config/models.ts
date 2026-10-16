/** Global model catalog (admin enables subset per tenant). */
export const ALLOWED_MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o mini", provider: "openai" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai" },
] as const;

export type ModelCatalogEntry = (typeof ALLOWED_MODELS)[number];

export function isCatalogModel(modelId: string): boolean {
  return ALLOWED_MODELS.some((m) => m.id === modelId);
}
