type AttachOptions = {
    /** Display name for this store in the inspector */
    name: string;
    /** Debounce delay in ms (default: 100) */
    debounce?: number;
    /** Custom inspector URL (default: http://localhost:7777) */
    inspectorUrl?: string;
};
export declare function attachInspector<T extends object>(state: T, options: AttachOptions): () => void;
export {};
//# sourceMappingURL=attachInspector.d.ts.map