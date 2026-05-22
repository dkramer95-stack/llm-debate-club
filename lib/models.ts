export type Provider = "anthropic" | "groq";

export type ModelId =
  | "claude-opus-4-7"
  | "claude-sonnet-4-6"
  | "llama-3.3-70b-versatile"
  | "llama-3.1-8b-instant";

export type ModelSpec = {
  id: ModelId;
  label: string;
  provider: Provider;
};

export const MODELS: ModelSpec[] = [
  { id: "claude-opus-4-7", label: "Claude Opus 4.7", provider: "anthropic" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic" },
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq)", provider: "groq" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant (Groq)", provider: "groq" },
];

export function getModel(id: string): ModelSpec {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model: ${id}`);
  return m;
}

export function labelFor(id: string): string {
  return MODELS.find((m) => m.id === id)?.label ?? id;
}
