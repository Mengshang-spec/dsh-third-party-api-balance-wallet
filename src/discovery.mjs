// 零配置自动发现：从 DSH 的 ~/.dsh/settings.yaml 找到可作为余额来源的 provider，
// 再从 ~/.dsh/.credentials.yaml 的 refs 里按 apiKeyEnv 取出对应 API Key。
// 两个文件都是「每行一个键值 + 缩进」的简单 YAML，这里做的是窄范围行扫描，
// 不引入 YAML 依赖；结构不符时一律返回 null，走手动配置兜底。
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// 官方 API 不是 Sub2API 面板，没有 /v1/usage，不能当余额来源。
// 除此之外，settings.yaml 里配置过的任何 provider 域名都视为可信：
// 用户在 DSH 里配了它，就等于授权插件向它发余额查询。
const OFFICIAL_API_HOSTS = [
  'api.deepseek.com',
  'api.openai.com',
  'api.anthropic.com',
  'api.moonshot.cn',
  'api.moonshot.ai',
  'open.bigmodel.cn',
  'dashscope.aliyuncs.com',
  'api.minimax.chat',
  'spark-api-open.xf-yun.com',
]

function isOfficialApiHost(hostname) {
  const host = hostname.toLowerCase()
  return OFFICIAL_API_HOSTS.some((official) => host === official || host.endsWith(`.${official}`))
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

function cleanValue(value) {
  const text = value.trim()
  const quote = text[0]
  if (quote === '"' || quote === "'") {
    const end = text.indexOf(quote, 1)
    if (end > 0) return text.slice(1, end)
  }
  // 只认「空白 + #」为行内注释，避免误伤值本身
  return text.replace(/\s+#.*$/, '').trim()
}

function indentOf(line) {
  return line.match(/^\s*/)[0].length
}

export function parseProvidersFromSettingsYaml(text) {
  const providers = {}
  let inLlm = false
  let inProviders = false
  let current = null
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const body = line.trim()
    if (!body || body.startsWith('#')) continue
    const indent = indentOf(line)
    if (indent === 0) {
      inLlm = /^llm-pi-ai:\s*(#.*)?$/.test(body)
      inProviders = false
      current = null
      continue
    }
    if (!inLlm) continue
    if (indent <= 2) {
      inProviders = indent === 2 && /^providers:\s*(#.*)?$/.test(body)
      current = null
      continue
    }
    if (!inProviders) continue
    if (indent <= 4) {
      if (!body.startsWith('-') && body.endsWith(':')) {
        current = providers[body.slice(0, -1).trim()] = {}
      } else {
        current = null
      }
      continue
    }
    if (!current) continue
    const m = /^(apiKeyEnv|baseURL|api|displayName):\s*(.*)$/.exec(body)
    if (m) current[m[1]] = cleanValue(m[2])
  }
  return providers
}

export function normalizeBaseUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '')
}

// 遍历 settings.yaml 里所有 provider，取第一个「公网 HTTPS 且非官方 API」的。
// 顺序即用户在 DSH 里的配置顺序——把想监控的站点 provider 放最前即可。
export function pickDiscoveredProvider(providers) {
  const entries = Object.entries(providers ?? {})
    .map(([name, provider]) => ({ name, ...provider }))
    .filter((p) => p.apiKeyEnv && p.baseURL)
  for (const found of entries) {
    let url
    try {
      url = new URL(normalizeBaseUrl(found.baseURL))
    } catch {
      continue
    }
    if (url.protocol !== 'https:') continue
    if (isPrivateHostname(url.hostname)) continue
    if (isOfficialApiHost(url.hostname)) continue
    return { name: found.name, apiKeyEnv: found.apiKeyEnv, baseUrl: normalizeBaseUrl(found.baseURL) }
  }
  return null
}

export function parseCredentialRefs(text) {
  const refs = {}
  let inRefs = false
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const body = line.trim()
    if (!body || body.startsWith('#')) continue
    const indent = indentOf(line)
    if (indent === 0) {
      inRefs = /^refs:\s*(#.*)?$/.test(body)
      continue
    }
    if (!inRefs) continue
    const m = /^([A-Za-z0-9_]+):\s*(.+)$/.exec(body)
    if (m) refs[m[1]] = cleanValue(m[2])
  }
  return refs
}

function readTextIfExists(path, readText) {
  try {
    return readText(path)
  } catch {
    return null
  }
}

export function discoverWalletCredential({ home = homedir(), readText = (path) => readFileSync(path, 'utf8') } = {}) {
  const settingsText = readTextIfExists(join(home, '.dsh', 'settings.yaml'), readText)
  if (!settingsText) return null
  const pick = pickDiscoveredProvider(parseProvidersFromSettingsYaml(settingsText))
  if (!pick) return null
  const credsText = readTextIfExists(join(home, '.dsh', '.credentials.yaml'), readText)
  if (!credsText) return null
  const refs = parseCredentialRefs(credsText)
  const apiKey = refs[pick.apiKeyEnv]
  if (!apiKey) return null
  return {
    source: 'discovered',
    provider: pick.name,
    apiKeyEnv: pick.apiKeyEnv,
    baseUrl: pick.baseUrl,
    usageUrl: `${pick.baseUrl}/v1/usage`,
    apiKey,
  }
}
