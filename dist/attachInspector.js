"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachInspector = attachInspector;
const valtio_1 = require("valtio");
function attachInspector(state, options) {
    if (typeof window === 'undefined' && typeof process !== 'undefined') {
        // Node.js / SSR — skip silently
        return () => { };
    }
    const { name, debounce = 100, inspectorUrl = 'http://localhost:7777' } = options;
    const wsUrl = inspectorUrl.startsWith('https')
        ? inspectorUrl.replace('https', 'wss')
        : inspectorUrl.replace('http', 'ws');
    let timeout = null;
    let ws = null;
    let reconnectAttempts = 0;
    const queue = [];
    function connect() {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
            reconnectAttempts = 0;
            // flush queue
            while (queue.length) {
                ws.send(JSON.stringify(queue.shift()));
            }
        };
        ws.onclose = () => {
            const delay = Math.min(1000 * 2 ** reconnectAttempts, 10000);
            reconnectAttempts++;
            setTimeout(connect, delay);
        };
        ws.onerror = () => {
            ws?.close();
        };
    }
    function send() {
        const payload = {
            store: name,
            data: (0, valtio_1.snapshot)(state)
        };
        // try WS first
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        }
        else {
            // queue for later
            queue.push(payload);
            // fallback to HTTP (optional)
            fetch(`${inspectorUrl}/state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(() => {
                // Inspector not running — fail silently
            });
        }
    }
    // init connection
    connect();
    // Send initial snapshot immediately
    send();
    const unsubscribe = (0, valtio_1.subscribe)(state, () => {
        if (timeout)
            clearTimeout(timeout);
        timeout = setTimeout(send, debounce);
    });
    return () => {
        if (timeout)
            clearTimeout(timeout);
        unsubscribe();
        ws?.close();
    };
}
//# sourceMappingURL=attachInspector.js.map