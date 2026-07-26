import Anthropic from '@anthropic-ai/sdk'
import * as store from '../store'
import { AssistantNotConfiguredError, type AssistantJsonSchema } from './types'

/** An image attached to a chat message, ready to hand to Claude as vision input — see the plan's "two independent roles" note (asset storage is handled entirely client-side; this is only the vision-extraction half). */
export interface AssistantImageInput {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  base64Data: string
}

interface ToolCallInput {
  /** Plain instructions — no chat history is ever included, per this feature's own "never trust the model to hold state" design; each call gets exactly the context it needs and nothing more. */
  systemPrompt: string
  userText: string
  image?: AssistantImageInput
  toolName: string
  toolDescription: string
  schema: AssistantJsonSchema
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

  const userContent: Anthropic.Beta.Messages.BetaContentBlockParam[] = []
  if (input.image) {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.base64Data } })
  }
  userContent.push({ type: 'text', text: input.userText })

  // strict tool use (guarantees `input` validates against `schema` exactly)
  // is only exposed on the beta messages endpoint in this SDK version.
  const response = await client.beta.messages.create({
    model: store.getAssistantModel(),
    max_tokens: 1024,
    system: input.systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    tools: [{ name: input.toolName, description: input.toolDescription, input_schema: input.schema, strict: true }],
    tool_choice: { type: 'tool', name: input.toolName },
  })

  const toolUse = response.content.find((block): block is Anthropic.Beta.Messages.BetaToolUseBlock => block.type === 'tool_use')
  if (!toolUse) throw new Error('Claude did not return a tool call')
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
}): Promise<T> {
  const draft = await callTool<T>({
    systemPrompt: input.systemPrompt,
    userText: input.userText,
    image: input.image,
    toolName: input.toolName,
    toolDescription: input.toolDescription,
    schema: input.schema,
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
