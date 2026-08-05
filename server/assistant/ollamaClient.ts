import { spawn } from 'node:child_process'
import * as store from '../store'
import { AssistantLocalProviderError, AssistantNotConfiguredError, type AssistantJsonSchema } from './types'
import type { ToolCallInput } from './client'

/**
 * Which Ollama model a call uses. The vision-vs-thinking split is
 * deterministic by call shape (see the plan's "two independent roles" note) —
 * Ollama only keeps one model resident at a time anyway, so there's no
 * simultaneous-RAM cost to this split. `thinkingOverride`/`visionOverride`
 * (see `ToolCallInput.localModel`/`localVisionModel`) let one device's chat
 * pin a specific tag for whichever role a given call actually uses; only one
 * of the two is ever consulted per call, since a single call is never both.
 */
function resolveOllamaModel(hasImage: boolean, config: store.OllamaConfig, thinkingOverride: string | undefined, visionOverride: string | undefined): string {
  if (hasImage) return visionOverride || config.visionModel
  return thinkingOverride || config.thinkingModel
}

/** Ollama's `/api/chat` `format` field accepts a plain JSON Schema object for grammar-constrained decoding — this schema shape is already close to that (see `AssistantJsonSchema`'s own doc comment), the index signature is only for the Anthropic SDK's benefit, so passing it straight through is fine. */
function toOllamaFormat(schema: AssistantJsonSchema): Record<string, unknown> {
  return { type: schema.type, properties: schema.properties, required: schema.required, additionalProperties: schema.additionalProperties }
}

/** A defensive safety net against a reasoning model (e.g. `deepseek-r1`) still emitting a `<think>...</think>` preamble even with `think: false` requested (older Ollama versions / models that ignore the flag) — regardless of that flag, this always runs before parsing. */
function stripThinkTags(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

/** Extracts the first balanced `{...}` substring from `text` via a brace-matching scan — safer than a naive regex against a nested object — used when a local model wraps its JSON reply in prose despite being told not to. */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

/** Parses `rawContent` against `schema`, trying the raw (think-stripped) text first and then just its first balanced `{...}` substring — returns `null` (never throws) so the caller can decide whether to retry. A shallow presence check of every `required` key stands in for real schema validation (no `ajv`/`zod` dependency needed for this narrow a schema shape — see `AssistantJsonSchema`). */
function parseStructuredReply<T>(rawContent: string, schema: AssistantJsonSchema): T | null {
  const content = stripThinkTags(rawContent)
  const candidates = [content, extractFirstJsonObject(content)].filter((candidate): candidate is string => Boolean(candidate))
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      if (schema.required.every((key) => key in parsed)) return parsed as T
    } catch {
      // Not valid JSON — fall through to the next candidate (or the caller's own retry).
    }
  }
  return null
}

/** Embedded in the prompt alongside `format`, redundantly — Ollama's grammar-constrained decoding isn't equally reliable across every local model/schema shape, so this is a second, independent nudge toward the same goal (see the plan's "structured JSON output from small local models" section). */
function schemaInstructionBlock(toolDescription: string, schema: AssistantJsonSchema): string {
  return [toolDescription, 'Respond with ONLY a single JSON object matching this schema — no prose, no markdown code fences, no explanation before or after it:', JSON.stringify(schema)].join('\n')
}

interface OllamaChatResponse {
  message: { role: string; content: string }
  /** Ollama's own token-count fields — shown in the trace UI purely for observability, never for a cost estimate (a local model has no per-token price, unlike `AssistantTraceEntry.usage.estimatedCostUsd` on the Claude path). */
  prompt_eval_count?: number
  eval_count?: number
}

/** Composes the caller's own external abort (see `ToolCallInput.signal` — a client disconnect propagated from `server/index.ts`) with this call's fixed safety timeout, rather than one replacing the other — losing the timeout would leave a genuinely stuck request with nothing to ever cancel it. */
function ollamaRequestSignal(externalSignal: AbortSignal | undefined): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(120_000)
  return externalSignal ? AbortSignal.any([externalSignal, timeoutSignal]) : timeoutSignal
}

