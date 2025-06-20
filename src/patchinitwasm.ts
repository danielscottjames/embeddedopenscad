import { Logger } from "./logger";

export class ErrorFromOpenSCAD extends Error { }

declare namespace WebAssembly {
    function instantiateStreaming(response: Response | Promise<Response>, importObject?: any): Promise<any>;
    function instantiate(bufferSource: ArrayBuffer | ArrayBufferView, importObject?: any): Promise<any>;
}

/**
 * Creates and tracks instance-specific error handlers
 */
function createInstanceErrorHandlers() {
    let lastInstanceError: ErrorFromOpenSCAD | undefined;

    function trackInstanceError(msg: string) {
        ['ERROR: ', 'WARNING: '].forEach(prefix => {
            if (msg.startsWith(prefix)) {
                lastInstanceError = new ErrorFromOpenSCAD(msg.replace(prefix, ''));
            }
        });
    }

    const instanceLog = function (msg: unknown, ...rest: unknown[]) {
        Logger.log(msg, ...rest);
        if (typeof msg === 'string') {
            trackInstanceError(msg);
        }
    };

    const instanceWarn = function (msg: unknown, ...rest: unknown[]) {
        Logger.warn(msg, ...rest);
        if (typeof msg === 'string') {
            trackInstanceError(msg);
        }
    };

    const instanceError = function (msg: unknown, ...rest: unknown[]) {
        Logger.error(msg, ...rest);
        if (typeof msg === 'string') {
            trackInstanceError(msg);
        }
    };

    function getLastError() {
        try {
            return lastInstanceError;
        } finally {
            lastInstanceError = undefined;
        }
    }

    return { instanceLog, instanceWarn, instanceError, getLastError };
}

/** This patches fetch and instantiateStreaming in order for the Emscripten js loader to work in a VS Code extension */
export async function patchInitWasm<G extends { getLastError?: () => (ErrorFromOpenSCAD | undefined) }>(fn: () => Promise<G>) {
    const _instantiateStreaming = WebAssembly.instantiateStreaming;
    const _fetch = global.fetch;
    const log = Object.getOwnPropertyDescriptor(console, 'log')!;
    const warn = Object.getOwnPropertyDescriptor(console, 'error')!;
    const error = Object.getOwnPropertyDescriptor(console, 'error')!;

    const { instanceLog, instanceWarn, instanceError, getLastError } = createInstanceErrorHandlers();

    try {
        // @ts-ignore
        global.fetch = (uri: string) => {
            const vscode = require('vscode');
            uri = vscode.Uri.file(uri.replace('file://', ''));
            return vscode.workspace.fs.readFile(uri);
        };

        WebAssembly.instantiateStreaming = (bufferSource: any, importObject: any) => {
            return WebAssembly.instantiate(bufferSource, importObject);
        };

        // We don't want to accidentally hook other extension's logs
        // Emscripten grabs these functions synchronously
        let r: Promise<G>;
        try {
            Object.defineProperty(console, 'log', {
                value: instanceLog,
                writable: true,
                configurable: true,
            });
            Object.defineProperty(console, 'warn', {
                value: instanceWarn,
                writable: true,
                configurable: true,
            });
            Object.defineProperty(console, 'error', {
                value: instanceError,
                writable: true,
                configurable: true,
            });

            r = fn();
        } finally {
            Object.defineProperty(console, 'log', log);
            Object.defineProperty(console, 'warn', warn);
            Object.defineProperty(console, 'error', error);
        }

        const instance = await r;
        instance.getLastError = getLastError;
        return instance;
    } finally {
        WebAssembly.instantiateStreaming = _instantiateStreaming;
        global.fetch = _fetch;
    }
}