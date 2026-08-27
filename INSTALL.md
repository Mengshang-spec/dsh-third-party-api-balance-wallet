# 安装与使用

## 安装

在 DSH 中运行：

```text
dsh plugin --profile web add github:Mengshang-spec/dsh-third-party-api-balance-wallet
```

重启 DSH 后，输入框底部会出现“钱包余额”。点齿轮，默认地址保持不动，只粘贴网页登录令牌并保存。

## 查令牌

登录目标站点，按 `F12` → “网络 / Network” → “Fetch/XHR”，刷新页面。打开账户信息请求，在“标头 / Headers”里找到“请求标头 / Request Headers”的 `Authorization`，复制 `Bearer` 后面的内容。

余额请求的 JSON 必须包含 `data.balance` 或顶层 `balance`。以楪祈云为例，默认地址是 `/api/v1/auth/me`；`/api/v1/subscriptions/active` 是订阅列表，不能使用。
