# 安装与使用

## 安装

在 DSH 中运行：

```text
dsh plugin --profile web add github:Mengshang-spec/dsh-third-party-api-balance-wallet
```

重启 DSH 后，输入框底部会出现“钱包余额”。

## 配置

- **零配置（推荐）**：只要 `~/.dsh/settings.yaml` 里有指向楪祈云的 provider（含 `apiKeyEnv`），且 `~/.dsh/.credentials.yaml` 的 `refs` 里有对应的 `sk-` Key，插件会自动发现，无需任何输入。
- **手动**：自动发现不可用时面板会自动弹出配置；也可以点齿轮打开。粘贴 `sk-` 开头的 API Key 保存，Key 保存在宿主侧 `<profileDir>/dsh-wallet-switcher/settings.json`。
- 可选填写“货币单位”，显示在余额后面；余额数字的单位以服务商面板为准。

## 查询与刷新

- 插件每 30 分钟自动查询一次，启动后也会立即查一次；
- 悬停余额可看今日花费（折后/原价）、请求数、Token 数、账户模式；
- 点 ↻ 立即刷新；点 ⚙ 打开设置（可清除已保存的 Key）。

## 余额接口

默认请求 `https://hgapi.dieqiyun.top/v1/usage`（Authorization: Bearer sk-...）。其他站点要求公网 HTTPS 且响应 JSON 含 `balance` 字段。网页登录令牌已不再支持。
