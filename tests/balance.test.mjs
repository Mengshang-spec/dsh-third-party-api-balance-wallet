import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_USAGE_URL,
  buildBalanceRequest,
  assertPublicHttpsUrl,
  resolveApiKey,
  extractWalletBalance,
  fetchWalletBalance,
  localDateStamp,
} from '../src/balance.mjs'

const STAMP = localDateStamp(new Date('2026-09-13T12:00:00Z'))

function usagePayload(overrides = {}, daily = []) {
  return {
    balance: 61.41163914,
    isValid: true,
    mode: 'unrestricted',
    daily_usage: daily,
    ...overrides,
  }
}

test('loads the package root as a host entry without a browser window', async () => {
  const entry = await import('dsh-third-party-api-balance-wallet')
  assert.equal(typeof entry.apply, 'function')
  assert.deepEqual(entry.inject, ['webServer'])
})

test('defaults to the usage endpoint', () => {
  assert.equal(DEFAULT_USAGE_URL, 'https://hgapi.dieqiyun.top/v1/usage')
})

test('builds the usage-script style request from an API Key', () => {
  const request = buildBalanceRequest({ apiKey: 'sk-test-key' })
  assert.equal(request.url, DEFAULT_USAGE_URL)
  assert.equal(request.headers.Authorization, 'Bearer sk-test-key')
  assert.equal(request.headers.Accept, 'application/json')
  assert.equal(request.headers['User-Agent'], 'dsh-wallet-switcher')
})

test('rejects the retired web-login token', () => {
  assert.throws(() => resolveApiKey({ accessToken: 'jwt-token' }), /网页登录令牌已不再支持/)
  assert.throws(() => buildBalanceRequest({ accessToken: 'Bearer eyJhbGci' }), /API Key/)
})

test('accepts a legacy accessToken only when it is an sk- key', () => {
  assert.equal(resolveApiKey({ accessToken: 'sk-legacy-fallback' }), 'sk-legacy-fallback')
  const request = buildBalanceRequest({ accessToken: 'sk-legacy-fallback' })
  assert.equal(request.headers.Authorization, 'Bearer sk-legacy-fallback')
})

test('prefers apiKey over legacy accessToken and tolerates pasted header lines', () => {
  assert.equal(resolveApiKey({ apiKey: 'sk-explicit', accessToken: 'sk-legacy' }), 'sk-explicit')
  assert.equal(resolveApiKey({ apiKey: '"sk-quoted"' }), 'sk-quoted')
  assert.equal(resolveApiKey({ apiKey: 'Authorization: Bearer sk-pasted' }), 'sk-pasted')
})

test('empty credentials throw a clear error', () => {
  assert.throws(() => buildBalanceRequest({}), /API Key 不能为空/)
})

test('balance URL must be public HTTPS', () => {
  assert.equal(assertPublicHttpsUrl('https://api.example.com/v1/usage'), 'https://api.example.com/v1/usage')
  for (const bad of [
    'http://hgapi.dieqiyun.top/v1/usage',
    'https://localhost/v1/usage',
    'https://api.localhost/v1/usage',
    'https://127.0.0.1/v1/usage',
    'https://10.1.2.3/v1/usage',
    'https://192.168.1.4/v1/usage',
    'https://172.16.0.9/v1/usage',
    'https://169.254.1.1/v1/usage',
    'https://[::1]/v1/usage',
    'https://user:pass@api.example.com/v1/usage',
    'file:///etc/passwd',
    'not a url',
  ]) {
    assert.throws(() => assertPublicHttpsUrl(bad), Error, `should reject ${bad}`)
  }
})

