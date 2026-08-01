/**
 * One selectable Ollama tag within a tier (see `OllamaModelTier`) — `name`
 * is a short display name for a "which model" `<select>`, never translated
 * since it's a proper model name, not UI copy.
 */
export interface OllamaModelChoice {
  tag: string
  name: string
}

/**
 * A tier can offer more than one model to choose between (see
 * `OllamaModelChoice`) — picking the tier itself just narrows a "which
 * model" `<select>`'s own option list; the tier's first model is
 * pre-selected until a different one from it is picked. Shared between
 * `IntegrationsView.tsx`'s own Ollama card (both vision and thinking roles)
 * and `AssistantPanel.tsx`'s per-chat "Local" model picker (thinking only —
 * vision routing has no per-chat override, see that file's own doc comment)
 * so the two never silently drift apart on which models exist, the way they
 * did when Gemma 3 4B was added to one but not the other.
 */
export interface OllamaModelTier {
  labelKey: string
  models: OllamaModelChoice[]
}

/**
 * Curated preset tags for every Ollama vision/thinking model picker in the
 * app — a convenience layer over `OllamaConfig`'s two plain free-text
 * fields, never a hard restriction (every picker also offers a "Custom"
 * escape hatch to any other pulled tag). "Small" is the pre-selected
 * default for both roles, sized to run on a Raspberry Pi (8GB RAM) alongside
 * the Node server and a kiosk display process on the same machine;
 * "Medium"/"Large" are for admins running this on a more powerful, non-Pi
 * server. Ollama only ever keeps one model resident at a time (it swaps per
 * request), so picking a bigger tier for one role never adds to the other
 * role's own RAM cost.
 *
 * Small offers a choice of two models for each role: Qwen2.5(-VL) (this
 * feature's original default) and Gemma 3 4B — a single multimodal model
 * capable of both roles at once, included for both vision and thinking so
 * either role can use it on its own. Gemma 3 4B (Q4, Ollama's own default
 * quantization for the bare `gemma3:4b` tag) is the actual pre-selected
 * default for a fresh install (see `server/store.ts`'s `getOllamaConfig`) —
 * Qwen2.5(-VL) remains available in this same tier as an alternative, not
 * removed, for an admin who already has it pulled or prefers it.
 */
export const OLLAMA_VISION_TIERS: OllamaModelTier[] = [
  {
    labelKey: 'admin.integrations.ollamaTierSmall',
    models: [
      { tag: 'gemma3:4b', name: 'Gemma 3 4B (Q4)' },
      { tag: 'qwen2.5vl:3b', name: 'Qwen2.5-VL 3B' },
    ],
  },
  { labelKey: 'admin.integrations.ollamaTierMedium', models: [{ tag: 'qwen2.5vl:7b', name: 'Qwen2.5-VL 7B' }] },
  { labelKey: 'admin.integrations.ollamaTierLarge', models: [{ tag: 'qwen2.5vl:32b', name: 'Qwen2.5-VL 32B' }] },
]

export const OLLAMA_THINKING_TIERS: OllamaModelTier[] = [
  {
    labelKey: 'admin.integrations.ollamaTierSmall',
    models: [
      { tag: 'gemma3:4b', name: 'Gemma 3 4B (Q4)' },
      { tag: 'qwen2.5:3b-instruct', name: 'Qwen2.5 3B Instruct' },
    ],
  },
  { labelKey: 'admin.integrations.ollamaTierMedium', models: [{ tag: 'qwen2.5:7b-instruct', name: 'Qwen2.5 7B Instruct' }] },
  { labelKey: 'admin.integrations.ollamaTierLarge', models: [{ tag: 'deepseek-r1:32b', name: 'DeepSeek R1 32B' }] },
]

/** Finds which tier (if any) a given tag belongs to — `undefined` means it's not one of the curated presets (the "Custom" case in every picker). */
export function findOllamaTier(tiers: OllamaModelTier[], tag: string): OllamaModelTier | undefined {
  return tiers.find((tier) => tier.models.some((model) => model.tag === tag))
}
