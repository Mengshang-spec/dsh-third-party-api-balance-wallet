window.__ModuleLoader__.load({
  id: '@dsh-external/dsh-wallet-switcher',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const ROUTE = '/api/dsh-wallet-switcher/balance'
    const CONFIG_ROUTE = '/api/dsh-wallet-switcher/config'
    const POLL_MS = 30 * 60 * 1000
    const DEFAULT_USAGE_URL = 'https://hgapi.dieqiyun.top/v1/usage'
    // 0.2.x 曾把旧令牌存在这里，升级后必须清掉。
    try { localStorage.removeItem('dsh-wallet-switcher-config-v2') } catch { }

    const SOURCE_LABELS = {
      saved: '已保存',
      config: '启动配置',
      discovered: 'DSH 自动发现',
      legacy: '旧配置',
      none: '未配置',
    }

    function fmtMoney(value) {
      const n = Number(value)
      return Number.isFinite(n) ? n.toLocaleString('zh-CN', { maximumFractionDigits: 4 }) : String(value)
    }
    function fmtInt(value) {
      const n = Number(value)
      return Number.isFinite(n) ? n.toLocaleString('zh-CN') : String(value)
    }
    function fmtTokens(value) {
      const n = Number(value)
      if (!Number.isFinite(n)) return String(value)
      if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`
      if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`
      return fmtInt(n)
    }
    function fmtTime(iso) {
      const d = new Date(iso)
      return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }

    async function getJson(url) {
      const response = await fetch(url, { cache: 'no-store' })
      const value = await response.json().catch(() => ({}))
      if (!response.ok || !value.ok) throw new Error(value.error || `HTTP ${response.status}`)
      return value
    }
    async function postJson(url, body) {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
      const value = await response.json().catch(() => ({}))
      if (!response.ok || !value.ok) throw new Error(value.error || `HTTP ${response.status}`)
      return value
    }

    function balanceTooltip(state) {
      const parts = []
      if (state.today) {
        const unit = state.currency ? ` ${state.currency}` : ''
        parts.push(`今日花费 ${fmtMoney(todayValue(state.today.actualCost, state.today.cost))}${unit}（原价 ${fmtMoney(state.today.cost)}）`)
        parts.push(`请求 ${fmtInt(state.today.requests)} 次`)
        parts.push(`Token ${fmtTokens(state.today.totalTokens)}`)
      } else {
        parts.push('今日暂无用量')
      }
      if (state.mode) parts.push(`模式 ${state.mode}`)
      if (state.fetchedAt) parts.push(`更新于 ${fmtTime(state.fetchedAt)}`)
      if (state.source && SOURCE_LABELS[state.source]) parts.push(`Key 来源：${SOURCE_LABELS[state.source]}`)
      parts.push('余额单位以服务商面板为准，可在设置里配置')
      return parts.join(' · ')
    }
    function todayValue(actual, fallback) {
      return Number.isFinite(Number(actual)) ? actual : fallback
    }

    function BalanceDock() {
      const [meta, setMeta] = React.useState(null)
      const [draft, setDraft] = React.useState({ apiKey: '', usageUrl: '', currency: '' })
      const [editing, setEditing] = React.useState(false)
      const [saving, setSaving] = React.useState(false)
      const [state, setState] = React.useState({ loading: true })

      const refreshMeta = React.useCallback(async () => {
        try {
          const next = await getJson(CONFIG_ROUTE)
          setMeta(next)
          setDraft({ apiKey: '', usageUrl: next.usageUrl === DEFAULT_USAGE_URL ? '' : next.usageUrl || '', currency: next.currency || '' })
          return next
        } catch { return null }
      }, [])
      const check = React.useCallback(async () => {
        setState({ loading: true })
        try {
          const value = await getJson(ROUTE)
          setState({ loading: false, ...value })
        } catch (error) {
          setState({ loading: false, error: error?.message || String(error), errorCode: error?.errorCode })
        }
      }, [])

      React.useEffect(() => {
        let alive = true
        void (async () => {
          const next = await refreshMeta()
          if (!alive) return
          if (!next || !next.configured) {
            setEditing(true)
            setState({ loading: false })
            return
          }
          void check()
        })()
        const timer = setInterval(() => { void check() }, POLL_MS)
        return () => { alive = false; clearInterval(timer) }
      }, [check, refreshMeta])

      const save = async () => {
        setSaving(true)
        try {
          const next = await postJson(CONFIG_ROUTE, { apiKey: draft.apiKey.trim(), usageUrl: draft.usageUrl.trim(), currency: draft.currency.trim() })
          setMeta(next)
          setDraft({ apiKey: '', usageUrl: next.usageUrl === DEFAULT_USAGE_URL ? '' : next.usageUrl || '', currency: next.currency || '' })
          setEditing(false)
          if (next.configured) void check()
        } catch (error) {
          setState({ loading: false, error: error?.message || String(error) })
        } finally { setSaving(false) }
      }
      const clearSaved = async () => {
        setSaving(true)
        try {
          const next = await postJson(CONFIG_ROUTE, { resetApiKey: true })
          setMeta(next)
          if (next.configured) void check()
          else { setEditing(true); setState({ loading: false }) }
        } catch (error) {
          setState({ loading: false, error: error?.message || String(error) })
        } finally { setSaving(false) }
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
        config: { width: 'min(380px, 100%)', flexDirection: 'column', gap: 8 },
        configTitle: { fontWeight: 600, fontSize: 13 },
        metaLine: { color: 'var(--dsh-text-secondary, #6b6b6b)', fontSize: 11 },
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

      const openSettings = () => { setDraft({ apiKey: '', usageUrl: meta && meta.usageUrl && meta.usageUrl !== DEFAULT_USAGE_URL ? meta.usageUrl : '', currency: meta?.currency || '' }); setEditing(true) }
      const iconButton = (label, title, onClick, icon) => h('button', { type: 'button', className: 'dsh-wallet-dock__icon-button', 'aria-label': label, title, onClick, style: styles.iconButton }, icon)

      if (editing) return h('div', { className: 'dsh-wallet-dock dsh-wallet-dock__config', style: { ...styles.dock, ...styles.config } },
        h('div', { className: 'dsh-wallet-dock__title', style: styles.configTitle }, '钱包余额'),
        h('div', { className: 'dsh-wallet-dock__meta', style: styles.metaLine },
          meta
            ? `当前 Key：${meta.keyMasked || '（未配置）'} · 来源：${SOURCE_LABELS[meta.source] ?? meta.source}`
            : '正在读取配置...',
        ),
        h('label', { className: 'dsh-wallet-dock__field', style: styles.field },
          h('span', { style: styles.fieldLabel }, 'API Key'),
          h('input', {
            type: 'password',
            value: draft.apiKey,
            'aria-label': 'API Key',
            placeholder: 'sk-...（留空则保持现有 Key）',
            title: '长期 API Key，不会过期；留空则自动使用 DSH 里配置的楪祈云 Key',
            autoComplete: 'off',
            onChange: e => setDraft({ ...draft, apiKey: e.target.value }),
            style: styles.input,
          }),
        ),
        h('label', { className: 'dsh-wallet-dock__field', style: styles.field },
          h('span', { style: styles.fieldLabel }, '余额接口地址'),
          h('input', {
            value: draft.usageUrl,
            'aria-label': '余额接口地址',
            placeholder: `默认 ${DEFAULT_USAGE_URL}`,
            title: `默认使用楪祈云用量接口 ${DEFAULT_USAGE_URL}；只有其他站点才需要改`,
            onChange: e => setDraft({ ...draft, usageUrl: e.target.value }),
            style: styles.input,
          }),
        ),
        h('label', { className: 'dsh-wallet-dock__field', style: styles.field },
          h('span', { style: styles.fieldLabel }, '货币单位'),
          h('input', {
            value: draft.currency,
            'aria-label': '货币单位',
            placeholder: '选填：USD / CNY / ¥ / $',
            title: '余额数字的单位以服务商面板为准；填了才会显示在余额后面',
            onChange: e => setDraft({ ...draft, currency: e.target.value }),
            style: styles.input,
          }),
        ),
        h('div', { className: 'dsh-wallet-dock__actions', style: styles.actionsRow },
          meta?.source === 'saved' ? h('button', { type: 'button', onClick: () => void clearSaved(), disabled: saving, style: styles.textButton }, '清除已保存 Key') : null,
          h('button', { type: 'button', onClick: () => setEditing(false), disabled: saving, style: styles.textButton }, '取消'),
          h('button', { type: 'button', onClick: () => void save(), disabled: saving, style: styles.primaryButton }, '保存'),
        ),
      )

      if (state.loading) return h('div', { className: 'dsh-wallet-dock', style: styles.dock, title: '正在查询余额' }, h('span', { style: styles.label }, '余额'), h('span', { style: styles.value }, '查询中...'))
      if (state.error) {
        const unauthorized = state.errorCode === 'UNAUTHORIZED'
        return h('div', { className: 'dsh-wallet-dock', style: styles.dock, title: state.error },
          h('div', { className: 'dsh-wallet-dock__row', style: styles.row },
            h('span', { style: styles.label }, '余额'),
            h('span', { style: { ...styles.value, color: 'var(--dsh-danger, #b42318)' } }, unauthorized ? 'API Key 无效' : '查询失败'),
          ),
          h('div', { className: 'dsh-wallet-dock__actions', style: styles.actions },
            iconButton('刷新余额', '刷新余额', () => void check(), '↻'),
            iconButton('打开设置', '打开设置', openSettings, '⚙'),
          ),
        )
      }
      if (state.ok === false && state.reason === 'unconfigured') return h('div', { className: 'dsh-wallet-dock', style: styles.dock },
        h('span', { style: styles.label }, '钱包余额未配置'),
        h('button', { type: 'button', onClick: () => setEditing(true), style: styles.textButton }, '配置'),
      )
      const invalid = state.isValid === false
      const unit = state.currency ? ` ${state.currency}` : ''
      return h('div', { className: 'dsh-wallet-dock', style: styles.dock, title: balanceTooltip(state) },
        h('div', { className: 'dsh-wallet-dock__row', style: styles.row },
          h('span', { style: styles.label }, '余额'),
          h('strong', { style: { ...styles.value, ...(invalid ? { color: 'var(--dsh-danger, #b42318)' } : {}) } }, invalid ? 'Key 已失效' : `${fmtMoney(state.balance)}${unit}`),
        ),
        h('div', { className: 'dsh-wallet-dock__actions', style: styles.actions },
          iconButton('刷新余额', '刷新余额', () => void check(), '↻'),
          iconButton('打开设置', '打开设置', openSettings, '⚙'),
        ),
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
