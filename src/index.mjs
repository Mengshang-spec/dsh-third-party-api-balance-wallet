import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { assertPublicHttpsUrl, fetchWalletBalance, DEFAULT_USAGE_URL } from './balance.mjs'
import { discoverWalletCredential } from './discovery.mjs'

export const ROUTE = '/api/dsh-wallet-switcher/balance'
export const CONFIG_ROUTE = '/api/dsh-wallet-switcher/config'

export const inject = ['webServer']

// config.dataDir 即插件数据目录；未指定时落到 profile 目录下的 dsh-wallet-switcher
function dataDirFor(config) {
  if (config.dataDir) return config.dataDir
  const base = process.env.DSH_PROFILE_DIR || join(homedir(), '.dsh', 'profiles', 'web')
  return join(base, 'dsh-wallet-switcher')
}

function readSettings(dataDir) {
  try {
    const parsed = JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeSettings(dataDir, settings) {
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, 'settings.json'), JSON.stringify(settings, null, 2))
}

function maskKey(key) {
  if (!key) return ''
  // 短 Key 全遮，避免前 7 位反推出原文
  return key.length > 10 ? `${key.slice(0, 7)}••••` : '••••'
}

// 凭据解析优先级：UI 保存的 settings.json > 插件配置/环境变量 >
// DSH 自动发现（settings.yaml + .credentials.yaml）> 旧 accessToken（仅 sk-）。
// Key 只存在于宿主进程与 settings.json，绝不发给浏览器。
function resolveSettings(config, dataDir, discover) {
  const saved = readSettings(dataDir)
  const savedKey = typeof saved.apiKey === 'string' ? saved.apiKey.trim() : ''
  const envKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : (process.env.DSH_WALLET_API_KEY || '').trim()
  const envUrl = (typeof config.usageUrl === 'string' && config.usageUrl.trim()) || (process.env.DSH_WALLET_USAGE_URL || '').trim()
  const currency = (typeof config.currency === 'string' && config.currency.trim()) || (process.env.DSH_WALLET_CURRENCY || '').trim() || (typeof saved.currency === 'string' ? saved.currency.trim() : '')

  let source = 'none'
  let apiKey = ''
  let discoveredUrl = ''
  if (savedKey) {
    apiKey = savedKey
    source = 'saved'
  } else if (envKey) {
    apiKey = envKey
    source = 'config'
  } else {
    const found = discover()
    if (found?.apiKey) {
      apiKey = found.apiKey
      source = 'discovered'
      discoveredUrl = typeof found.usageUrl === 'string' ? found.usageUrl.trim() : ''
    } else {
      const legacy = (typeof config.accessToken === 'string' ? config.accessToken.trim() : '') || (process.env.DSH_WALLET_ACCESS_TOKEN || '').trim()
      if (/^sk-/.test(legacy)) {
        apiKey = legacy
        source = 'legacy'
      }
    }
  }

  const savedUrl = typeof saved.usageUrl === 'string' ? saved.usageUrl.trim() : ''
  const usageUrl = savedUrl || envUrl || discoveredUrl || DEFAULT_USAGE_URL
  return { apiKey: apiKey || '', usageUrl, currency, source }
}

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
  const dataDir = dataDirFor(config)
  const fetchImpl = typeof config.fetchImpl === 'function' ? config.fetchImpl : globalThis.fetch
  const discover = typeof config.discover === 'function' ? config.discover : () => discoverWalletCredential()

  const registerBalance = ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: '只允许 GET' })
        return
      }
      const settings = resolveSettings(config, dataDir, discover)
      if (!settings.apiKey) {
        sendJson(res, 200, {
          ok: false,
          reason: 'unconfigured',
          source: settings.source,
          error: '尚未配置 API Key：点击设置填入 sk- 开头的 API Key，或在 DSH 中配置楪祈云 provider',
        })
        return
      }
      try {
        const result = await fetchWalletBalance(settings, fetchImpl)
        sendJson(res, 200, { ok: true, ...result, source: settings.source, fetchedAt: new Date().toISOString() })
      } catch (error) {
        sendJson(res, 502, { ok: false, error: error?.message ?? String(error), errorCode: error?.code ?? 'UNKNOWN', source: settings.source })
      }
    },
  })

  const registerConfig = ctx.webServer.register({
    kind: 'exact',
    path: CONFIG_ROUTE,
    handler: async (req, res) => {
      if (req.method === 'GET') {
        const settings = resolveSettings(config, dataDir, discover)
        sendJson(res, 200, {
          ok: true,
          configured: Boolean(settings.apiKey),
          keyMasked: maskKey(settings.apiKey),
          usageUrl: settings.usageUrl,
          currency: settings.currency,
          source: settings.source,
        })
        return
      }
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: '只允许 GET / POST' })
        return
      }
      let body
      try {
        body = await readBody(req)
      } catch (error) {
        sendJson(res, 400, { ok: false, error: `请求 JSON 无效: ${error?.message ?? String(error)}` })
        return
      }
      const saved = readSettings(dataDir)
      const next = { ...saved }
      if (typeof body.apiKey === 'string' && body.apiKey.trim()) next.apiKey = body.apiKey.trim()
      if (body.resetApiKey === true) delete next.apiKey
      if (typeof body.usageUrl === 'string') {
        const usageUrl = body.usageUrl.trim()
        try {
          assertPublicHttpsUrl(usageUrl || DEFAULT_USAGE_URL)
        } catch (error) {
          sendJson(res, 400, { ok: false, error: error?.message ?? String(error) })
          return
        }
        next.usageUrl = usageUrl
      }
      if (typeof body.currency === 'string') next.currency = body.currency.trim()
      try {
        writeSettings(dataDir, next)
      } catch (error) {
        sendJson(res, 500, { ok: false, error: `保存配置失败: ${error?.message ?? String(error)}` })
        return
      }
      sendJson(res, 200, {
        ok: true,
        configured: Boolean(next.apiKey),
        keyMasked: maskKey(next.apiKey),
        usageUrl: next.usageUrl || DEFAULT_USAGE_URL,
        currency: next.currency || '',
        source: next.apiKey ? 'saved' : resolveSettings(config, dataDir, discover).source,
      })
    },
  })

  return () => {
    registerBalance?.()
    registerConfig?.()
  }
}

export { DEFAULT_USAGE_URL }
