// Tests for fetchMetHourly / fetchMetForecast / todayLowHigh against a recorded MET locationforecast response.
import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { fetchMetHourly, fetchMetForecast, todayLowHigh } from './metForecast'

// todayLowHigh compares against local calendar dates, so pin the timezone.
process.env.TZ = 'Europe/Oslo'

const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/met-locationforecast.json', import.meta.url), 'utf-8'))

function stubFetch(body: unknown, calls: { url: string; init: RequestInit | undefined }[]) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return { ok: true, status: 200, json: async () => body }
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

test('maps only entries that have a next hour', async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const restore = stubFetch(fixture, calls)
  try {
    const hourly = await fetchMetHourly(59.913, 10.752)
    assert.equal(hourly.length, 12)
    fixture.properties.timeseries.filter((entry) => entry.data.next_1_hours).forEach((entry, i: number) => {
      const h = hourly[i]
      assert.equal(h.time, entry.time)
      assert.equal(h.temperatureC, entry.data.instant.details.air_temperature)
      assert.equal(h.precipitationMm, entry.data.next_1_hours.details.precipitation_amount)
      assert.equal(h.symbolCode, entry.data.next_1_hours.summary.symbol_code)
      assert.equal(h.windSpeedMs, entry.data.instant.details.wind_speed)
      assert.equal(h.humidityPercent, entry.data.instant.details.relative_humidity)
      assert.equal(h.pressureHpa, entry.data.instant.details.air_pressure_at_sea_level)
    })
  } finally {
    restore()
  }
})

test('calls the complete locationforecast and sends User-Agent only when given', async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const restore = stubFetch(fixture, calls)
  try {
    await fetchMetHourly(59.913, 10.752)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=59.913&lon=10.752')
    assert.equal(calls[0].init, undefined)

    await fetchMetHourly(59.913, 10.752, 'test-agent')
    assert.equal(calls.length, 2)
    assert.equal((calls[1].init!.headers as Record<string, string>)['User-Agent'], 'test-agent')
  } finally {
    restore()
  }
})

test('throws on a non-ok response', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => ({ ok: false, status: 503, json: async () => fixture })) as typeof fetch
  try {
    await assert.rejects(fetchMetHourly(59.913, 10.752), /locationforecast failed: 503/)
  } finally {
    globalThis.fetch = original
  }
})

test("today low/high comes from entries on today's local date", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const restore = stubFetch(fixture, calls)
  try {
    const hourly = await fetchMetHourly(59.913, 10.752)
    assert.deepEqual(todayLowHigh(hourly, 6, new Date('2026-09-25T12:00:00')), { todayLowC: 15.3, todayHighC: 18.7 })
  } finally {
    restore()
  }
})

test('falls back to the first hours entries when none are today', async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const restore = stubFetch(fixture, calls)
  try {
    const hourly = await fetchMetHourly(59.913, 10.752)
    const now = new Date('2026-10-01T12:00:00')
    const first = hourly.slice(0, 3)
    const expected = {
      todayLowC: Math.min(...first.map((entry) => entry.temperatureC)),
      todayHighC: Math.max(...first.map((entry) => entry.temperatureC)),
    }
    assert.deepEqual(todayLowHigh(hourly, 3, now), expected)
  } finally {
    restore()
  }
})

test('fetchMetForecast combines both', async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const restore = stubFetch(fixture, calls)
  try {
    const result = await fetchMetForecast(59.913, 10.752, 6)
    assert.equal(result.hourly.length, 12)
    assert.ok('todayLowC' in result)
    assert.ok('todayHighC' in result)
  } finally {
    restore()
  }
})
