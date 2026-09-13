// 余额查询：走服务商的用量接口（长期 API Key，Bearer sk-...），
// 不再使用网页登录令牌（/api/v1/auth/me 的 access_token 只有 24 小时寿命）。
const DEFAULT_USAGE_URL = 'https://hgapi.dieqiyun.top/v1/usage'

export { DEFAULT_USAGE_URL }

function normalizeKey(value) {
  let key = String(value ?? '').trim().replace(/^['"]|['"]$/g, '')
  key = key.replace(/^authorization\s*:\s*/i, '').trim()
  key = key.replace(/^bearer\s+/i, '').trim()
  return key
}

// 显式配置的 apiKey 优先；旧 accessToken 仅在恰好是 sk- Key 时兜底，
// 网页 JWT 一律拒绝（发到 /v1/usage 只会得到 401）。
export function resolveApiKey(config = {}) {
  const direct = normalizeKey(config.apiKey)
  if (direct) return direct
  const legacy = normalizeKey(config.accessToken)
  if (!legacy) return ''
  if (/^sk-/.test(legacy)) return legacy
  throw new Error('网页登录令牌已不再支持：请改用 sk- 开头的 API Key')
}

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (host.includes(':')) {
    const v6 = host.replace(/^\[|\]$/g, '')
    if (v6 === '::1' || v6 === '::') return true
    if (/^f[cd][0-9a-f]{2}:/.test(v6) || /^fe[89ab][0-9a-f]:/.test(v6)) return true
    return false
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return false
  const octets = m.slice(1).map(Number)
  if (octets.some((n) => n > 255)) return true
  const [a, b] = octets
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

// 余额 URL 可以改成其他站点，但必须是公网 HTTPS 地址：
// 禁止 http、本机、内网段与带凭据的 URL，杜绝宿主进程被当 SSRF 跳板。
export function assertPublicHttpsUrl(rawUrl) {
  const text = String(rawUrl ?? '').trim()
  let url
  try {
    url = new URL(text)
  } catch {
    throw new Error(`余额接口地址无效: ${text.slice(0, 100)}`)
  }
  if (url.protocol !== 'https:') throw new Error('余额接口必须使用 HTTPS 地址')
  if (url.username || url.password) throw new Error('余额接口地址不允许携带用户名密码')
  if (isPrivateHostname(url.hostname)) throw new Error('余额接口不允许指向本机或内网地址')
  return url.toString()
}

export function buildBalanceRequest(config = {}) {
  const apiKey = resolveApiKey(config)
  if (!apiKey) throw new Error('API Key 不能为空：请填入 sk- 开头的 API Key')
  const url = assertPublicHttpsUrl(String(config.usageUrl ?? config.balanceUrl ?? DEFAULT_USAGE_URL))
  return {
    url,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'User-Agent': 'dsh-wallet-switcher',
    },
  }
}

export function localDateStamp(now) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function finiteNumber(value, fallback) {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function pickBalance(data) {
  const raw = data.balance ?? data.remaining ?? data?.quota?.remaining
  const amount = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(amount)) {
    throw new Error(`未找到有效余额字段: ${JSON.stringify(data).slice(0, 200)}`)
  }
  return amount
}

// /v1/usage 返回：{ balance, isValid, mode, daily_usage: [{ date, requests,
// total_tokens, cost, actual_cost }] }。今日数据必须按本地日期精确匹配，
// 不能拿列表最后一条冒充今天（列表可能乱序或缺当天）。
export function extractWalletBalance(response, now = new Date()) {
  const data = response && response.data ? response.data : response
  if (!data || typeof data !== 'object') {
    throw new Error(`余额接口返回了意外的结构: ${JSON.stringify(response).slice(0, 200)}`)
  }
  const stamp = localDateStamp(now)
  const rows = Array.isArray(data.daily_usage) ? data.daily_usage : []
  const row = rows.find((item) => item && item.date === stamp) ?? null
  return {
    balance: pickBalance(data),
    currency: '',
    isValid: typeof data.isValid === 'boolean' ? data.isValid : true,
    mode: typeof data.mode === 'string' ? data.mode : '',
    today: row
      ? {
          date: String(row.date ?? stamp),
          requests: finiteNumber(row.requests, 0),
          totalTokens: finiteNumber(row.total_tokens, 0),
          cost: finiteNumber(row.cost, 0),
          actualCost: finiteNumber(row.actual_cost, 0),
        }
      : null,
  }
}

function httpError(status, message, code) {
  return Object.assign(new Error(message), { code, status })
}

export async function fetchWalletBalance(config = {}, fetchImpl = globalThis.fetch, now = new Date()) {
  if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持网络请求')
  const request = buildBalanceRequest(config)
  const timeoutMs = Number(config.timeoutMs ?? 15000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetchImpl(request.url, { method: 'GET', headers: request.headers, signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw httpError(0, `余额请求超时（${timeoutMs}ms）`, 'TIMEOUT')
    throw httpError(0, `余额请求失败: ${error?.message ?? String(error)}`, 'NETWORK')
  } finally {
    clearTimeout(timer)
  }
  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw httpError(response.status, `余额接口返回的不是 JSON（HTTP ${response.status}）`, 'BAD_RESPONSE')
  }
  if (!response.ok) {
    const detail = payload?.message ?? text.slice(0, 200)
    if (response.status === 401 || response.status === 403) {
      throw httpError(response.status, `API Key 无效或已被撤销（HTTP ${response.status}）${detail ? `: ${detail}` : ''}`, 'UNAUTHORIZED')
    }
    if (response.status === 404) {
      throw httpError(response.status, `余额接口不存在（HTTP 404）：该站点可能不支持 /v1/usage${detail ? `: ${detail}` : ''}`, 'NOT_FOUND')
    }
    if (response.status === 429) {
      throw httpError(response.status, `余额查询过于频繁（HTTP 429）${detail ? `: ${detail}` : ''}`, 'RATE_LIMITED')
    }
    throw httpError(response.status, `余额接口 HTTP ${response.status}${detail ? `: ${detail}` : ''}`, 'SERVER')
  }
  const extracted = extractWalletBalance(payload, now)
  const currency = typeof config.currency === 'string' ? config.currency.trim() : ''
  return { ...extracted, currency }
}
