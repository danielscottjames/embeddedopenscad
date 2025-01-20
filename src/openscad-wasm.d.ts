declare module 'openscad-wasm' {
    export default function (options: OpenSCAD.OpenSCADWasmInitOptions): Promise<OpenSCAD.Instance>;
}

declare namespace OpenSCAD {
    class FS {
        writeFile: (filename: string, contents: string) => void;
        readFile: (filename: string) => Uint8Array;
    }

    export class Instance {
        FS: FS;

        callMain: (args: string[]) => void;
        formatException?: (pointer: number) => void;
    }

    export interface OpenSCADWasmInitOptions {
        noInitialRun: boolean;
    }
}