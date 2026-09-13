import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply as applyHost, ROUTE, CONFIG_ROUTE } from '../src/index.mjs'

function makeRes() {
  return {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(body) { this.body = body },
  }
}

function makeReq(method, body) {
  if (body === undefined) return { method }
  return { method, async *[Symbol.asyncIterator]() { yield body } }
}

function setupHost(config = {}) {
  const routes = new Map()
  applyHost({ webServer: { register(value) { routes.set(value.path, value); return () => {} } } }, config)
  return routes
}

function jsonOf(res) {
  return JSON.parse(res.body)
}

function recordingFetch(calls) {
  return async (url, init) => {
    calls.push({ url, authorization: init.headers.Authorization })
    return new Response(JSON.stringify({
      balance: 42.5,
      isValid: true,
      mode: 'unrestricted',
      daily_usage: [{ date: '2026-01-01', requests: 3, total_tokens: 30, cost: 0.3, actual_cost: 0.03 }],
    }), { status: 200 })
  }
}

test('exposes both routes and keeps the legacy ROUTE export', () => {
  const routes = setupHost({ apiKey: 'sk-host-key-123456', fetchImpl: recordingFetch([]), currency: '' })
  assert.ok(routes.has(ROUTE))
  assert.ok(routes.has(CONFIG_ROUTE))
})

test('GET balance uses host-side credentials and never echoes the key', async () => {
  const calls = []
  const routes = setupHost({ apiKey: 'sk-host-key-123456', fetchImpl: recordingFetch(calls), currency: '' })
  const res = makeRes()
  await routes.get(ROUTE).handler(makeReq('GET'), res)
  assert.equal(res.status, 200)
  const body = jsonOf(res)
  assert.equal(body.ok, true)
  assert.equal(body.balance, 42.5)
  assert.equal(body.source, 'config')
  assert.equal(body.currency, '')
  assert.ok(body.fetchedAt)
  assert.deepEqual(calls, [{ url: 'https://hgapi.dieqiyun.top/v1/usage', authorization: 'Bearer sk-host-key-123456' }])
  assert.ok(!res.body.includes('sk-host-key-123456'), 'response must not contain the API key')
})

test('GET balance reports unconfigured instead of failing', async () => {
  const routes = setupHost({ apiKey: '', accessToken: '', currency: '', discover: () => null })
  const res = makeRes()
  await routes.get(ROUTE).handler(makeReq('GET'), res)
  assert.equal(res.status, 200)
  const body = jsonOf(res)
  assert.equal(body.ok, false)
  assert.equal(body.reason, 'unconfigured')
  assert.equal(body.source, 'none')
})

test('GET balance falls back to DSH auto-discovery', async () => {
  const calls = []
  const routes = setupHost({
    apiKey: '',
    accessToken: '',
    currency: '',
    fetchImpl: recordingFetch(calls),
    discover: () => ({ source: 'discovered', provider: 'deepseek1', apiKeyEnv: 'DEEPSEEK1_API_KEY', baseUrl: 'https://hgapi.dieqiyun.top', usageUrl: 'https://hgapi.dieqiyun.top/v1/usage', apiKey: 'sk-discovered-999' }),
  })
  const res = makeRes()
  await routes.get(ROUTE).handler(makeReq('GET'), res)
  assert.equal(jsonOf(res).source, 'discovered')
  assert.deepEqual(calls, [{ url: 'https://hgapi.dieqiyun.top/v1/usage', authorization: 'Bearer sk-discovered-999' }])
})

test('settings saved in the profile dir win over config and discovery', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'dsh-wallet-saved-'))
  writeFileSync(join(dataDir, 'settings.json'), JSON.stringify({ apiKey: 'sk-saved-key-8888', usageUrl: 'https://api.example.com/v1/usage', currency: 'USD' }))
  const calls = []
  const routes = setupHost({
    apiKey: 'sk-config-key-7777',
    currency: '',
    dataDir,
    fetchImpl: recordingFetch(calls),
    discover: () => { throw new Error('discovery must not run when a key is saved') },
  })
  const res = makeRes()
  await routes.get(ROUTE).handler(makeReq('GET'), res)
  const body = jsonOf(res)
  assert.equal(body.source, 'saved')
  assert.equal(body.currency, 'USD')
  assert.deepEqual(calls, [{ url: 'https://api.example.com/v1/usage', authorization: 'Bearer sk-saved-key-8888' }])
})

