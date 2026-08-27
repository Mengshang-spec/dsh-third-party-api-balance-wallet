# dsh-wallet-switcher

当前版本：`0.2.4`

这是一个“第三方 API 接入 DSH 查询余额插件”，按原来 CC Switch 的用量脚本方式查询账户余额。

它默认发送的请求为（其他站点可以在设置里改地址）：

```text
GET https://hgapi.dieqiyun.top/api/v1/auth/me?timezone=Asia%2FShanghai
Authorization: Bearer <网页登录令牌>
User-Agent: cc-switch/1.0
```

插件读取返回里的 `data.balance`，显示单位为 `CNY`，同时兼容顶层 `balance`。`/api/v1/subscriptions/active` 只返回订阅列表，不是余额接口。

## 安装后怎么用（最简单）

1. 重启 Harness，让它重新加载插件。
2. 在 Harness 输入框底部找到“钱包余额”，点右侧的设置图标（齿轮）。
3. “余额接口地址”已经自动填好。使用楪祈云时不要改这一栏。
4. 只填写“网页登录令牌”这一栏，然后点“保存”。
5. 从 F12 复制令牌时，复制以下任一种都可以：
   - 只复制 `Bearer eyJ...`；
   - 或复制整行 `Authorization: Bearer eyJ...`。
6. 插件会自动查询；需要再次查询时点刷新图标（↻）。成功后显示 `余额 CNY`。

注意：这里填的是网页登录凭据，不是模型用的 `sk-...` API Key。令牌过期或网页重新登录后，请重新复制并保存。

插件不会把令牌显示在余额结果里。令牌已经在聊天中暴露过的话，请先退出网页并重新登录生成新令牌。

## 用 F12 查其他站点的余额地址和令牌

只有接入其他站点时才需要查。当前楪祈云的默认地址已经能用，不需要重新查。

### 查余额 URL

1. 打开该站点并登录。
2. 按 `F12`，点顶部的“网络 / Network”。
3. 点筛选框，选“Fetch/XHR”。
4. 刷新网页（按 `F5`）。
5. 在请求列表里逐个点开，看右侧“响应 / Response”。只选择 JSON 里有 `data.balance` 或顶层 `balance` 字段的请求。
6. 确认这个请求是“账户信息/余额”，不是“订阅列表/用量列表”。右键请求 → “复制” → “复制 URL”，粘贴到插件的“余额接口地址”。

楪祈云应选择：

```text
https://hgapi.dieqiyun.top/api/v1/auth/me?timezone=Asia%2FShanghai
```

不要选择 `/api/v1/subscriptions/active`，它只返回订阅列表，不返回余额。

### 查网页登录令牌

1. 仍在刚才这个请求的详情页，点“标头 / Headers”。
2. 找“请求标头 / Request Headers”里的 `Authorization`。
3. 复制 `Bearer ` 后面的整段文字，粘贴到插件的“网页登录令牌”。复制整行也可以，插件会自动处理。

不要填模型 API Key（通常以 `sk-` 开头）。这里需要的是登录网页时使用的令牌。

## 查询失败时看这里

- `401`：令牌过期或复制错了，重新登录网页后再复制 `Authorization`。
- `404`：URL 填错，回到 F12 按上面的步骤重新复制“复制 URL”。
- `200` 但提示没有余额：选到了订阅/用量接口，换成响应里包含 `balance` 的账户接口。
- 令牌已在聊天或截图中公开：退出网页并重新登录，让旧令牌失效。

## 环境变量方式

也可以在启动 Harness 前设置：

```powershell
$env:DSH_WALLET_BALANCE_URL = 'https://hgapi.dieqiyun.top/api/v1/auth/me?timezone=Asia%2FShanghai'
$env:DSH_WALLET_ACCESS_TOKEN = '网页登录令牌'
```

## 开发检查

```powershell
npm test
npm run check
```
