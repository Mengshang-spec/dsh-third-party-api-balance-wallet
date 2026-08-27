window.__ModuleLoader__.load({
  id: '@dsh-external/dsh-wallet-switcher',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const ROUTE = '/api/dsh-wallet-switcher/balance'
    const KEY = 'dsh-wallet-switcher-config-v2'
    const DEFAULTS = {
      balanceUrl: 'https://hgapi.dieqiyun.top/api/v1/auth/me?timezone=Asia%2FShanghai',
      accessToken: '',
    }

    function load() {
      try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...DEFAULTS } }
    }

    function BalanceDock() {
      const [config, setConfig] = React.useState(load)
      const [draft, setDraft] = React.useState(load)
      const [editing, setEditing] = React.useState(() => !load().accessToken)
      const [state, setState] = React.useState({ loading: false })
      const check = React.useCallback(async () => {
        if (!config.accessToken) { setEditing(true); return }
        setState({ loading: true })
        try {
          const response = await fetch(ROUTE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(config), cache: 'no-store' })
          const value = await response.json()
          if (!response.ok || !value.ok) throw new Error(value.error || `HTTP ${response.status}`)
          setState({ loading: false, ...value })
        } catch (error) { setState({ loading: false, error: error?.message || String(error) }) }
      }, [config])
      React.useEffect(() => { if (config.accessToken) void check() }, [check, config.accessToken])
      const save = () => {
        const next = { balanceUrl: draft.balanceUrl.trim() || DEFAULTS.balanceUrl, accessToken: draft.accessToken.trim() }
        localStorage.setItem(KEY, JSON.stringify(next))
        setConfig(next)
        setEditing(false)
      }
      const style = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }
      if (editing) return h('span', { style },
        h('input', { value: draft.balanceUrl, placeholder: '余额接口地址', title: '默认使用楪祈云账户余额接口', onChange: e => setDraft({ ...draft, balanceUrl: e.target.value }) }),
        h('input', { type: 'password', value: draft.accessToken, placeholder: '网页登录令牌', title: '填 F12 的 Authorization 令牌，不是 sk- API Key', onChange: e => setDraft({ ...draft, accessToken: e.target.value }) }),
        h('button', { type: 'button', onClick: save }, '保存'),
        h('button', { type: 'button', onClick: () => setEditing(false) }, '取消'),
      )
      if (state.loading) return h('span', { style, title: '正在查询余额' }, '余额查询中…')
      if (state.error) return h('span', { style, title: state.error }, '查询失败', h('button', { type: 'button', onClick: () => void check(), title: '重试' }, '刷新'), h('button', { type: 'button', onClick: () => { setDraft(config); setEditing(true) }, title: '修改令牌' }, '设置'))
      if (state.balance === undefined) return h('span', { style }, '余额未配置', h('button', { type: 'button', onClick: () => setEditing(true) }, '配置'))
      return h('span', { style, title: '网页登录令牌余额' }, `${state.balance} CNY`, h('button', { type: 'button', onClick: () => void check(), title: '刷新余额' }, '刷新'), h('button', { type: 'button', onClick: () => { setDraft(config); setEditing(true) }, title: '修改令牌' }, '设置'))
    }

    function apply(ctx) {
      const register = () => ctx.slots.register({ name: 'conversation.composer.dock', id: 'dsh-wallet-switcher', order: 110 }, BalanceDock)
      if (typeof ctx.slots.inject === 'function') ctx.slots.inject('conversation.composer.dock', register, 'dsh-wallet-switcher: composer dock')
      else register()
    }
    return { apply, inject: ['slots'] }
  },
})
