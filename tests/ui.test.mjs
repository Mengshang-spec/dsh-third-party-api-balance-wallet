import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

async function loadClient() {
  return readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
}

test('client keeps the compact DSH dock and accessible controls', async () => {
  const ui = await loadClient()
  assert.match(ui, /dsh-wallet-dock/)
  assert.match(ui, /dsh-wallet-dock__config/)
  assert.match(ui, /'aria-label': '余额接口地址'/)
  assert.match(ui, /'aria-label': 'API Key'/)
  assert.match(ui, /'aria-label': '货币单位'/)
  assert.match(ui, /iconButton\('刷新余额', '刷新余额'/)
  assert.match(ui, /iconButton\('打开设置', '打开设置'/)
})

test('client talks to the host routes instead of holding credentials', async () => {
  const ui = await loadClient()
  assert.match(ui, /const ROUTE = '\/api\/dsh-wallet-switcher\/balance'/)
  assert.match(ui, /const CONFIG_ROUTE = '\/api\/dsh-wallet-switcher\/config'/)
  assert.match(ui, /getJson\(ROUTE\)/)
  assert.match(ui, /postJson\(CONFIG_ROUTE/)
  // 凭据不再进浏览器存储：旧 Key 必须清除，也不允许再写 localStorage
  assert.match(ui, /removeItem\('dsh-wallet-switcher-config-v2'\)/)
  assert.doesNotMatch(ui, /localStorage\.setItem/)
  assert.doesNotMatch(ui, /accessToken/)
  assert.doesNotMatch(ui, /网页登录令牌/)
})

test('client polls on the 30 minute cadence and shows today usage on hover', async () => {
  const ui = await loadClient()
  assert.match(ui, /const POLL_MS = 30 \* 60 \* 1000/)
  assert.match(ui, /setInterval/)
  assert.match(ui, /clearInterval\(timer\)/)
  assert.match(ui, /今日花费/)
  assert.match(ui, /今日暂无用量/)
  assert.match(ui, /API Key 无效/)
  assert.match(ui, /DSH 自动发现/)
  assert.match(ui, /余额单位以服务商面板为准/)
})
