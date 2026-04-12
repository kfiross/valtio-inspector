import express from 'express'
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'
import path from 'path'
import cors from 'cors'

export function startServer(port: number = 7777) {
  const app = express()

  app.use(cors({
    origin: 'http://localhost:5173'
  }))

  app.use(express.json({ limit: '5mb' }))

  const server = http.createServer(app)
  const wss = new WebSocketServer({ server })

  interface HistoryEntry {
    id: number
    timestamp: number
    store: string
    state: Record<string, any>
    diff?: Record<string, any>
  }

  let stateTree: Record<string, any> = {}
  let history: HistoryEntry[] = []
  let historyIdCounter = 0
  const MAX_HISTORY = 100

  function computeDiff(prev: any, next: any): Record<string, any> | null {
    if (!prev) return null
    const diff: Record<string, any> = {}
    const allKeys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})])
    for (const key of allKeys) {
      if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
        diff[key] = { from: prev[key], to: next[key] }
      }
    }
    return Object.keys(diff).length > 0 ? diff : null
  }

  function broadcast(payload: object) {
    const msg = JSON.stringify(payload)
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg)
      }
    })
  }

  app.post('/state', (req, res) => {
    const { store, data } = req.body
    if (!store || data === undefined) {
      res.sendStatus(400)
      return
    }

    const prev = stateTree[store]
    stateTree[store] = data

    const diff = computeDiff(prev, data)

    const entry: HistoryEntry = {
      id: ++historyIdCounter,
      timestamp: Date.now(),
      store,
      state: JSON.parse(JSON.stringify(stateTree)),
      diff: diff ?? undefined
    }

    history.push(entry)
    if (history.length > MAX_HISTORY) {
      history.shift()
    }

    broadcast({
      type: 'STATE_UPDATE',
      state: stateTree,
      entry: { id: entry.id, timestamp: entry.timestamp, store, diff }
    })

    res.sendStatus(200)
  })

  app.get('/history', (_req, res) => res.json(history))

  app.get('/history/:id', (req, res) => {
    const id = parseInt(req.params.id)
    const entry = history.find(h => h.id === id)
    if (!entry) {
      res.sendStatus(404)
      return
    }
    res.json(entry)
  })

  app.get('/state', (_req, res) => res.json(stateTree))

  app.delete('/state', (_req, res) => {
    stateTree = {}
    history = []
    broadcast({ type: 'CLEAR' })
    res.sendStatus(200)
  })

  app.use(express.static(path.join(__dirname, '../client')))

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({
      type: 'INIT',
      state: stateTree,
      history: history.map(h => ({
        id: h.id,
        timestamp: h.timestamp,
        store: h.store,
        diff: h.diff
      }))
    }))
  })

  server.listen(port, () => {
    console.log('\x1b[36m%s\x1b[0m', `  ▶  Valtio Inspector → http://localhost:${port}`)
    console.log('\x1b[90m%s\x1b[0m', `     WebSocket ready on ws://localhost:${port}`)
  })
}

// startServer()