test('POST config persists credentials host-side and answers redacted', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'dsh-wallet-save-'))
  const routes = setupHost({ apiKey: '', accessToken: '', currency: '', dataDir, discover: () => null, fetchImpl: recordingFetch([]) })
  const res = makeRes()
  await routes.get(CONFIG_ROUTE).handler(makeReq('POST', JSON.stringify({ apiKey: 'sk-freshly-saved-1', usageUrl: '', currency: 'USD' })), res)
  assert.equal(res.status, 200)
  const body = jsonOf(res)
  assert.equal(body.ok, true)
  assert.equal(body.configured, true)
  assert.equal(body.keyMasked, 'sk-fres••••')
  assert.ok(!res.body.includes('sk-freshly-saved-1'), 'redacted answer must not contain the key')

  const persisted = JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8'))
  assert.equal(persisted.apiKey, 'sk-freshly-saved-1')
  assert.equal(persisted.currency, 'USD')

  const configRes = makeRes()
  await routes.get(CONFIG_ROUTE).handler(makeReq('GET'), configRes)
  const config = jsonOf(configRes)
  assert.equal(config.configured, true)
  assert.equal(config.keyMasked, 'sk-fres••••')
  assert.equal(config.usageUrl, 'https://hgapi.dieqiyun.top/v1/usage')
  assert.equal(config.source, 'saved')

  const shortRes = makeRes()
  await routes.get(CONFIG_ROUTE).handler(makeReq('POST', JSON.stringify({ apiKey: 'sk-short1' })), shortRes)
  assert.equal(jsonOf(shortRes).keyMasked, '••••', 'short keys must be fully masked')
})

test('POST config resetApiKey clears the saved key', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'dsh-wallet-reset-'))
  writeFileSync(join(dataDir, 'settings.json'), JSON.stringify({ apiKey: 'sk-old-key-000000' }))
  const routes = setupHost({ apiKey: '', accessToken: '', currency: '', dataDir, discover: () => null })
  const res = makeRes()
  await routes.get(CONFIG_ROUTE).handler(makeReq('POST', JSON.stringify({ resetApiKey: true })), res)
  assert.equal(res.status, 200)
  assert.equal(jsonOf(res).configured, false)
  const persisted = JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8'))
  assert.equal(persisted.apiKey, undefined)
})

test('POST config rejects private or insecure balance URLs', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'dsh-wallet-url-'))
  const routes = setupHost({ apiKey: '', accessToken: '', currency: '', dataDir })
  for (const usageUrl of ['http://hgapi.dieqiyun.top/v1/usage', 'https://127.0.0.1/v1/usage', 'https://192.168.0.1/v1/usage']) {
    const res = makeRes()
    await routes.get(CONFIG_ROUTE).handler(makeReq('POST', JSON.stringify({ usageUrl })), res)
    assert.equal(res.status, 400, usageUrl)
    assert.ok(!existsSync(join(dataDir, 'settings.json')), 'nothing should be persisted for an invalid URL')
  }
})

test('malformed config POST answers 400', async () => {
  const routes = setupHost({ apiKey: 'sk-x-1234567890', currency: '' })
  const res = makeRes()
  await routes.get(CONFIG_ROUTE).handler(makeReq('POST', '{invalid'), res)
  assert.equal(res.status, 400)
  assert.match(res.body, /JSON/)
})

test('upstream failures surface a typed 502 without the key', async () => {
  const key = 'sk-leaky-check-4242'
  const routes = setupHost({
    apiKey: key,
    currency: '',
    fetchImpl: async () => new Response(JSON.stringify({ message: 'bad key' }), { status: 401 }),
  })
  const res = makeRes()
  await routes.get(ROUTE).handler(makeReq('GET'), res)
  assert.equal(res.status, 502)
  const body = jsonOf(res)
  assert.equal(body.ok, false)
  assert.equal(body.errorCode, 'UNAUTHORIZED')
  assert.match(body.error, /API Key 无效或已被撤销/)
  assert.ok(!res.body.includes(key))
})

test('balance route only accepts GET and config route only GET/POST', async () => {
  const routes = setupHost({ apiKey: 'sk-x-1234567890', currency: '' })
  const postBalance = makeRes()
  await routes.get(ROUTE).handler(makeReq('POST', '{}'), postBalance)
  assert.equal(postBalance.status, 405)
  const deleteConfig = makeRes()
  await routes.get(CONFIG_ROUTE).handler(makeReq('DELETE'), deleteConfig)
  assert.equal(deleteConfig.status, 405)
})
