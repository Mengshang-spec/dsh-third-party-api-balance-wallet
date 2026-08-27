import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchWalletBalance, extractWalletBalance, buildBalanceRequest } from '../src/balance.mjs'

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

test('extracts CNY balance from the wrapped auth response', () => {
  assert.deepEqual(extractWalletBalance({ data: { balance: '29.22857071', status: 'active' } }), { amount: 29.22857071, currency: 'CNY', valid: true })
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
