# dsh-third-party-api-balance-wallet

在 DSH 输入框底部显示第三方 API 账户余额和今日用量的插件。

插件面向使用 **Sub2API** 搭建的站点，默认查询：

```text
GET https://hgapi.dieqiyun.top/v1/usage
Authorization: Bearer sk-...
```

它使用长期 `sk-` API Key，不使用网页登录会话，因此不会因为网页登录 JWT 的 24 小时有效期而每天要求重新粘贴令牌。

当前版本：`0.3.1`

## 功能

- 显示账户余额；
- 显示 Key 是否有效和账户模式；
- 鼠标悬停查看今日请求数、Token 数、原价和折后实付；
- 启动后立即查询，之后每 30 分钟自动刷新；
- 支持 Sub2API 站点的自动发现和手动配置；
- API Key 只保存在 DSH 宿主侧，浏览器不保存完整 Key；
- 余额 URL 强制使用公网 HTTPS，拒绝本机和内网地址。

## 安装

在 DSH 中运行：

```text
dsh plugin --profile web add github:Mengshang-spec/dsh-third-party-api-balance-wallet
```

安装或升级后重启 DSH，让宿主和浏览器端插件重新加载。

## 推荐用法：零配置自动发现

如果 DSH 已经配置了目标站点的模型 provider，插件可以自动找到余额地址和 Key：

1. `~/.dsh/settings.yaml` 中的 provider 有 `baseURL` 和 `apiKeyEnv`；
2. `~/.dsh/.credentials.yaml` 的 `refs` 中有对应的 `apiKeyEnv`；
3. API Key 通常以 `sk-` 开头。

插件会按 `settings.yaml` 中 provider 的顺序，选择第一个满足以下条件的 provider：

- `baseURL` 是公网 HTTPS 地址；
- 不是 DeepSeek、OpenAI 等官方模型 API 地址；
- 有对应的 `apiKeyEnv` 和凭据。

自动发现后，插件会查询：

```text
{provider.baseURL}/v1/usage
```

因此，只要第三方站点是 Sub2API，并且已经作为 DSH provider 配置好，通常不需要在插件面板中填写任何内容。

## 手动配置

自动发现失败时，点击余额面板右侧的设置按钮（齿轮）。

### API Key

填写目标站点的长期 API Key，例如：

```text
sk-xxxxxxxxxxxxxxxx
```

不要填写浏览器开发者工具中看到的网页登录 JWT，也不要填写 `Authorization: Bearer eyJ...` 这一类网页登录令牌。

### 余额接口地址

Sub2API 站点通常填写：

```text
https://你的站点/v1/usage
```

例如：

```text
https://hgapi.dieqiyun.top/v1/usage
https://cfapi.dieqiyun.top/v1/usage
```

填入后点击“保存”。Key 会保存到 DSH profile 下的：

```text
<DSH_PROFILE_DIR>/dsh-wallet-switcher/settings.json
```

如果没有设置 `DSH_PROFILE_DIR`，默认位置是：

```text
~/.dsh/profiles/web/dsh-wallet-switcher/settings.json
```

### 货币单位

“货币单位”是可选项，可以填写 `USD`、`CNY`、`$` 或 `¥`。插件不会自行换算金额，单位应以服务商面板显示为准。

## Sub2API 通用性

对于标准 Sub2API 站点，插件假定余额接口返回类似结构：

```json
{
  "balance": 61.41163914,
  "isValid": true,
  "mode": "unrestricted",
  "daily_usage": [
    {
      "date": "2026-09-13",
      "requests": 46,
      "total_tokens": 6244709,
      "cost": 8.7992584,
      "actual_cost": 2.1998146
    }
  ]
}
```

插件也兼容余额字段：

```text
balance
remaining
quota.remaining
```

如果站点不是 Sub2API，接口路径或返回字段可能不同，不能保证直接兼容。

## 环境变量

也可以在启动 DSH 前设置：

```powershell
$env:DSH_WALLET_USAGE_URL = 'https://hgapi.dieqiyun.top/v1/usage'
$env:DSH_WALLET_API_KEY = 'sk-xxxxxxxxxxxxxxxx'
$env:DSH_WALLET_CURRENCY = 'USD'
```

配置优先级从高到低：

```text
插件面板保存的 settings.json
> DSH_WALLET_* 环境变量或插件配置
> DSH provider 自动发现
> 旧 accessToken 配置（仅当值本身是 sk- Key）
> 默认 https://hgapi.dieqiyun.top/v1/usage
```

## 查询失败排查

### API Key 无效（401/403）

确认 Key 属于当前余额接口对应的站点。不同站点的 Key 不一定通用。不要把网页登录 JWT 当成 API Key。

### 余额接口不存在（404）

确认地址是否是：

```text
https://站点/v1/usage
```

不要填写订阅列表接口、模型聊天接口或网页账户接口。

### 查询过于频繁（429）

等待一段时间后再刷新。插件默认每 30 分钟查询一次，不会高频重试。

### 地址被拒绝

插件只允许公网 HTTPS 地址，以下地址会被拒绝：

- `http://` 地址；
- `localhost`、`127.0.0.1`；
- `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16` 等内网地址；
- URL 中带用户名或密码的地址。

这是为了避免 DSH 宿主被当作 SSRF 请求跳板。

## 安全说明

- 浏览器端不再把 API Key 写入 `localStorage`；升级时会清理 0.2.x 遗留的旧凭据；
- 浏览器只收到余额、用量和打码后的 Key，不会收到完整 API Key；
- 错误响应不会包含完整 Key；
- 不要把 API Key 提交到 Git、截图或聊天记录；
- Key 泄露后，请在对应服务商面板中撤销或重新生成。

## 开发检查

```powershell
npm test
npm run check
```

当前测试覆盖余额解析、URL 安全校验、DSH 配置自动发现、宿主路由、凭据持久化和浏览器端轮询逻辑。
