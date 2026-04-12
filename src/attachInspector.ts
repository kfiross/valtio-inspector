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
export function attachInspector(state: object, options: AttachOptions): () => void {
  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    // Node.js / SSR — skip silently
    return () => {}
  }

  const {
    name,
    debounce = 100,
    inspectorUrl = 'http://localhost:7777'
  } = options

  let timeout: ReturnType<typeof setTimeout> | null = null

  function send() {
    const data = snapshot(state)
    fetch(`${inspectorUrl}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store: name, data })
    }).catch(() => {
      // Inspector not running — fail silently
    })
  }

  // Send initial snapshot immediately
  send()

  const unsubscribe = subscribe(state, () => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(send, debounce)
  })

  // Return cleanup function
  return () => {
    if (timeout) clearTimeout(timeout)
    unsubscribe()
  }
}
