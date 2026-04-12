type AttachOptions = {
    /** Display name for this store in the inspector */
    name: string;
    /** Debounce delay in ms (default: 100) */
    debounce?: number;
    /** Custom inspector URL (default: http://localhost:7777) */
    inspectorUrl?: string;
};
/**
 * Attach a Valtio proxy store to the inspector.
 *
 * Usage:
 *   attachInspector(myStore, { name: 'auth' })
 *
 * ⚠️  Wrap in process.env.NODE_ENV !== 'production' to exclude from builds.
 */
export declare function attachInspector(state: object, options: AttachOptions): () => void;
export {};
//# sourceMappingURL=attachInspector.d.ts.map