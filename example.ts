/**
 * Example: how to wire up valtio stores with the inspector
 * Drop this into your app as a reference.
 */

import { proxy } from 'valtio'
import { attachInspector } from './instrument/attachInspector'

// ── Define your stores ──────────────────────────────────────────────────────

export const authStore = proxy({
  user: { id: 1, name: 'kfir', email: 'kfir@example.com' },
  isLoggedIn: false,
  token: null as string | null
})

export const uiStore = proxy({
  darkMode: true,
  sidebarOpen: false,
  activeModal: null as string | null,
  notifications: [] as string[]
})

export const cartStore = proxy({
  items: [] as Array<{ id: string; name: string; qty: number; price: number }>,
  coupon: null as string | null
})

// ── Attach inspector (dev only) ─────────────────────────────────────────────

if (process.env.NODE_ENV !== 'production') {
  attachInspector(authStore, { name: 'auth' })
  attachInspector(uiStore,   { name: 'ui' })
  attachInspector(cartStore, { name: 'cart' })
}

// ── Test: mutate stores after 1 second ─────────────────────────────────────
// (remove in real app)

setTimeout(() => {
  authStore.isLoggedIn = true
  authStore.token = 'jwt_abc123'
}, 1000)

setTimeout(() => {
  uiStore.sidebarOpen = true
  uiStore.activeModal = 'checkout'
}, 2000)

setTimeout(() => {
  cartStore.items.push({ id: 'p1', name: 'Mechanical Keyboard', qty: 1, price: 149.99 })
  cartStore.items.push({ id: 'p2', name: 'USB-C Hub', qty: 2, price: 34.99 })
}, 3000)
