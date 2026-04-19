import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import path from 'path'
import cors from 'cors'
import { version } from '../package.json'

export function startServer(port: number = 7777) {
  const app = express()

  app.use(cors({
    origin: 'http://localhost:5173'
  }))

  app.use(express.json({ limit: '5mb' }))

  const server = http.createServer(app)
  const wss = new WebSocketServer({ server })

  interface DiffValue {
    from: any
    to: any
  }

  interface HistoryEntry {
    id: number
    timestamp: number
    store: string
    state: Record<string, any>   // full snapshot of ALL stores at this point
    diff?: Record<string, DiffValue>
  }

  let stateTree: Record<string, any> = {}
  let history: HistoryEntry[] = []
  let historyIdCounter = 0
  const MAX_HISTORY = 100

  // Deep recursive diff — handles nested objects correctly
  function computeDiff(
    prev: Record<string, any> | undefined,
    next: Record<string, any>
  ): Record<string, DiffValue> | null {
    if (!prev) return null

    const diff: Record<string, DiffValue> = {}

    const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)])

    for (const key of allKeys) {
      const prevVal = prev[key]
      const nextVal = next[key]

      // Use stable serialization for comparison
      if (!deepEqual(prevVal, nextVal)) {
        diff[key] = { from: deepClone(prevVal), to: deepClone(nextVal) }
      }
    }
    return Object.keys(diff).length > 0 ? diff : null
  }

  function deepEqual(a: any, b: any): boolean {
    if (a === b) return true
    if (a === null || b === null) return a === b
    if (typeof a !== typeof b) return false
    if (typeof a !== 'object') return a === b
    if (Array.isArray(a) !== Array.isArray(b)) return false

    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false

    return keysA.every(key => deepEqual(a[key], b[key]))
  }

  function deepClone<T>(val: T): T {
    if (val === undefined) return val
    return JSON.parse(JSON.stringify(val))
  }

  function broadcast(payload: object) {
    const msg = JSON.stringify(payload)
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg)
      }
    })
  }

  // POST /state — receive a state update from a store
  app.post('/state', (req, res) => {
    const { store, data } = req.body
    if (!store || data === undefined) {
      res.sendStatus(400)
      return
    }

    const prevStoreState = stateTree[store]
      ? deepClone(stateTree[store])
      : undefined

    // Update live state
    stateTree[store] = deepClone(data)

    const diff = computeDiff(prevStoreState, data)

    // Snapshot the ENTIRE state tree at this moment
    const entry: HistoryEntry = {
      id: ++historyIdCounter,
      timestamp: Date.now(),
      store,
      state: deepClone(stateTree),   // ← fix: full deep clone, not reference
      diff: diff ?? undefined,
    }

    history.push(entry)
    if (history.length > MAX_HISTORY) history.shift()

    broadcast({
      type: 'STATE_UPDATE',
      state: stateTree,
      entry: {
        id: entry.id,
        timestamp: entry.timestamp,
        store,
        diff: entry.diff,
      },
    })

    res.sendStatus(200)
  })

  // GET /state — current live state
  app.get('/state', (_req, res) => res.json(stateTree))

  // DELETE /state — reset everything
  app.delete('/state', (_req, res) => {
    stateTree = {}
    history = []
    historyIdCounter = 0
    broadcast({ type: 'CLEAR' })
    res.sendStatus(200)
  })

  // GET /history — all history entries (without full state snapshot to save bandwidth)
  app.get('/history', (_req, res) => {
    res.json(
      history.map(h => ({
        id: h.id,
        timestamp: h.timestamp,
        store: h.store,
        diff: h.diff,
      }))
    )
  })

  // GET /history/:id — single entry WITH full state snapshot
  app.get('/history/:id', (req, res) => {
    const id = parseInt(req.params.id)
    const entry = history.find(h => h.id === id)
    if (!entry) {
      res.sendStatus(404)
      return
    }
    res.json(entry)
  })

  // POST /history/:id/restore — time-travel: restore state to a past snapshot
  app.post('/history/:id/restore', (req, res) => {
    const id = parseInt(req.params.id)
    const entry = history.find(h => h.id === id)
    if (!entry) {
      res.sendStatus(404)
      return
    }

    // Restore the full state tree to the snapshot
    stateTree = deepClone(entry.state)

    // Record the restore as a new history entry
    const restoreEntry: HistoryEntry = {
      id: ++historyIdCounter,
      timestamp: Date.now(),
      store: '__restore__',
      state: deepClone(stateTree),
      diff: undefined,
    }

    history.push(restoreEntry)
    if (history.length > MAX_HISTORY) history.shift()

    broadcast({
      type: 'TIME_TRAVEL',
      restoredFromId: id,
      state: stateTree,
      entry: {
        id: restoreEntry.id,
        timestamp: restoreEntry.timestamp,
        store: restoreEntry.store,
      },
    })

    res.json({ restoredFromId: id, state: stateTree })
  })

  app.use(express.static(path.join(__dirname, '../client')))

  // WebSocket: send full state + slim history on connect
  wss.on('connection', ws => {
    ws.send(
      JSON.stringify({
        type: 'INIT',
        state: stateTree,
        history: history.map(h => ({
          id: h.id,
          timestamp: h.timestamp,
          store: h.store,
          diff: h.diff,
        })),
      })
    )
  })

  server.listen(port, () => {
    console.log('\x1b[36m%s\x1b[0m', `  ▶  Valtio Inspector v${version} → http://localhost:${port}`)
    console.log('\x1b[90m%s\x1b[0m', `     WebSocket ready on ws://localhost:${port}`)
  })
}