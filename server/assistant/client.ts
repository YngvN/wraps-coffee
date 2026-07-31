import * as store from '../store'
import { anthropicCallTool } from './anthropicClient'
import { ollamaCallTool } from './ollamaClient'
import type { AssistantJsonSchema } from './types'

/** An image attached to a chat message, ready to hand to the active provider as vision input — see the plan's "two independent roles" note (asset storage is handled entirely client-side; this is only the vision-extraction half). Claude gets it as an image content block; Ollama gets it via `/api/chat`'s own `images` field — see `anthropicClient.ts`/`ollamaClient.ts`. */
export interface AssistantImageInput {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  base64Data: string
}

/**
 * One real LLM call's own record, for the assistant's "thought process"
 * trace shown in the chat UI (see `AssistantThoughtTrace`) — never used for
 * anything functional, purely observability/troubleshooting. `input`/`output`
 * are JSON summaries already truncated at construction time (see
 * `anthropicClient.ts`/`ollamaClient.ts`) so neither live memory nor the
 * per-device conversation log that eventually persists these can bloat
 * unboundedly. `usage.estimatedCostUsd` is only ever set on the Claude path —
 * a local Ollama call has no per-token price.
 */
export interface AssistantTraceEntry {
  toolName: string
  /** Only set for a `generateThenVerify` call — which of its two passes this entry represents. */
  pass?: 'draft' | 'verify'
  durationMs: number
  input: string
  output: string
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd?: number }
  /**
   * The literal model that actually answered this one call — a Claude model
   * id (e.g. `"claude-sonnet-4-5"`) or an Ollama tag (e.g.
   * `"qwen2.5:7b-instruct"`), read directly from the real request each entry
   * came from (see `anthropicClient.ts`/`ollamaClient.ts`), never from a
   * separately-fetched config/settings value that could be stale or wrong.
   * The one ground-truth way to confirm which model actually handled a given
   * step — a global "Model: ..." header/subtitle only ever reflects
   * client-side config state, not the real per-call request.
   */
  model?: string
}

export interface ToolCallInput {
  /**
   * Plain instructions for one single-message call — this file itself still
   * never builds a multi-turn `messages` array (see `callTool` below: always
   * exactly one `{role:'user'}` entry, every call). A caller *can* bake an
   * already-resolved slice of prior conversation directly into this string
   * as plain text (see `steps.ts`'s `resolveHistoryContext`/the "compute
   * once per turn" plan) — this file has no opinion on that; it's just more
   * prompt text, never a second message.
   */
  systemPrompt: string
  userText: string
  image?: AssistantImageInput
  toolName: string
  toolDescription: string
  schema: AssistantJsonSchema
  /** Per-chat override of which Claude model answers this one call — see `AssistantPanel`'s model-picker menu. Never persisted; falls back to `store.getAssistantModel()` (the shared, admin-configured default) when omitted. Ignored on the Ollama path, which routes by call shape instead — see `ollamaClient.ts`. */
  model?: store.AssistantModel
  /** Per-device override of which *provider* answers this one call — same kebab-menu, never-persisted posture as `model` above, but independently selectable (picking "Local (Ollama)" there sets this without touching `model`, and vice versa). Falls back to `store.getAssistantProvider()` (the shared, admin-configured default) when omitted. */
  provider?: store.AssistantProvider
  /** When provided, this call's own timing/input/output/token-usage is pushed onto it — see `AssistantTraceEntry`. Omitted entirely for calls with nothing to attach a trace to (e.g. `generateTitle`, which has no visible "thinking" UI). */
  trace?: AssistantTraceEntry[]
  /** Only meaningful alongside `trace` — tags which `generateThenVerify` pass this call is, so the UI can label them. Never set for a `callToolOnce` call. */
  pass?: 'draft' | 'verify'
}

/**
 * Dispatches to whichever provider is actually active for this call —
 * `input.provider` (a per-device kebab-menu override, see `ToolCallInput`)
 * if set, otherwise `server/store.ts`'s `getAssistantProvider()` (the
 * shared, admin-configured default) — to `anthropicClient.ts`'s
 * `anthropicCallTool` for `'claude'`, `ollamaClient.ts`'s `ollamaCallTool`
 * for `'local'`. Both implementations guarantee the same contract:
 * `toolName`'s `input` is returned already validated against `schema` —
 * never a free-text response to parse (Claude via native `strict` forced
 * tool-use; Ollama via the parse/repair/retry pipeline described in the plan
 * behind this feature). Vision is opt-in per call via `image`, so a step
 * that doesn't carry an attached image never pays for/risks a vision
 * misread on either provider.
 */
function callTool<T>(input: ToolCallInput): Promise<T> {
  const provider = input.provider ?? store.getAssistantProvider()
  return provider === 'claude' ? anthropicCallTool<T>(input) : ollamaCallTool<T>(input)
}

