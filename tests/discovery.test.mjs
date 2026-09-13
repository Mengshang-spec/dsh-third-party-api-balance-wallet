import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseProvidersFromSettingsYaml,
  parseCredentialRefs,
  pickDiscoveredProvider,
  discoverWalletCredential,
} from '../src/discovery.mjs'

const SETTINGS_SAMPLE = [
  'ui-onboarding:',
  '  welcomeNoticeVersion: 2026-08-13.1',
  'llm-pi-ai:',
  '  providers:',
  '    chinamodel:',
  '      displayName: chinamodel',
  '      apiKeyEnv: CHINAMODEL_API_KEY',
  '      api: openai-completions',
  "      baseURL: https://cfapi.dieqiyun.top",
  '      models:',
  '        - id: k3',
  '          name: k3',
  '    a:',
  '      apiKeyEnv: A_API_KEY',
  '      api: openai-completions',
  "      baseURL: 'https://cfapi.dieqiyun.top/'",
  '    deepseek1:',
  '      apiKeyEnv: DEEPSEEK1_API_KEY',
  '      api: openai-completions',
  '      baseURL: https://hgapi.dieqiyun.top',
  'dsh-quest-ui:',
  '  questMode: false',
  'llm-deepseek: { models: [], baseURL: https://hgapi.dieqiyun.top }',
].join('\n')

const CREDENTIALS_SAMPLE = [
  'version: 1',
  'refs:',
  '  DEEPSEEK_API_KEY: sk-b8af1111',
  '  CHINAMODEL_API_KEY: "sk-b8af2222"',
  "  A_API_KEY: 'sk-89033333'",
  '  DEEPSEEK1_API_KEY: sk-b8af4444',
  'records:',
  '  client-connection/browser-session:',
  '    kind: grant',
].join('\n')

test('parses the llm-pi-ai providers block only', () => {
  const providers = parseProvidersFromSettingsYaml(SETTINGS_SAMPLE)
  assert.deepEqual(providers.deepseek1, { apiKeyEnv: 'DEEPSEEK1_API_KEY', api: 'openai-completions', baseURL: 'https://hgapi.dieqiyun.top' })
  assert.equal(providers.chinamodel.apiKeyEnv, 'CHINAMODEL_API_KEY')
  assert.equal(providers.a.baseURL, 'https://cfapi.dieqiyun.top/')
  // models 列表项和根级 llm-deepseek 不能被当成 provider
  assert.equal(providers.k3, undefined)
  assert.equal(providers['llm-deepseek'], undefined)
})

test('tolerates CRLF and comments', () => {
  const crlf = parseProvidersFromSettingsYaml(SETTINGS_SAMPLE.replace(/\n/g, '\r\n'))
  assert.equal(crlf.deepseek1.baseURL, 'https://hgapi.dieqiyun.top')
  const commented = parseProvidersFromSettingsYaml('# top\nllm-pi-ai: # inline\n  providers:\n    deepseek1:\n      apiKeyEnv: K # trail\n      baseURL: https://hgapi.dieqiyun.top\n')
  assert.equal(commented.deepseek1.apiKeyEnv, 'K')
})

test('picks the first non-official public provider in config order', () => {
  const providers = parseProvidersFromSettingsYaml(SETTINGS_SAMPLE)
  const pick = pickDiscoveredProvider(providers)
  // chinamodel 在配置里排第一，且是公网 Sub2API 站 → 选中它
  assert.equal(pick.name, 'chinamodel')
  assert.equal(pick.apiKeyEnv, 'CHINAMODEL_API_KEY')
  assert.equal(pick.baseUrl, 'https://cfapi.dieqiyun.top')

  const single = pickDiscoveredProvider({ a: { apiKeyEnv: 'A', baseURL: 'https://cfapi.dieqiyun.top' } })
  assert.equal(single.name, 'a')
})

test('discovers any third-party Sub2API site, not just dieqiyun', () => {
  const pick = pickDiscoveredProvider({
    mysite: { apiKeyEnv: 'MYSITE_API_KEY', baseURL: 'https://api.example.org' },
  })
  assert.equal(pick.name, 'mysite')
  assert.equal(pick.baseUrl, 'https://api.example.org')
})

