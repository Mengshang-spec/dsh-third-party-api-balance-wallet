import { fetchWalletBalance, DEFAULT_URL } from './balance.mjs'

const ROUTE = '/api/dsh-wallet-switcher/balance'

export const inject = ['webServer']

function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

async function readBody(req) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 64 * 1024) throw new Error('请求内容过大')
  }
  return JSON.parse(body || '{}')
}

export function apply(ctx, config = {}) {
  const defaults = {
    balanceUrl: String(config.balanceUrl || process.env.DSH_WALLET_BALANCE_URL || DEFAULT_URL),
    accessToken: String(config.accessToken || process.env.DSH_WALLET_ACCESS_TOKEN || ''),
  }
  return ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: '只允许 POST' })
        return
      }
      let overrides
      try {
        overrides = await readBody(req)
      } catch (error) {
        sendJson(res, 400, { ok: false, error: `请求 JSON 无效: ${error?.message ?? String(error)}` })
        return
      }
      try {
        const result = await fetchWalletBalance({ ...defaults, ...overrides })
        sendJson(res, 200, { ok: true, balance: result.amount, currency: result.currency, valid: result.valid })
      } catch (error) {
        sendJson(res, 502, { ok: false, error: error?.message ?? String(error) })
      }
    },
  })
}

export { ROUTE }
