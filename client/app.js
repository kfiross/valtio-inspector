/* ── State ── */
let stateTree = {}
let historyLog = []
let selectedStore = null
let selectedHistoryId = null
let activeTab = 'tree'
let collapsedPaths = new Set()
let lastDiff = {}
let allExpanded = true

/* ── WebSocket ── */
const wsUrl = `ws://${location.host}`
let ws

function connect() {
  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    setStatus(true)
  }

  ws.onclose = () => {
    setStatus(false)
    setTimeout(connect, 2000)
  }

  ws.onerror = () => {
    setStatus(false)
  }

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)

    if (msg.type === 'INIT') {
      stateTree = msg.state || {}
      historyLog = msg.history || []
      renderAll()
    }

    if (msg.type === 'STATE_UPDATE') {
      stateTree = msg.state
      if (msg.entry) {
        historyLog.push(msg.entry)
        if (historyLog.length > 100) historyLog.shift()
        if (msg.entry.store === selectedStore && msg.entry.diff) {
          lastDiff[selectedStore] = msg.entry.diff
        }
      }
      flashStore(msg.entry?.store)
      renderAll()
    }

    if (msg.type === 'CLEAR') {
      stateTree = {}
      historyLog = []
      selectedStore = null
      selectedHistoryId = null
      lastDiff = {}
      renderAll()
    }
  }
}

function setStatus(connected) {
  const pill = document.getElementById('status-pill')
  const text = document.getElementById('status-text')
  pill.className = 'status-pill' + (connected ? ' connected' : '')
  text.textContent = connected ? 'connected' : 'disconnected'
}

function collapseAll() {
  function addCollapsedChildren(obj, basePath) {
    if (!obj || typeof obj !== 'object') return

    for (const key of Object.keys(obj)) {
      const path = `${basePath}.${key}`
      collapsedPaths.add(path)

      addCollapsedChildren(obj[key], path)
    }
  }

  collapsedPaths = new Set()

  for (const key of Object.keys(stateTree)) {
    const rootValue = stateTree[key]
    addCollapsedChildren(rootValue, key)
  }

  renderMain()
}

function expandAll() {
  collapsedPaths = new Set()
  renderMain()
}

function getAllPaths(obj, base = '') {
  const paths = []

  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const path = base ? `${base}.${key}` : key
      paths.push(path)
      paths.push(...getAllPaths(obj[key], path))
    }
  }

  return paths
}

/* ── Render all ── */
function renderAll() {
  renderSidebar()
  renderMain()
  renderHistory()
}

