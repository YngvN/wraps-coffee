// Tests for fetchEnturDepartures against a recorded Entur journey planner response.
import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { ENTUR_CLIENT_NAME, TRANSIT_FETCH_BUFFER, fetchEnturDepartures } from './entur'

const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/entur-departures.json', import.meta.url), 'utf-8'))

function stubFetch(body: unknown, calls: { url: string; init: RequestInit }[]) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} })
    return { ok: true, status: 200, json: async () => body }
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

test('maps every estimated call to a departure', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const restore = stubFetch(fixture, calls)
  try {
    const result = await fetchEnturDepartures('NSR:StopPlace:5920', 5)
    assert.equal(result.stopName, fixture.data.stopPlace.name)
    assert.equal(result.departures.length, fixture.data.stopPlace.estimatedCalls.length)
    fixture.data.stopPlace.estimatedCalls.forEach((call, i: number) => {
      const d = result.departures[i]
      assert.equal(d.line, call.serviceJourney.line.publicCode)
      assert.equal(d.destination, call.destinationDisplay.frontText)
      assert.equal(d.expectedDepartureTime, call.expectedDepartureTime)
      assert.equal(d.aimedDepartureTime, call.aimedDepartureTime)
      assert.equal(d.realtime, call.realtime)
      assert.equal(d.cancelled, call.cancellation)
      assert.equal(d.mode, call.serviceJourney.line.transportMode)
      assert.equal(d.platform, call.quay?.publicCode ?? undefined)
      assert.equal(d.lineName, call.serviceJourney.line.name ?? undefined)
      assert.equal(d.authorityId, call.serviceJourney.line.authority?.id ?? undefined)
    })
  } finally {
    restore()
  }
})

test('prefixes line colours with #', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const restore = stubFetch(fixture, calls)
  try {
    const result = await fetchEnturDepartures('NSR:StopPlace:5920', 5)
    fixture.data.stopPlace.estimatedCalls.forEach((call, i: number) => {
      const colour = call.serviceJourney.line.presentation?.colour
      const d = result.departures[i]
      if (typeof colour === 'string' && colour.length > 0) {
        assert.equal(d.lineColor, colour.startsWith('#') ? colour : `#${colour}`)
      } else {
        assert.equal(d.lineColor, undefined)
      }
    })
  } finally {
    restore()
  }
})

test('posts to the journey planner with ET-Client-Name and requests at least TRANSIT_FETCH_BUFFER', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const restore = stubFetch(fixture, calls)
  try {
    await fetchEnturDepartures('NSR:StopPlace:5920', 5)
    assert.equal(calls.length, 1)
    const { url, init } = calls[0]
    assert.equal(url, 'https://api.entur.io/journey-planner/v3/graphql')
    assert.equal(init.method, 'POST')
    assert.equal((init.headers as Record<string, string>)['ET-Client-Name'], ENTUR_CLIENT_NAME)
    assert.deepEqual(JSON.parse(init.body as string).variables, { id: 'NSR:StopPlace:5920', numberOfDepartures: TRANSIT_FETCH_BUFFER })
  } finally {
    restore()
  }
})

test('throws on a non-ok response', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => ({ ok: false, status: 503, json: async () => fixture })) as typeof fetch
  try {
    await assert.rejects(fetchEnturDepartures('NSR:StopPlace:5920', 5), /journey planner failed: 503/)
  } finally {
    globalThis.fetch = original
  }
})

test('throws for an unknown stop place', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const restore = stubFetch({ data: { stopPlace: null } }, calls)
  try {
    await assert.rejects(fetchEnturDepartures('NSR:StopPlace:5920', 5), /unknown stop place/)
  } finally {
    restore()
  }
})