test('skips official API hosts, private hosts and non-https providers', () => {
  assert.equal(pickDiscoveredProvider({
    official: { apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://api.deepseek.com' },
  }), null)
  assert.equal(pickDiscoveredProvider({
    officialSub: { apiKeyEnv: 'K', baseURL: 'https://sub.api.deepseek.com' },
  }), null)
  assert.equal(pickDiscoveredProvider({
    local: { apiKeyEnv: 'K', baseURL: 'https://192.168.1.10:3000' },
  }), null)
  assert.equal(pickDiscoveredProvider({
    plain: { apiKeyEnv: 'K', baseURL: 'http://api.example.org' },
  }), null)
  // 官方站在前、第三方站在后 → 跳过官方站，命中第三方站
  const pick = pickDiscoveredProvider({
    official: { apiKeyEnv: 'DEEPSEEK_API_KEY', baseURL: 'https://api.deepseek.com' },
    third: { apiKeyEnv: 'THIRD_API_KEY', baseURL: 'https://api.example.org' },
  })
  assert.equal(pick.name, 'third')

  assert.equal(pickDiscoveredProvider({ broken: { apiKeyEnv: 'X', baseURL: '::not-a-url::' } }), null)
  assert.equal(pickDiscoveredProvider({ missingEnv: { baseURL: 'https://api.example.org' } }), null)
  assert.equal(pickDiscoveredProvider({}), null)
})

test('parses credential refs and stops at the next root key', () => {
  const refs = parseCredentialRefs(CREDENTIALS_SAMPLE)
  assert.equal(refs.DEEPSEEK1_API_KEY, 'sk-b8af4444')
  assert.equal(refs.CHINAMODEL_API_KEY, 'sk-b8af2222')
  assert.equal(refs.A_API_KEY, 'sk-89033333')
  assert.equal(refs.records, undefined)
  assert.equal(refs['client-connection/browser-session'], undefined)
})

test('discovers the credential end to end from injected files', () => {
  const files = new Map([
    ['/home/u/.dsh/settings.yaml', SETTINGS_SAMPLE],
    ['/home/u/.dsh/.credentials.yaml', CREDENTIALS_SAMPLE],
  ])
  const readText = (path) => {
    if (files.has(path.replace(/\\/g, '/'))) return files.get(path.replace(/\\/g, '/'))
    throw new Error('ENOENT')
  }
  const found = discoverWalletCredential({ home: '/home/u', readText })
  assert.equal(found.source, 'discovered')
  // chinamodel 在配置里排第一
  assert.equal(found.provider, 'chinamodel')
  assert.equal(found.apiKeyEnv, 'CHINAMODEL_API_KEY')
  assert.equal(found.apiKey, 'sk-b8af2222')
  assert.equal(found.usageUrl, 'https://cfapi.dieqiyun.top/v1/usage')
})

test('returns null instead of throwing on missing files or missing refs', () => {
  const readText = () => { throw new Error('ENOENT') }
  assert.equal(discoverWalletCredential({ home: '/home/none', readText }), null)

  const onlySettings = new Map([
    ['/home/u/.dsh/settings.yaml', SETTINGS_SAMPLE],
  ])
  assert.equal(discoverWalletCredential({ home: '/home/u', readText: (p) => { const v = onlySettings.get(p.replace(/\\/g, '/')); if (v === undefined) throw new Error('ENOENT'); return v } }), null)

  const wrongEnv = new Map([
    ['/home/u/.dsh/settings.yaml', SETTINGS_SAMPLE],
    ['/home/u/.dsh/.credentials.yaml', 'refs:\n  OTHER_KEY: sk-x\n'],
  ])
  assert.equal(discoverWalletCredential({ home: '/home/u', readText: (p) => { const v = wrongEnv.get(p.replace(/\\/g, '/')); if (v === undefined) throw new Error('ENOENT'); return v } }), null)
})
