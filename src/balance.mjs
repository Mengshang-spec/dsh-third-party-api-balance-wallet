const DEFAULT_URL = 'https://hgapi.dieqiyun.top/api/v1/auth/me?timezone=Asia%2FShanghai'

export function buildBalanceRequest(config = {}) {
  let accessToken = String(config.accessToken ?? '').trim().replace(/^['"]|['"]$/g, '')
  accessToken = accessToken.replace(/^authorization\s*:\s*/i, '').trim()
  const url = String(config.balanceUrl ?? DEFAULT_URL).trim()
  if (!url) throw new Error('余额接口地址不能为空')
  if (!accessToken) throw new Error('网页登录令牌不能为空')
  return {
    url,
    headers: {
      Authorization: accessToken.toLowerCase().startsWith('bearer ') ? accessToken : `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'cc-switch/1.0',
    },
  }
}

export function extractWalletBalance(response) {
  const data = response && response.data ? response.data : response
  const raw = data && data.balance
  const amount = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(amount)) throw new Error(`未找到有效余额字段: ${JSON.stringify(response).slice(0, 200)}`)
  return { amount, currency: 'CNY', valid: data && data.status ? data.status === 'active' : true }
}

export async function fetchWalletBalance(config = {}, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持网络请求')
  const request = buildBalanceRequest(config)
  const controller = new AbortController()
  const timeoutMs = Number(config.timeoutMs ?? 15000)
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetchImpl(request.url, { method: 'GET', headers: request.headers, signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`余额请求超时（${timeoutMs}ms）`)
    throw new Error(`余额请求失败: ${error?.message ?? String(error)}`)
  } finally { clearTimeout(timer) }
  const text = await response.text()
  let payload
  try { payload = JSON.parse(text) } catch { throw new Error(`余额接口返回的不是 JSON（HTTP ${response.status}）`) }
  if (!response.ok) throw new Error(`余额接口 HTTP ${response.status}: ${payload?.message ?? text.slice(0, 200)}`)
  return extractWalletBalance(payload)
}

export { DEFAULT_URL }
