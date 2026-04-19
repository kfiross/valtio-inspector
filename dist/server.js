"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const package_json_1 = require("../package.json");
function startServer(port = 7777) {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)({
        origin: 'http://localhost:5173'
    }));
    app.use(express_1.default.json({ limit: '5mb' }));
    const server = http_1.default.createServer(app);
    const wss = new ws_1.WebSocketServer({ server });
    let stateTree = {};
    let history = [];
    let historyIdCounter = 0;
    const MAX_HISTORY = 100;
    // Deep recursive diff — handles nested objects correctly
    function computeDiff(prev, next) {
        if (!prev)
            return null;
        const diff = {};
        const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
        for (const key of allKeys) {
            const prevVal = prev[key];
            const nextVal = next[key];
            // Use stable serialization for comparison
            if (!deepEqual(prevVal, nextVal)) {
                diff[key] = { from: deepClone(prevVal), to: deepClone(nextVal) };
            }
        }
        return Object.keys(diff).length > 0 ? diff : null;
    }
    function deepEqual(a, b) {
        if (a === b)
            return true;
        if (a === null || b === null)
            return a === b;
        if (typeof a !== typeof b)
            return false;
        if (typeof a !== 'object')
            return a === b;
        if (Array.isArray(a) !== Array.isArray(b))
            return false;
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length)
            return false;
        return keysA.every(key => deepEqual(a[key], b[key]));
    }
    function deepClone(val) {
        if (val === undefined)
            return val;
        return JSON.parse(JSON.stringify(val));
    }
    function broadcast(payload) {
        const msg = JSON.stringify(payload);
        wss.clients.forEach(client => {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(msg);
            }
        });
    }
    // POST /state — receive a state update from a store
    app.post('/state', (req, res) => {
        const { store, data } = req.body;
        if (!store || data === undefined) {
            res.sendStatus(400);
            return;
        }
        const prevStoreState = stateTree[store]
            ? deepClone(stateTree[store])
            : undefined;
        // Update live state
        stateTree[store] = deepClone(data);
        const diff = computeDiff(prevStoreState, data);
        // Snapshot the ENTIRE state tree at this moment
        const entry = {
            id: ++historyIdCounter,
            timestamp: Date.now(),
            store,
            state: deepClone(stateTree), // ← fix: full deep clone, not reference
            diff: diff ?? undefined,
        };
        history.push(entry);
        if (history.length > MAX_HISTORY)
            history.shift();
        broadcast({
            type: 'STATE_UPDATE',
            state: stateTree,
            entry: {
                id: entry.id,
                timestamp: entry.timestamp,
                store,
                diff: entry.diff,
            },
        });
        res.sendStatus(200);
    });
    // GET /state — current live state
    app.get('/state', (_req, res) => res.json(stateTree));
    // DELETE /state — reset everything
    app.delete('/state', (_req, res) => {
        stateTree = {};
        history = [];
        historyIdCounter = 0;
        broadcast({ type: 'CLEAR' });
        res.sendStatus(200);
    });
    // GET /history — all history entries (without full state snapshot to save bandwidth)
    app.get('/history', (_req, res) => {
        res.json(history.map(h => ({
            id: h.id,
            timestamp: h.timestamp,
            store: h.store,
            diff: h.diff,
        })));
    });
    // GET /history/:id — single entry WITH full state snapshot
    app.get('/history/:id', (req, res) => {
        const id = parseInt(req.params.id);
        const entry = history.find(h => h.id === id);
        if (!entry) {
            res.sendStatus(404);
            return;
        }
        res.json(entry);
    });
    // POST /history/:id/restore — time-travel: restore state to a past snapshot
    app.post('/history/:id/restore', (req, res) => {
        const id = parseInt(req.params.id);
        const entry = history.find(h => h.id === id);
        if (!entry) {
            res.sendStatus(404);
            return;
        }
        // Restore the full state tree to the snapshot
        stateTree = deepClone(entry.state);
        // Record the restore as a new history entry
        const restoreEntry = {
            id: ++historyIdCounter,
            timestamp: Date.now(),
            store: '__restore__',
            state: deepClone(stateTree),
            diff: undefined,
        };
        history.push(restoreEntry);
        if (history.length > MAX_HISTORY)
            history.shift();
        broadcast({
            type: 'TIME_TRAVEL',
            restoredFromId: id,
            state: stateTree,
            entry: {
                id: restoreEntry.id,
                timestamp: restoreEntry.timestamp,
                store: restoreEntry.store,
            },
        });
        res.json({ restoredFromId: id, state: stateTree });
    });
    app.use(express_1.default.static(path_1.default.join(__dirname, '../client')));
    // WebSocket: send full state + slim history on connect
    wss.on('connection', ws => {
        ws.send(JSON.stringify({
            type: 'INIT',
            state: stateTree,
            history: history.map(h => ({
                id: h.id,
                timestamp: h.timestamp,
                store: h.store,
                diff: h.diff,
            })),
        }));
    });
    server.listen(port, () => {
        console.log('\x1b[36m%s\x1b[0m', `  ▶  Valtio Inspector v${package_json_1.version} → http://localhost:${port}`);
        console.log('\x1b[90m%s\x1b[0m', `     WebSocket ready on ws://localhost:${port}`);
    });
}
//# sourceMappingURL=server.js.map