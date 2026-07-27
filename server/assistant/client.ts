import Anthropic from '@anthropic-ai/sdk'
import * as store from '../store'
import { AssistantNotConfiguredError, type AssistantJsonSchema } from './types'

/** An image attached to a chat message, ready to hand to Claude as vision input — see the plan's "two independent roles" note (asset storage is handled entirely client-side; this is only the vision-extraction half). */
export interface AssistantImageInput {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  base64Data: string
}

/**
 * One real Claude API call's own record, for the assistant's "thought
 * process" trace shown in the chat UI (see `AssistantThoughtTrace`) — never
 * used for anything functional, purely observability/troubleshooting.
 * `input`/`output` are JSON summaries already truncated at construction time
 * (see `callTool` below) so neither live memory nor the per-device
 * conversation log that eventually persists these can bloat unboundedly.
 */
export interface AssistantTraceEntry {
  toolName: string
  /** Only set for a `generateThenVerify` call — which of its two passes this entry represents. */
  pass?: 'draft' | 'verify'
  durationMs: number
  input: string
  output: string
  usage?: { inputTokens: number; outputTokens: number; estimatedCostUsd?: number }
}

/**
 * Rough $/1M-token rates, used only to show an approximate cost estimate in
 * the trace above — never for any real billing/limit decision. **Placeholder
 * values** — verify against Anthropic's own currently-published per-model
 * pricing before trusting these, and revisit periodically, since pricing
 * drifts over time and this table won't update itself.
 */
const ASSISTANT_MODEL_PRICING: Record<store.AssistantModel, { inputPerMillion: number; outputPerMillion: number }> = {
  'claude-haiku-4-5': { inputPerMillion: 1, outputPerMillion: 5 },
  'claude-sonnet-4-5': { inputPerMillion: 3, outputPerMillion: 15 },
  'claude-opus-4-5': { inputPerMillion: 15, outputPerMillion: 75 },
}

function estimateCostUsd(model: store.AssistantModel, inputTokens: number, outputTokens: number): number {
  const pricing = ASSISTANT_MODEL_PRICING[model]
  return (inputTokens / 1_000_000) * pricing.inputPerMillion + (outputTokens / 1_000_000) * pricing.outputPerMillion
}

interface ToolCallInput {
  /** Plain instructions — no chat history is ever included, per this feature's own "never trust the model to hold state" design; each call gets exactly the context it needs and nothing more. */
  systemPrompt: string
  userText: string
  image?: AssistantImageInput
  toolName: string
  toolDescription: string
  schema: AssistantJsonSchema
  /** Per-chat override of which Claude model answers this one call — see `AssistantPanel`'s model-picker menu. Never persisted; falls back to `store.getAssistantModel()` (the shared, admin-configured default) when omitted. */
  model?: store.AssistantModel
  /** When provided, this call's own timing/input/output/token-usage is pushed onto it — see `AssistantTraceEntry`. Omitted entirely for calls with nothing to attach a trace to (e.g. `generateTitle`, which has no visible "thinking" UI). */
  trace?: AssistantTraceEntry[]
  /** Only meaningful alongside `trace` — tags which `generateThenVerify` pass this call is, so the UI can label them. Never set for a `callToolOnce` call. */
  pass?: 'draft' | 'verify'
}

function buildClient(): Anthropic {
  const apiKey = store.getAnthropicApiKey()
  if (!apiKey) throw new AssistantNotConfiguredError()
  return new Anthropic({ apiKey })
}

/**
 * A single forced tool call: the model must call `toolName` and its `input`
 * is guaranteed to validate against `schema` (`strict: true`) — never a
 * free-text response to parse. Vision is opt-in per call via `image`, so a
 * step that doesn't carry an attached image never pays for/risks a vision
 * misread.
 */
async function callTool<T>(input: ToolCallInput): Promise<T> {
  const client = buildClient()
  const model = input.model ?? store.getAssistantModel()

  const userContent: Anthropic.Beta.Messages.BetaContentBlockParam[] = []
  if (input.image) {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.base64Data } })
  }
  userContent.push({ type: 'text', text: input.userText })

  const startedAt = Date.now()
  // strict tool use (guarantees `input` validates against `schema` exactly)
  // is only exposed on the beta messages endpoint in this SDK version.
  const response = await client.beta.messages.create({
    model,
    max_tokens: 1024,
    system: input.systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    tools: [{ name: input.toolName, description: input.toolDescription, input_schema: input.schema, strict: true }],
    tool_choice: { type: 'tool', name: input.toolName },
  })
  const durationMs = Date.now() - startedAt

  const toolUse = response.content.find((block): block is Anthropic.Beta.Messages.BetaToolUseBlock => block.type === 'tool_use')
  if (!toolUse) throw new Error('Claude did not return a tool call')

  if (input.trace) {
    const usage = response.usage
      ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens, estimatedCostUsd: estimateCostUsd(model, response.usage.input_tokens, response.usage.output_tokens) }
      : undefined
    input.trace.push({
      toolName: input.toolName,
      pass: input.pass,
      durationMs,
      input: JSON.stringify({ userText: input.userText }).slice(0, 500),
      output: JSON.stringify(toolUse.input).slice(0, 500),
      usage,
    })
  }

  return toolUse.input as T
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