/* ── Sidebar ── */
const storeColors = ['#7c6af7', '#56e0a0', '#f7a26a', '#f06c8a', '#7ec8e3', '#c8e37e']
function storeColor(name) {
  let hash = 0
  for (let c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return storeColors[Math.abs(hash) % storeColors.length]
}

function renderSidebar() {
  const list = document.getElementById('store-list')
  // Sort stores alphabetically
  const stores = Object.keys(stateTree).sort((a, b) => a.localeCompare(b))


  if (stores.length === 0) {
    list.innerHTML = ''
    return
  }

  list.innerHTML = stores.map(name => {
    const color = storeColor(name)
    const initial = name[0].toUpperCase()
    const active = name === selectedStore ? ' active' : ''
    return `
      <div class="store-item${active}" onclick="selectStore('${name}')">
        <div class="store-icon" style="color:${color};border:1px solid ${color}33">${initial}</div>
        <span class="store-name">${name}</span>
        <div class="store-flash" id="flash-${name}"></div>
      </div>`
  }).join('')
}

function flashStore(name) {
  if (!name) return
  setTimeout(() => {
    const el = document.getElementById(`flash-${name}`)
    if (el) {
      el.parentElement.classList.remove('flash')
      void el.parentElement.offsetWidth
      el.parentElement.classList.add('flash')
    }
  }, 0)
}

function selectStore(name) {
  selectedStore = name
  selectedHistoryId = null
  renderAll()
}

/* ── Main panel ── */
function renderMain() {
  const title = document.getElementById('main-title')
  const tag = document.getElementById('main-tag')
  const emptyState = document.getElementById('empty-state')
  const treeView = document.getElementById('tree-view')
  const rawView = document.getElementById('raw-view')
  const diffView = document.getElementById('diff-view')

  const hasStores = Object.keys(stateTree).length > 0

  if (!selectedStore || !stateTree[selectedStore]) {
    emptyState.style.display = hasStores ? '' : ''
    treeView.style.display = 'none'
    rawView.style.display = 'none'
    diffView.style.display = 'none'
    emptyState.style.display = ''
    title.textContent = '—'
    tag.textContent = 'no store selected'
    return
  }

  const data = selectedHistoryId != null
    ? (historyLog.find(h => h.id === selectedHistoryId)?.state?.[selectedStore] ?? stateTree[selectedStore])
    : stateTree[selectedStore]

  title.textContent = selectedStore
  tag.textContent = selectedHistoryId != null ? `time travel #${selectedHistoryId}` : 'live'
  tag.style.color = selectedHistoryId != null ? 'var(--accent3)' : 'var(--text-dim)'

  emptyState.style.display = 'none'
  treeView.style.display = activeTab === 'tree' ? '' : 'none'
  rawView.style.display = activeTab === 'raw' ? '' : 'none'
  diffView.style.display = activeTab === 'diff' ? '' : 'none'

  if (activeTab === 'tree') {
    treeView.innerHTML = ''
    treeView.appendChild(renderJsonTree(data, selectedStore))
  } else if (activeTab === 'raw') {
    document.getElementById('raw-content').textContent = JSON.stringify(data, null, 2)
  } else if (activeTab === 'diff') {
    renderDiffView(diffView, lastDiff[selectedStore] || {})
  }
}

/* ── JSON Tree ── */
function renderJsonTree(value, path) {
  const wrap = document.createElement('div')
  wrap.className = 'json-tree'
  buildNode(wrap, value, null, path, 0)
  return wrap
}

function buildNode(parent, value, key, path, depth) {
  const type = typeof value
  const row = document.createElement('div')
  row.className = 'json-row'

  const isObj = value !== null && type === 'object'
  const isArr = Array.isArray(value)
  const childCount = isObj ? Object.keys(value).length : 0

  if (isObj && childCount > 0) {
    const collapsed = collapsedPaths.has(path)
    const toggle = document.createElement('span')
    toggle.className = 'json-collapse'
    toggle.textContent = collapsed ? '▶' : '▼'
    toggle.onclick = () => {
      if (collapsedPaths.has(path)) collapsedPaths.delete(path)
      else collapsedPaths.add(path)
      renderMain()
    }
    row.appendChild(toggle)
    if (key !== null) {
      const k = document.createElement('span')
      k.className = 'json-key'
      k.textContent = JSON.stringify(key)
      row.appendChild(k)
      row.appendChild(makeSpan('json-colon', ': '))
    }
    row.appendChild(makeSpan('', isArr ? `[${childCount}]` : `{${childCount}}`))
    row.style.color = 'var(--text-dim)'
    parent.appendChild(row)

    if (!collapsed) {
      const kids = document.createElement('div')
      kids.className = 'json-children'
      // Sort the keys alphabetically before mapping to buildNode
      const keys = Object.keys(value).sort((a, b) => a.localeCompare(b))

      for (const k2 of keys) {
        const v2 = value[k2]
        buildNode(kids, v2, k2, `${path}.${k2}`, depth + 1)
      }
      parent.appendChild(kids)
    }
  } else {
    const spacer = document.createElement('span')
    spacer.style.display = 'inline-block'
    spacer.style.width = '14px'
    row.appendChild(spacer)

    if (key !== null) {
      row.appendChild(makeSpan('json-key', JSON.stringify(key)))
      row.appendChild(makeSpan('json-colon', ': '))
    }

    if (value === null) {
      row.appendChild(makeSpan('json-null', 'null'))
    } else if (type === 'string') {
      row.appendChild(makeSpan('json-string', JSON.stringify(value)))
    } else if (type === 'number') {
      row.appendChild(makeSpan('json-number', String(value)))
    } else if (type === 'boolean') {
      row.appendChild(makeSpan('json-bool', String(value)))
    } else {
      row.appendChild(makeSpan('', '{}'))
    }
    parent.appendChild(row)
  }
}

function makeSpan(cls, text) {
  const s = document.createElement('span')
  if (cls) s.className = cls
  s.textContent = text
  return s
}

/* ── Diff view ── */
function renderDiffView(container, diff) {
  container.innerHTML = ''
  if (!diff || Object.keys(diff).length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = '<div class="big">≈</div><div class="hint">No diff recorded yet.<br>Change a store value to see what changed.</div>'
    container.appendChild(empty)
    return
  }

  for (const [key, change] of Object.entries(diff)) {
    const line = document.createElement('div')
    line.className = 'diff-line changed'
    line.innerHTML = `
      <span class="diff-key">${key}</span>
      <span class="diff-arrow">:</span>
      <span class="diff-old">${JSON.stringify(change.from)}</span>
      <span class="diff-arrow">→</span>
      <span class="diff-new">${JSON.stringify(change.to)}</span>
    `
    container.appendChild(line)
  }
}

/* ── History panel ── */
function renderHistory() {
  const list = document.getElementById('history-list')
  const count = document.getElementById('history-count')
  count.textContent = historyLog.length

  if (historyLog.length === 0) {
    list.innerHTML = '<div style="padding:12px 14px;color:var(--text-dim);font-size:11px">No history yet</div>'
    return
  }

  list.innerHTML = [...historyLog].reverse().map(entry => {
    const active = entry.id === selectedHistoryId ? ' active' : ''
    const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 2 })
    const pills = entry.diff ? Object.entries(entry.diff).slice(0, 4).map(([k]) =>
      `<span class="hist-pill change">${k}</span>`
    ).join('') : ''
    return `
      <div class="hist-item${active}" onclick="selectHistory(${entry.id})">
        <span class="hist-store">${entry.store}</span>
        <span class="hist-time">${time}</span>
        ${pills ? `<div class="hist-diff-pills">${pills}</div>` : ''}
      </div>`
  }).join('')
}

function selectHistory(id) {
  if (selectedHistoryId === id) {
    selectedHistoryId = null
  } else {
    selectedHistoryId = id
    const entry = historyLog.find(h => h.id === id)
    if (entry) selectedStore = entry.store
  }
  renderAll()
}

/* ── Tabs ── */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    activeTab = tab.dataset.tab
    renderMain()
  })
})

/* ── Buttons ── */
document.getElementById('btn-clear').addEventListener('click', () => {
  fetch('/state', { method: 'DELETE' }).catch(() => { })
})
document.getElementById('btn-collapse').onclick = collapseAll
document.getElementById('btn-expand').onclick = expandAll

/* ── Boot ── */
connect()
renderAll()
