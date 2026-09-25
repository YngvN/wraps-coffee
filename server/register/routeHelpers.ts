/**
 * Shared plumbing for the register and payment routes: parse a JSON body, run the handler, and turn a
 * thrown error into a response, so each route reads as its own rules and nothing else.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJsonBody, sendJson } from '../http'

/** A JSON object body, or `{}` for anything that isn't one. */
export type JsonBody = Record<string, unknown>

/** Parses the request body as JSON, then runs `handler`. Malformed JSON → 400; a thrown error → 500 with its message. */
export function withJsonBody(req: IncomingMessage, res: ServerResponse, handler: (body: JsonBody) => Promise<void> | void): void {
  readJsonBody(req)
    .then(async (body) => {
      const object = body && typeof body === 'object' && !Array.isArray(body) ? (body as JsonBody) : {}
      try {
        await handler(object)
      } catch (error) {
        console.error(`[register] ${req.method} ${req.url} failed:`, error)
        if (!res.headersSent) sendJson(res, 500, { error: error instanceof Error ? error.message : 'Unexpected error' })
      }
    })
    .catch(() => sendJson(res, 400, { error: 'Malformed request body' }))
}

/** `value` when it's a non-empty string, else `undefined`. */
export function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
