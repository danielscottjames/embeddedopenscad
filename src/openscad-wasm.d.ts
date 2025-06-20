declare module 'openscad-wasm' {
    export default function (options: OpenSCAD.OpenSCADWasmInitOptions): Promise<OpenSCAD.Instance>;
}

declare namespace OpenSCAD {
    interface ErrnoError extends Error {
        errno: number;
    }

    interface ErrnoErrorConstructor {
        new(message?: string): ErrnoError;
        (message?: string): ErrnoError;
        readonly prototype: ErrnoError;
    }

    namespace FS {
        function writeFile(filename: string, contents: string | Uint8Array): void;
        function readFile(filename: string): Uint8Array;
        function mkdir(path: string): void;
        function stat(path: string): { isFile: boolean; isDirectory: boolean; size: number; mode: number };
        function readdir(path: string): string[];

        const ErrnoError: ErrnoErrorConstructor;
    }

    export class Instance {
        FS: typeof FS;

        callMain: (args: string[]) => number;
        formatException?: (pointer: number) => string;
        getLastError?: () => Error | undefined;

        HEAPU8: Uint8Array;
        HEAPU32: Uint32Array;
    }

    export interface OpenSCADWasmInitOptions {
        noInitialRun: boolean;
    }
}