async function ollamaChat(
  config: store.OllamaConfig,
  model: string,
  systemPrompt: string,
  userText: string,
  image: ToolCallInput['image'],
  schema: AssistantJsonSchema,
  externalSignal: AbortSignal | undefined,
): Promise<OllamaChatResponse> {
  const userMessage: Record<string, unknown> = { role: 'user', content: userText }
  if (image) userMessage.images = [image.base64Data]

  const response = await fetch(`${config.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, userMessage],
      format: toOllamaFormat(schema),
      stream: false,
      // Kept off by default to favor latency on Pi-class hardware for what are mostly classification/extraction calls — revisit once real timing data exists (see `ASSISTANT_MODEL_CAPABILITIES`'s own "revisit once measured" note in steps.ts).
      think: false,
      options: { temperature: 0 },
    }),
    // Pi CPU inference has no GPU acceleration and can be slow, especially on a cold-loaded model.
    signal: ollamaRequestSignal(externalSignal),
  })
  if (!response.ok) throw new AssistantNotConfiguredError(`Ollama request failed (${response.status}) — check the host and model names on the Integrations page.`)
  return (await response.json()) as OllamaChatResponse
}

/**
 * The Ollama half of `client.ts`'s provider dispatch — same responsibilities
 * as `anthropicClient.ts`'s `anthropicCallTool`, but with weaker structured-
 * output guarantees to work around (see the plan). Retries the whole call
 * once, with an amended prompt, before giving up — bounded to two attempts
 * total to keep latency reasonable on Pi hardware.
 */
export async function ollamaCallTool<T>(input: ToolCallInput): Promise<T> {
  const config = store.getOllamaConfig()
  const model = resolveOllamaModel(Boolean(input.image), config, input.localModel, input.localVisionModel)
  if (!config.baseUrl || !model) throw new AssistantNotConfiguredError("The Ollama host/models haven't been configured yet — check the Integrations page.")

  const systemPrompt = [input.systemPrompt, schemaInstructionBlock(input.toolDescription, input.schema)].join('\n\n')

  const startedAt = Date.now()
  let response: OllamaChatResponse
  let parsed: T | null
  try {
    response = await ollamaChat(config, model, systemPrompt, input.userText, input.image, input.schema, input.signal)
    parsed = parseStructuredReply<T>(response.message.content, input.schema)

    if (!parsed) {
      const retrySystemPrompt = `${systemPrompt}\n\nYour previous reply was not valid JSON — reply with ONLY the JSON object this time.`
      response = await ollamaChat(config, model, retrySystemPrompt, input.userText, input.image, input.schema, input.signal)
      parsed = parseStructuredReply<T>(response.message.content, input.schema)
    }
  } catch (error) {
    // Client disconnected (see `server/index.ts`'s per-route `AbortController`) before this call
    // finished — record it as an abort, distinguishable from a genuine failure, then let the
    // rejection propagate as normal (the route handler already skips responding once aborted).
    if (input.trace && input.signal?.aborted) {
      input.trace.push({ toolName: input.toolName, pass: input.pass, durationMs: Date.now() - startedAt, input: JSON.stringify({ userText: input.userText }).slice(0, 500), output: '', model, aborted: true })
    }
    throw error
  }
  const durationMs = Date.now() - startedAt

  if (!parsed) throw new AssistantLocalProviderError(input.toolName)

  if (input.trace) {
    const usage = response.prompt_eval_count !== undefined && response.eval_count !== undefined ? { inputTokens: response.prompt_eval_count, outputTokens: response.eval_count } : undefined
    input.trace.push({
      toolName: input.toolName,
      pass: input.pass,
      durationMs,
      input: JSON.stringify({ userText: input.userText }).slice(0, 500),
      output: JSON.stringify(parsed).slice(0, 500),
      usage,
      model,
    })
  }

  return parsed
}

export interface OllamaConnectionTestResult {
  ok: boolean
  error?: string
  installedModels?: string[]
  visionModelInstalled?: boolean
  thinkingModelInstalled?: boolean
}

/** Hits `/api/tags` to confirm the host is reachable and report which of the two configured tags are actually pulled — backs the Integrations page's "Test connection" button and decides whether it shows a "Download missing model" button. `draft` lets an admin test not-yet-saved edits. */
export async function testOllamaConnection(draft?: Partial<store.OllamaConfig>): Promise<OllamaConnectionTestResult> {
  const config = { ...store.getOllamaConfig(), ...draft }
  try {
    const response = await fetch(`${config.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return { ok: false, error: `Ollama responded with ${response.status}` }
    const body = (await response.json()) as { models?: { name: string }[] }
    const installedModels = (body.models ?? []).map((entry) => entry.name)
    return { ok: true, installedModels, visionModelInstalled: installedModels.includes(config.visionModel), thinkingModelInstalled: installedModels.includes(config.thinkingModel) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not reach the Ollama host.' }
  }
}

/**
 * Pulls a model tag via Ollama's own `/api/pull` HTTP endpoint (`stream:
 * false` so this resolves once the pull is fully done rather than needing to
 * consume an NDJSON progress stream) — deliberately not a `child_process`
 * shell-out to the `ollama` CLI, since a systemd-run Node process isn't
 * guaranteed the same `PATH` as an interactive shell, while the HTTP API is
 * always reachable the same way `/api/chat` already is. Backs the
 * Integrations page's "Download missing model" button; first pulls are a
 * one-time few-GB download, so this can take several minutes.
 */
export async function pullOllamaModel(tag: string): Promise<{ ok: boolean; error?: string }> {
  const config = store.getOllamaConfig()
  try {
    const response = await fetch(`${config.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tag, stream: false }),
      signal: AbortSignal.timeout(30 * 60_000),
    })
    if (!response.ok) return { ok: false, error: `Ollama responded with ${response.status}` }
    const body = (await response.json()) as { status?: string; error?: string }
    if (body.error) return { ok: false, error: body.error }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not reach the Ollama host.' }
  }
}

export interface OllamaModelInfo {
  name: string
  /** Bytes on disk, straight from Ollama's own `/api/tags` response — shown as a human-readable size by the Integrations page's model manager. */
  size: number
}

/** Lists every model tag currently pulled on the configured Ollama host, not just the two configured vision/thinking roles — backs the Integrations page's own model manager (add/delete any tag). */
export async function listOllamaModels(): Promise<{ ok: boolean; models?: OllamaModelInfo[]; error?: string }> {
  const config = store.getOllamaConfig()
  try {
    const response = await fetch(`${config.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!response.ok) return { ok: false, error: `Ollama responded with ${response.status}` }
    const body = (await response.json()) as { models?: { name: string; size?: number }[] }
    return { ok: true, models: (body.models ?? []).map((entry) => ({ name: entry.name, size: entry.size ?? 0 })) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not reach the Ollama host.' }
  }
}

/** Removes a model tag from the configured Ollama host via its own `/api/delete` endpoint — backs the model manager's own "Delete" button. Frees disk space; the tag needs pulling again (see `pullOllamaModel`) before it can answer anything again. */
export async function deleteOllamaModel(tag: string): Promise<{ ok: boolean; error?: string }> {
  const config = store.getOllamaConfig()
  try {
    const response = await fetch(`${config.baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tag }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      return { ok: false, error: body.error ?? `Ollama responded with ${response.status}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not reach the Ollama host.' }
  }
}

/**
 * Best-effort: if the configured Ollama host is on this same machine and
 * isn't already up, starts `ollama serve` directly rather than leaving the
 * Local provider silently broken until an admin notices and starts it by
 * hand. Called once from `server/index.ts`'s own startup sequence, so this
 * runs whichever way the server itself happens to be launched (`npm run
 * dev`, a plain `npm run preview`, etc.) — the Linux systemd service
 * (`installer/linux/install.sh`'s own `Wants=ollama.service`) and the
 * Windows launcher script (`installer/start-adhdisplay.bat`'s own
 * `:start_ollama`) already give this same guarantee at their own startup
 * moment, but neither covers a manually-run dev server.
 *
 * Unlike `pullOllamaModel` above, this can't go through Ollama's own HTTP
 * API — there's nothing listening yet for it to call. A `child_process`
 * shell-out is the only option here, so (unlike that function's own
 * deliberate avoidance of one) this accepts the same PATH-under-systemd risk
 * that comment describes: if `ollama` isn't resolvable in whatever
 * environment this server process itself was started with, the spawn just
 * fails quietly below rather than actually starting anything — no worse than
 * today's baseline (nothing tries to start it at all), and a real install
 * normally does have it on `PATH` regardless.
 *
 * Deliberately never awaited by its caller — starting Ollama can take a few
 * seconds, and nothing about the app's own server startup actually depends
 * on it being ready yet (only an in-chat request against the Local provider
 * does, by which point it will be).
 */
export async function ensureOllamaRunning(): Promise<void> {
  const config = store.getOllamaConfig()
  let baseUrl: URL
  try {
    baseUrl = new URL(config.baseUrl)
  } catch {
    return
  }
  // A remote (non-localhost) host has no local `ollama` binary for this process to start anyway —
  // whoever manages that machine is expected to keep it running themselves.
  if (!['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname)) return

  try {
    const response = await fetch(`${config.baseUrl}/api/tags`, { signal: AbortSignal.timeout(2000) })
    if (response.ok) return
  } catch {
    // Not reachable yet — fall through to actually starting it below.
  }

  try {
    const child = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' })
    child.once('error', () => {
      // `ollama` isn't installed/on PATH — nothing more to do here; a Claude-only setup never needed it.
    })
    child.unref()
    console.log('[assistant] Ollama was not running — started it automatically.')
  } catch {
    // Same "not installed" case as above, for a platform that throws synchronously instead.
  }
}
