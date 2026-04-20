# Valtio Inspector

A dev-only state inspector for [Valtio](https://github.com/pmndrs/valtio) with live WebSocket updates, multiple store support, history, and time travel.

## Features

- 🔴 **Live WebSocket updates** — no polling
- 🗂 **Multiple stores** — sidebar navigation
- 🌳 **Collapsible JSON tree** — expand/collapse nodes
- 📜 **History log** — every change tracked with timestamps
- ⏪ **Time travel** — click any history entry to inspect that snapshot
- 🔍 **Diff view** — see exactly what changed between snapshots
- ⚡ **Auto-reconnect** — if the server restarts

---

## Setup

### 1. Install 

```bash
npm i @kfiross44/valtio-inspector --save-dev
```
```bash
yarn add @kfiross44/valtio-inspector -D
```
```bash
pnpm install @kfiross44/valtio-inspector -D
```



### 2. Instrument your stores
requires `valtio` installed

```ts
import { proxy } from 'valtio'
import { ValtioInspector } from '@kfiross44/valtio-inspector';

export const authStore = proxy({
  user: { id: 1, name: 'John' },
  isLoggedIn: false
})

export const uiStore = proxy({
  darkMode: true,
  sidebarOpen: false
})

// Only in dev!
if (process.env.NODE_ENV !== 'production') {
  attachInspector(authStore, { name: 'auth' })
  attachInspector(uiStore, { name: 'ui' })
}
```

`attachInspector` returns a cleanup function (for React `useEffect`, etc.):
```ts
const cleanup = attachInspector(store, { name: 'myStore' })
// later:
cleanup()
```

### Options

```ts
attachInspector(store, {
  name: 'myStore',       // required — display name
  debounce: 100,         // optional — ms debounce (default: 100)
  inspectorUrl: 'http://localhost:7777'  // optional — if running elsewhere
})
```
### 3. Run the inspector 
```bash
npx @kfiross44/valtio-inspector
# → http://localhost:7777
```
---

## API

The server exposes these endpoints (used internally by the UI):

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/state` | Push a store update |
| `GET`  | `/state` | Get the current full state tree |
| `DELETE` | `/state` | Clear all state + history |
| `GET`  | `/history` | Get full history log |
| `GET`  | `/history/:id` | Get a specific history snapshot |


## ⚠️ Security

- **Never expose port 7777 publicly.** This is a dev-only tool.
- Always gate `attachInspector` behind `process.env.NODE_ENV !== 'production'`.
- Do not run the inspector server in production builds!
