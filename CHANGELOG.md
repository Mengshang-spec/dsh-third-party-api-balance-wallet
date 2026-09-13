# 更新记录

## 0.3.1

- 自动发现不再写死楪祈云域名：信任 `~/.dsh/settings.yaml` 里配置过的所有 provider，按配置顺序取第一个「公网 HTTPS 且非官方 API」的站点作为余额来源——任何 Sub2API 站点都能零配置发现。
- 排除官方 API 域名（api.deepseek.com / api.openai.com 等）与内网地址，避免把非 Sub2API 站点当余额源。

## 0.3.0

- 余额查询改用服务商用量接口 `/v1/usage` + 长期 API Key（Bearer sk-...），不再依赖 24 小时过期的网页登录令牌。
- 解析 `balance` / `isValid` / `mode` / `daily_usage`：面板显示余额，悬停可见今日花费（折后/原价）、请求数、Token 数。
- 凭据收敛到宿主侧：浏览器 `localStorage` 不再保存任何凭据（升级时自动清除 0.2.x 遗留令牌），客户端只拿查询结果。
- 零配置自动发现：从 `~/.dsh/settings.yaml`（provider 的 `apiKeyEnv`/`baseURL`）+ `~/.dsh/.credentials.yaml`（`refs`）读取楪祈云的 API Key。
- 新增配置面板：API Key（宿主侧持久化）、余额接口地址、货币单位（选填，单位以服务商面板为准，不再写死 CNY）。
- 每 30 分钟自动轮询（启动后立即查询一次），失败保留上次数据与错误提示。
- 安全加固：余额 URL 强制公网 HTTPS（拒绝 http/本机/内网/带凭据 URL），错误信息不含 Key，配置接口只返回打码 Key。

### 兼容性

- 旧 `accessToken` 配置仅在值恰为 `sk-` Key 时兜底；网页 JWT 一律拒绝并提示改用 API Key。
- 环境变量新增 `DSH_WALLET_USAGE_URL` / `DSH_WALLET_API_KEY` / `DSH_WALLET_CURRENCY`；旧 `DSH_WALLET_BALANCE_URL` / `DSH_WALLET_ACCESS_TOKEN` 不再读取（后者仅 sk- 兜底）。

## 0.2.4

- 调整余额面板为紧凑的 DSH 风格。
- 为配置输入框和刷新、设置按钮补充清晰标签与提示。
- 完善 F12 查找余额 URL、Authorization 令牌和常见错误的说明。
