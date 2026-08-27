import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fetchWalletBalance, extractWalletBalance, buildBalanceRequest } from '../src/balance.mjs'
import { apply as applyHost } from '../src/index.mjs'

test('loads the package root as a host entry without a browser window', async () => {
  const entry = await import('@dsh-external/dsh-wallet-switcher')
  assert.equal(typeof entry.apply, 'function')
  assert.deepEqual(entry.inject, ['webServer'])
})

test('builds the original usage-script style request', () => {
  const request = buildBalanceRequest({ accessToken: 'jwt-token' })
  assert.equal(request.url, 'https://hgapi.dieqiyun.top/api/v1/auth/me?timezone=Asia%2FShanghai')
  assert.equal(request.headers.Authorization, 'Bearer jwt-token')
  assert.equal(request.headers.Accept, 'application/json')
  assert.equal(request.headers['User-Agent'], 'cc-switch/1.0')
})

test('accepts a copied Authorization header line without duplicating Bearer', () => {
  const request = buildBalanceRequest({ accessToken: 'Authorization: Bearer jwt-token' })
  assert.equal(request.headers.Authorization, 'Bearer jwt-token')
})

test('extracts CNY balance from the wrapped auth response', () => {
  assert.deepEqual(extractWalletBalance({ data: { balance: '29.22857071', status: 'active' } }), { amount: 29.22857071, currency: 'CNY', valid: true })
})

test('extracts CNY balance from the original top-level response', () => {
  assert.deepEqual(extractWalletBalance({ balance: '29.22857071', email: 'user@example.com' }), { amount: 29.22857071, currency: 'CNY', valid: true })
})

test('fetches the auth endpoint with accessToken and returns CNY', async () => {
  const result = await fetchWalletBalance({ accessToken: 'jwt-token' }, async (url, init) => {
    assert.equal(url, 'https://hgapi.dieqiyun.top/api/v1/auth/me?timezone=Asia%2FShanghai')
    assert.equal(init.headers.Authorization, 'Bearer jwt-token')
    return new Response(JSON.stringify({ data: { balance: 12.5, status: 'active' } }), { status: 200 })
  })
  assert.deepEqual(result, { amount: 12.5, currency: 'CNY', valid: true })
})

test('reports a useful error when the website token is rejected', async () => {
  await assert.rejects(() => fetchWalletBalance({ accessToken: 'expired' }, async () => new Response(JSON.stringify({ message: 'Invalid token' }), { status: 401 })), /HTTP 401.*Invalid token/)
})

test('returns HTTP 400 when the balance route receives malformed JSON', async () => {
  let route
  applyHost({ webServer: { register(value) { route = value; return () => {} } } })
  const req = {
    method: 'POST',
    async *[Symbol.asyncIterator]() { yield '{invalid' },
  }
  const response = {
    status: 0,
    headers: {},
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(body) { this.body = body },
  }
  await route.handler(req, response)
  assert.equal(response.status, 400)
  assert.match(response.body, /JSON/)
})

test('uses a compact DSH-style wallet dock with accessible controls', async () => {
  const ui = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
  assert.match(ui, /dsh-wallet-dock/)
  assert.match(ui, /dsh-wallet-dock__config/)
  assert.match(ui, /'aria-label': '余额接口地址'/)
  assert.match(ui, /'aria-label': '网页登录令牌'/)
  assert.match(ui, /iconButton\('刷新余额', '刷新余额'/)
  assert.match(ui, /iconButton\('修改令牌', '修改令牌'/)
  assert.match(ui, /border: '1px solid var\(--dsh-border-subtle, #d9d9d9\)'/)
})
