declare namespace WebAssembly {
    function instantiateStreaming(response: Response | Promise<Response>, importObject?: any): Promise<any>;
    function instantiate(bufferSource: ArrayBuffer | ArrayBufferView, importObject?: any): Promise<any>;
}

/** This patches fetch and instantiateStreaming in order for the Emscripten js loader to work in a VS Code extension */
export async function patchInitWasm<G>(fn: () => Promise<G>) {
    const _instantiateStreaming = WebAssembly.instantiateStreaming;
    const _fetch = global.fetch;

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

        return await fn();
    } finally {
        WebAssembly.instantiateStreaming = _instantiateStreaming;
        global.fetch = _fetch;
    }
}