/**
 * The accuracy lever this feature is built around (see the plan's "accuracy
 * over speed" note): a first pass proposes an answer from `userText` alone,
 * then a second pass — same tool/schema — is additionally shown its own
 * first answer plus `verifyContext` (fuller ground truth: the full candidate
 * record for `selectItem`, or nothing extra for a first `fillFields` pass)
 * and corrects or confirms it. Only the second pass's output is ever used.
 */
export async function generateThenVerify<T>(input: {
  systemPrompt: string
  userText: string
  image?: AssistantImageInput
  toolName: string
  toolDescription: string
  schema: AssistantJsonSchema
  /** Extra grounding shown only on the verify pass — e.g. the chosen candidate's full current record. */
  verifyContext?: string
  /** See `ToolCallInput.model` — applied to both the draft and verify pass. */
  model?: store.AssistantModel
  /** See `ToolCallInput.provider` — applied to both the draft and verify pass. */
  provider?: store.AssistantProvider
  /** See `ToolCallInput.trace` — both the draft and verify pass push their own entry onto it, tagged `pass: 'draft'`/`'verify'` respectively. */
  trace?: AssistantTraceEntry[]
}): Promise<T> {
  const draft = await callTool<T>({
    systemPrompt: input.systemPrompt,
    userText: input.userText,
    image: input.image,
    toolName: input.toolName,
    toolDescription: input.toolDescription,
    schema: input.schema,
    model: input.model,
    provider: input.provider,
    trace: input.trace,
    pass: 'draft',
  })

  const verifyText = [
    input.userText,
    '',
    `Here is what you proposed on the first pass: ${JSON.stringify(draft)}`,
    input.verifyContext ? `\nAdditional context to check your answer against:\n${input.verifyContext}` : '',
    '\nDouble-check your proposal against the message above and the additional context (if any). If anything is wrong, missing, or was misread, call the tool again with the corrected answer. If it already holds up, call the tool again with the same answer unchanged.',
  ]
    .filter(Boolean)
    .join('\n')

  return callTool<T>({
    systemPrompt: input.systemPrompt,
    userText: verifyText,
    image: input.image,
    toolName: input.toolName,
    toolDescription: input.toolDescription,
    schema: input.schema,
    model: input.model,
    provider: input.provider,
    trace: input.trace,
    pass: 'verify',
  })
}

/** Single-pass tool call — used only by `selectIntent`, which stays single-pass per the plan (a coarse, low-ambiguity choice that confirm-before-write already backstops). */
export async function callToolOnce<T>(input: ToolCallInput): Promise<T> {
  return callTool<T>(input)
}

/** The fixed language-handling instruction every system prompt gets appended, per the plan's "language is told to the model, never guessed by it" rule — `uiLanguage` always comes from the admin's own `useLanguage()` locale, never inferred from the message text. */
export function languageInstruction(uiLanguage: 'no' | 'en'): string {
  const languageName = uiLanguage === 'no' ? 'Norwegian (bokmål)' : 'English'
  return `The admin's interface language is set to ${uiLanguage} (${languageName}). Treat their message as written in ${languageName} — do not guess a different language (in particular, do not confuse Norwegian for Danish, a similar but different language). When filling a bilingual field, only ever fill the "${uiLanguage}" side from the admin's own words; leave the other language's field unset unless the admin explicitly also supplied text for that other language. Never invent a translation yourself.`
}

/**
 * The fixed "what day is it really" instruction every system prompt that
 * could touch a date/time gets appended — same "told to the model, never
 * guessed by it" rule as `languageInstruction`. Without this, the model has
 * no anchor for a relative date/time question ("before today", "upcoming",
 * "this week", "next Friday") and either falls back to its own training
 * cutoff or, combined with an instruction to exclude anything it's not
 * confident about, silently excludes every record rather than admit it
 * doesn't know what "today" is — this was exactly why "how many events have
 * already happened before today" wrongly came back "none", even though
 * every event's own real `date` field was right there in the data.
 */
export function currentDateInstruction(): string {
  return `Today's real-world date is ${todayIsoDate()} (yyyy-mm-dd) — use this as ground truth for any relative date/time reasoning ("today", "this week", "upcoming", "past", "before/after now", "next Friday"), computed against each record's own real date field. Never guess a different current date or fall back on your own training cutoff.`
}

/** The server's own idea of "today", shared by `currentDateInstruction` above and any entity adapter that needs to pre-compute a date-relative fact itself (e.g. `event.ts`'s own `hasOccurred`) rather than leaving date arithmetic to the model — real testing showed even a straightforward date comparison isn't reliably consistent when left to a weaker model across repeated calls. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}
