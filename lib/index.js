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
    const LEGACY_DEFAULT_URLS = new Set([
      'https://hgapi.dieqiyun.top/api/v1/me?timezone=Asia%2FShanghai',
      'https://hgapi.dieqiyun.top/api/v1/subscriptions/active?timezone=Asia%2FShanghai',
    ])

    function load() {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
        const next = { ...DEFAULTS, ...saved }
        if (LEGACY_DEFAULT_URLS.has(next.balanceUrl)) next.balanceUrl = DEFAULTS.balanceUrl
        return next
      } catch { return { ...DEFAULTS } }
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
      const styles = {
        dock: {
          display: 'inline-flex',
          alignItems: 'stretch',
          gap: 8,
          padding: '6px 8px',
          boxSizing: 'border-box',
          maxWidth: 'min(100%, 520px)',
          color: 'var(--dsh-text-primary, #1f1f1f)',
          background: 'var(--dsh-surface-elevated, #ffffff)',
          border: '1px solid var(--dsh-border-subtle, #d9d9d9)',
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.4,
        },
        row: { display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 },
        label: { color: 'var(--dsh-text-secondary, #6b6b6b)', whiteSpace: 'nowrap' },
        value: { fontWeight: 600, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
        actions: { display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 'auto' },
        iconButton: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          padding: 0,
          color: 'var(--dsh-text-secondary, #5f6368)',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 15,
          lineHeight: 1,
        },
        config: { width: 'min(360px, 100%)', flexDirection: 'column', gap: 8 },
        configTitle: { fontWeight: 600, fontSize: 13 },
        field: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
        fieldLabel: { color: 'var(--dsh-text-secondary, #6b6b6b)' },
        input: {
          width: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
          padding: '6px 8px',
          color: 'var(--dsh-text-primary, #1f1f1f)',
          background: 'var(--dsh-input-bg, #ffffff)',
          border: '1px solid var(--dsh-border-subtle, #cfcfcf)',
          borderRadius: 4,
          font: 'inherit',
        },
        actionsRow: { display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 2 },
        textButton: {
          padding: '5px 10px',
          color: 'var(--dsh-text-primary, #1f1f1f)',
          background: 'var(--dsh-button-secondary, #f3f3f3)',
          border: '1px solid var(--dsh-border-subtle, #d9d9d9)',
          borderRadius: 4,
          cursor: 'pointer',
          font: 'inherit',
        },
        primaryButton: {
          padding: '5px 10px',
          color: 'var(--dsh-button-primary-text, #ffffff)',
          background: 'var(--dsh-button-primary, #4a4a4a)',
          border: '1px solid var(--dsh-button-primary, #4a4a4a)',
          borderRadius: 4,
          cursor: 'pointer',
          font: 'inherit',
        },
      }
      const openSettings = () => { setDraft(config); setEditing(true) }
      const iconButton = (label, title, onClick, icon) => h('button', { type: 'button', className: 'dsh-wallet-dock__icon-button', 'aria-label': label, title, onClick, style: styles.iconButton }, icon)
      if (editing) return h('div', { className: 'dsh-wallet-dock dsh-wallet-dock__config', style: { ...styles.dock, ...styles.config } },
        h('div', { className: 'dsh-wallet-dock__title', style: styles.configTitle }, '钱包余额'),
        h('label', { className: 'dsh-wallet-dock__field', style: styles.field },
          h('span', { style: styles.fieldLabel }, '余额接口地址'),
          h('input', { value: draft.balanceUrl, 'aria-label': '余额接口地址', placeholder: '默认地址已填好', title: '默认使用楪祈云账户余额接口；只有其他站点才需要改', onChange: e => setDraft({ ...draft, balanceUrl: e.target.value }), style: styles.input }),
        ),
        h('label', { className: 'dsh-wallet-dock__field', style: styles.field },
          h('span', { style: styles.fieldLabel }, '网页登录令牌'),
          h('input', { type: 'password', value: draft.accessToken, 'aria-label': '网页登录令牌', placeholder: '粘贴 Bearer 令牌', title: '填 F12 的 Authorization 令牌，不是 sk- API Key', onChange: e => setDraft({ ...draft, accessToken: e.target.value }), style: styles.input }),
        ),
        h('div', { className: 'dsh-wallet-dock__actions', style: styles.actionsRow },
          h('button', { type: 'button', onClick: save, style: styles.primaryButton }, '保存'),
          h('button', { type: 'button', onClick: () => setEditing(false), style: styles.textButton }, '取消'),
        ),
      )
      if (state.loading) return h('div', { className: 'dsh-wallet-dock', style: styles.dock, title: '正在查询余额' }, h('span', { style: styles.label }, '余额'), h('span', { style: styles.value }, '查询中...'))
      if (state.error) return h('div', { className: 'dsh-wallet-dock', style: styles.dock, title: state.error },
        h('div', { className: 'dsh-wallet-dock__row', style: styles.row }, h('span', { style: styles.label }, '余额'), h('span', { style: { ...styles.value, color: 'var(--dsh-danger, #b42318)' } }, '查询失败')),
        h('div', { className: 'dsh-wallet-dock__actions', style: styles.actions }, iconButton('刷新余额', '刷新余额', () => void check(), '↻'), iconButton('修改令牌', '修改令牌', openSettings, '⚙')),
      )
      if (state.balance === undefined) return h('div', { className: 'dsh-wallet-dock', style: styles.dock },
        h('span', { style: styles.label }, '钱包余额未配置'),
        h('button', { type: 'button', onClick: () => setEditing(true), style: styles.textButton }, '配置'),
      )
      return h('div', { className: 'dsh-wallet-dock', style: styles.dock, title: '网页登录令牌余额' },
        h('div', { className: 'dsh-wallet-dock__row', style: styles.row }, h('span', { style: styles.label }, '余额'), h('strong', { style: styles.value }, `${state.balance} CNY`)),
        h('div', { className: 'dsh-wallet-dock__actions', style: styles.actions }, iconButton('刷新余额', '刷新余额', () => void check(), '↻'), iconButton('修改令牌', '修改令牌', openSettings, '⚙')),
      )
    }

    function apply(ctx) {
      const register = () => ctx.slots.register({ name: 'conversation.composer.dock', id: 'dsh-wallet-switcher', order: 110 }, BalanceDock)
      if (typeof ctx.slots.inject === 'function') ctx.slots.inject('conversation.composer.dock', register, 'dsh-wallet-switcher: composer dock')
      else register()
    }
    return { apply, inject: ['slots'] }
  },
})
