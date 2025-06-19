declare module 'openscad-wasm' {
    export default function (options: OpenSCAD.OpenSCADWasmInitOptions): Promise<OpenSCAD.Instance>;
}

declare namespace OpenSCAD {
    class FS {
        writeFile: (filename: string, contents: string | Uint8Array) => void;
        readFile: (filename: string) => Uint8Array;
        mkdir: (path: string) => void;
    }

    export class Instance {
        FS: FS;

        callMain: (args: string[]) => void;
        formatException?: (pointer: number) => string;

        HEAPU8: Uint8Array;
        HEAPU32: Uint32Array;
    }

    export interface OpenSCADWasmInitOptions {
        noInitialRun: boolean;
    }
}