test('extracts balance, validity, mode and today usage', () => {
  const result = extractWalletBalance(
    usagePayload({}, [{ date: '2026-09-12', requests: 1, total_tokens: 2, cost: 3, actual_cost: 4 }, { date: STAMP, requests: 46, total_tokens: 6244709, cost: 8.7992584, actual_cost: 2.1998146 }]),
    new Date('2026-09-13T12:00:00Z'),
  )
  assert.equal(result.balance, 61.41163914)
  assert.equal(result.isValid, true)
  assert.equal(result.mode, 'unrestricted')
  assert.deepEqual(result.today, { date: STAMP, requests: 46, totalTokens: 6244709, cost: 8.7992584, actualCost: 2.1998146 })
})

test('never fakes today usage from the last row', () => {
  const result = extractWalletBalance(
    usagePayload({}, [{ date: '2026-09-11', requests: 9, total_tokens: 9, cost: 9, actual_cost: 9 }]),
    new Date('2026-09-13T12:00:00Z'),
  )
  assert.equal(result.today, null)
})

test('handles empty or missing daily usage, wrapped payloads and string numbers', () => {
  const empty = extractWalletBalance(usagePayload({}, []), new Date('2026-09-13T12:00:00Z'))
  assert.equal(empty.today, null)
  const wrapped = extractWalletBalance({ data: { balance: '12.5', isValid: false, mode: 'restricted' } })
  assert.deepEqual({ balance: wrapped.balance, isValid: wrapped.isValid, mode: wrapped.mode }, { balance: 12.5, isValid: false, mode: 'restricted' })
})

test('keeps a zero balance and falls back through remaining fields', () => {
  assert.equal(extractWalletBalance({ balance: 0 }).balance, 0)
  assert.equal(extractWalletBalance({ remaining: '3.25' }).balance, 3.25)
  assert.equal(extractWalletBalance({ quota: { remaining: 7 } }).balance, 7)
  assert.throws(() => extractWalletBalance({ isValid: true }), /未找到有效余额字段/)
})

test('classifies HTTP failures without leaking the key', async () => {
  const key = 'sk-secret-value-000'
  const cases = [
    [401, 'UNAUTHORIZED', /API Key 无效或已被撤销/],
    [403, 'UNAUTHORIZED', /API Key 无效或已被撤销/],
    [404, 'NOT_FOUND', /不支持 \/v1\/usage/],
    [429, 'RATE_LIMITED', /过于频繁/],
    [500, 'SERVER', /HTTP 500/],
  ]
  for (const [status, code, pattern] of cases) {
    try {
      await fetchWalletBalance({ apiKey: key, currency: 'USD' }, async () => new Response(JSON.stringify({ message: 'nope' }), { status }))
      assert.fail(`expected HTTP ${status} to throw`)
    } catch (error) {
      assert.equal(error.code, code)
      assert.match(error.message, pattern)
      assert.ok(!error.message.includes(key), 'error message must not contain the API key')
    }
  }
})

test('returns a normalized result on success', async () => {
  const result = await fetchWalletBalance(
    { apiKey: 'sk-ok', currency: 'USD' },
    async () => new Response(JSON.stringify(usagePayload({}, [{ date: STAMP, requests: 2, total_tokens: 20, cost: 0.2, actual_cost: 0.02 }])), { status: 200 }),
    new Date('2026-09-13T12:00:00Z'),
  )
  assert.equal(result.balance, 61.41163914)
  assert.equal(result.currency, 'USD')
  assert.equal(result.isValid, true)
  assert.equal(result.today.actualCost, 0.02)
})

test('maps abort and network failures to typed errors', async () => {
  await assert.rejects(
    () => fetchWalletBalance({ apiKey: 'sk-x' }, async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }) }),
    (error) => error.code === 'TIMEOUT' && /超时/.test(error.message),
  )
  await assert.rejects(
    () => fetchWalletBalance({ apiKey: 'sk-x' }, async () => { throw new Error('ECONNRESET') }),
    (error) => error.code === 'NETWORK',
  )
})

test('non-JSON responses are rejected with the HTTP status', async () => {
  await assert.rejects(
    () => fetchWalletBalance({ apiKey: 'sk-x' }, async () => new Response('<html>boom</html>', { status: 200 })),
    /不是 JSON/,
  )
})
