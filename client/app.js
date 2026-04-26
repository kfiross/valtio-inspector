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
  ws.onopen = () => setStatus(true)
  ws.onclose = () => {
    setStatus(false)
    setTimeout(connect, 2000)
  }
  ws.onerror = () => setStatus(false)
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
        if (msg.entry.store === selectedStore && selectedHistoryId === null) {
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

/* ── Render Logic ── */
function renderAll() {
  renderSidebar()
  renderMain()
  renderHistory()
}

function selectStore(name) {
  selectedStore = name
  selectedHistoryId = null
  renderAll()
}

function renderSidebar() {
  const list = document.getElementById('store-list')
  const stores = Object.keys(stateTree).sort((a, b) => a.localeCompare(b))
  if (stores.length === 0) { list.innerHTML = ''; return; }

  list.innerHTML = stores.map(name => {
    const color = storeColor(name)
    const active = name === selectedStore ? ' active' : ''
    return `
      <div class="store-item${active}" onclick="selectStore('${name}')">
        <div class="store-icon" style="color:${color};border:1px solid ${color}33">${name[0].toUpperCase()}</div>
        <span class="store-name">${name}</span>
        <div class="store-flash" id="flash-${name}"></div>
      </div>`
  }).join('')
}

/* ── Deep Diff Logic ── */
function renderDiffView(container, diff) {
  container.innerHTML = ''
  
  // We expect 'diff' to be an object where keys are top-level properties
  // and values are { from: ..., to: ... }
  if (!diff || Object.keys(diff).length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="big">≈</div><div class="hint">No changes detected.</div></div>'
    return
  }

  const results = []

  // Recursive walker to find leaf-node differences
  function walk(oldVal, newVal, path) {
    const isOldObj = oldVal !== null && typeof oldVal === 'object'
    const isNewObj = newVal !== null && typeof newVal === 'object'

    if (isOldObj && isNewObj) {
      const allKeys = new Set([...Object.keys(oldVal), ...Object.keys(newVal)])
      for (const key of allKeys) {
        walk(oldVal[key], newVal[key], path ? `${path}.${key}` : key)
      }
    } else if (oldVal !== newVal) {
      results.push({ path, from: oldVal, to: newVal })
    }
  }

  // Generate the deep diff from the provided change object
  for (const [key, change] of Object.entries(diff)) {
    walk(change.from, change.to, key)
  }

  if (results.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="hint">Values are identical.</div></div>'
    return
  }

  results.forEach(res => {
    const line = document.createElement('div')
    line.className = 'diff-line'
    line.style.padding = '6px 10px'
    line.style.fontFamily = 'monospace'
    line.style.borderBottom = '1px solid var(--border-light)'
    
    line.innerHTML = `
      <div style="color: var(--text-dim); font-size: 10px; margin-bottom: 2px;">${res.path}</div>
      <div style="display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;">
        <span style="color: #ff6b6b; background: rgba(255,107,107,0.1); padding: 0 4px; border-radius: 3px; text-decoration: line-through;">${JSON.stringify(res.from)}</span>
        <span style="color: var(--text-dim); font-size: 12px;">→</span>
        <span style="color: #51cf66; background: rgba(81,207,102,0.1); padding: 0 4px; border-radius: 3px; font-weight: bold;">${JSON.stringify(res.to)}</span>
      </div>
    `
    container.appendChild(line)
  })
}

/* ── Main panel ── */
function renderMain() {
  const title = document.getElementById('main-title')
  const tag = document.getElementById('main-tag')
  const emptyState = document.getElementById('empty-state')
  const views = {
    tree: document.getElementById('tree-view'),
    raw: document.getElementById('raw-view'),
    diff: document.getElementById('diff-view')
  }

  if (!selectedStore || !stateTree[selectedStore]) {
    emptyState.style.display = '';
    Object.values(views).forEach(v => v.style.display = 'none')
    title.textContent = '—'; tag.textContent = 'no store selected'
    return
  }

  const historyEntry = selectedHistoryId != null ? historyLog.find(h => h.id === selectedHistoryId) : null
  const data = historyEntry?.state?.[selectedStore] ?? stateTree[selectedStore]
  const activeDiff = historyEntry ? (historyEntry.diff || {}) : (lastDiff[selectedStore] || {})

  title.textContent = selectedStore
  tag.textContent = selectedHistoryId != null ? `time travel #${selectedHistoryId}` : 'live'
  emptyState.style.display = 'none'

  Object.keys(views).forEach(k => views[k].style.display = activeTab === k ? '' : 'none')

  if (activeTab === 'tree') {
    views.tree.innerHTML = ''
    views.tree.appendChild(renderJsonTree(data, selectedStore))
  } else if (activeTab === 'raw') {
    document.getElementById('raw-content').textContent = JSON.stringify(data, null, 2)
  } else if (activeTab === 'diff') {
    renderDiffView(views.diff, activeDiff)
  }
}

/* ── Helpers ── */
function storeColor(name) {
  let hash = 0
  for (let c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  const colors = ['#7c6af7', '#56e0a0', '#f7a26a', '#f06c8a', '#7ec8e3', '#c8e37e']
  return colors[Math.abs(hash) % colors.length]
}

function flashStore(name) {
  if (!name) return
  const el = document.getElementById(`flash-${name}`)
  if (el) {
    el.parentElement.classList.remove('flash')
    void el.parentElement.offsetWidth
    el.parentElement.classList.add('flash')
  }
}

/* ── JSON Tree Rendering ── */
function renderJsonTree(value, path) {
  const wrap = document.createElement('div'); wrap.className = 'json-tree'
  buildNode(wrap, value, null, path, 0)
  return wrap
}

function buildNode(parent, value, key, path, depth) {
  const type = typeof value
  const row = document.createElement('div'); row.className = 'json-row'
  const isObj = value !== null && type === 'object'
  const isArr = Array.isArray(value)

  if (isObj && Object.keys(value).length > 0) {
    const collapsed = collapsedPaths.has(path)
    const toggle = document.createElement('span')
    toggle.className = 'json-collapse'; toggle.textContent = collapsed ? '▶' : '▼'
    toggle.onclick = () => {
      collapsed ? collapsedPaths.delete(path) : collapsedPaths.add(path)
      renderMain()
    }
    row.appendChild(toggle)
    if (key !== null) {
      row.appendChild(makeSpan('json-key', JSON.stringify(key)))
      row.appendChild(makeSpan('json-colon', ': '))
    }
    row.appendChild(makeSpan('', isArr ? `[${Object.keys(value).length}]` : `{${Object.keys(value).length}}`))
    parent.appendChild(row)

    if (!collapsed) {
      const kids = document.createElement('div'); kids.className = 'json-children'
      Object.keys(value).sort().forEach(k => buildNode(kids, value[k], k, `${path}.${k}`, depth + 1))
      parent.appendChild(kids)
    }
  } else {
    row.appendChild(makeSpan('', '  ')) // Spacer
    if (key !== null) {
      row.appendChild(makeSpan('json-key', JSON.stringify(key)))
      row.appendChild(makeSpan('json-colon', ': '))
    }
    const valSpan = value === null ? makeSpan('json-null', 'null') : makeSpan(`json-${type}`, JSON.stringify(value))
    row.appendChild(valSpan)
    parent.appendChild(row)
  }
}

function makeSpan(cls, text) {
  const s = document.createElement('span')
  if (cls) s.className = cls
  s.textContent = text
  return s
}

/* ── History panel ── */
function renderHistory() {
  const list = document.getElementById('history-list')
  const count = document.getElementById('history-count') // Get the counter element

  // 1. Reset count if no store is selected
  if (!selectedStore) {
    if (count) count.textContent = "-"
    list.innerHTML = '<div style="padding:12px 14px;color:var(--text-dim);font-size:11px">Select a store</div>'
    return
  }

  const filtered = historyLog.filter(h => h.store === selectedStore).reverse()
  
  // 2. Update the counter text
  if (count) {
    count.textContent = filtered.length
  }

  if (filtered.length === 0) {
    list.innerHTML = '<div style="padding:12px 14px;color:var(--text-dim);font-size:11px">No history for this store</div>'
    return
  }

  list.innerHTML = filtered.map(entry => {
    const active = entry.id === selectedHistoryId ? ' active' : ''
    const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    })
    
    // Optional: Add the diff pills back if you want them in the sidebar
    const pills = entry.diff ? Object.entries(entry.diff).slice(0, 3).map(([k]) =>
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

async function selectHistory(id) {
  selectedHistoryId = (selectedHistoryId === id) ? null : id
  if (selectedHistoryId) {
    const entry = historyLog.find(h => h.id === id)
    if (entry && !entry.state) {
      try {
        const res = await fetch(`/history/${id}`)
        if (res.ok) { entry.state = (await res.json()).state }
      } catch (e) { console.error(e) }
    }
  }
  renderAll()
}

/* ── Tabs ── */
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active');
    activeTab = tab.dataset.tab
    renderMain()
  })
})

document.getElementById('btn-clear').onclick = () => fetch('/state', { method: 'DELETE' })
document.getElementById('btn-collapse').onclick = () => { collapsedPaths.clear(); renderMain(); }

/* ── Boot ── */
connect()
renderAll()