"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachInspector = attachInspector;
const valtio_1 = require("valtio");
/**
 * Attach a Valtio proxy store to the inspector.
 *
 * Usage:
 *   attachInspector(myStore, { name: 'auth' })
 *
 * ⚠️  Wrap in process.env.NODE_ENV !== 'production' to exclude from builds.
 */
function attachInspector(state, options) {
    if (typeof window === 'undefined' && typeof process !== 'undefined') {
        // Node.js / SSR — skip silently
        return () => { };
    }
    const { name, debounce = 100, inspectorUrl = 'http://localhost:7777' } = options;
    let timeout = null;
    function send() {
        const data = (0, valtio_1.snapshot)(state);
        fetch(`${inspectorUrl}/state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ store: name, data })
        }).catch(() => {
            // Inspector not running — fail silently
        });
    }
    // Send initial snapshot immediately
    send();
    const unsubscribe = (0, valtio_1.subscribe)(state, () => {
        if (timeout)
            clearTimeout(timeout);
        timeout = setTimeout(send, debounce);
    });
    // Return cleanup function
    return () => {
        if (timeout)
            clearTimeout(timeout);
        unsubscribe();
    };
}
//# sourceMappingURL=attachInspector.js.map