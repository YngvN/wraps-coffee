import Anthropic from '@anthropic-ai/sdk'
import * as store from '../store'
import { AssistantNotConfiguredError } from './types'
import type { ToolCallInput } from './client'

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
export async function anthropicCallTool<T>(input: ToolCallInput): Promise<T> {
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
