import { subscribe, snapshot } from 'valtio'

type AttachOptions = {
  /** Display name for this store in the inspector */
  name: string
  /** Debounce delay in ms (default: 100) */
  debounce?: number
  /** Custom inspector URL (default: http://localhost:7777) */
  inspectorUrl?: string
}

/**
 * Attach a Valtio proxy store to the inspector.
 *
 * Usage:
 *   attachInspector(myStore, { name: 'auth' })
 *
 * ⚠️  Wrap in process.env.NODE_ENV !== 'production' to exclude from builds.
 */
export function attachInspector(
  state: object,
  options: AttachOptions
): () => void {
  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    // Node.js / SSR — skip silently
    return () => {}
  }

  const {
    name,
    debounce = 100,
    inspectorUrl = 'http://localhost:7777'
  } = options

  const wsUrl = inspectorUrl.replace('http', 'ws')

  let timeout: ReturnType<typeof setTimeout> | null = null
  let ws: WebSocket | null = null
  let reconnectAttempts = 0
  const queue: any[] = []

  function connect() {
    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      reconnectAttempts = 0

      // flush queue
      while (queue.length) {
        ws!.send(JSON.stringify(queue.shift()))
      }
    }

    ws.onclose = () => {
      const delay = Math.min(1000 * 2 ** reconnectAttempts, 10000)
      reconnectAttempts++

      setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  function send() {
    const payload = {
      store: name,
      data: snapshot(state)
    }

    // try WS first
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload))
    } else {
      // queue for later
      queue.push(payload)

      // fallback to HTTP (optional)
      fetch(`${inspectorUrl}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {
        // Inspector not running — fail silently
      })
    }
  }

  // init connection
  connect()

  // Send initial snapshot immediately
  send()

  const unsubscribe = subscribe(state, () => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(send, debounce)
  })

  return () => {
    if (timeout) clearTimeout(timeout)
    unsubscribe()
    ws?.close()
  }
}