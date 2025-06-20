import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

export async function loadLibraryFiles(scad: OpenSCAD.Instance, libraryPath: string, wasmDirPath: string, depth = 0): Promise<number> {
    let count = 0;

    if (depth <= 1) {
        // Log the top level folders we're copying over
        Logger.log(`Loading library files from ${libraryPath} to ${wasmDirPath}`);
    }

    if (depth == 0) {
        // Check if the library path exists
        const stats = fs.statSync(libraryPath);
        if (!stats.isDirectory()) {
            throw new Error(`User library path is not a directory: ${libraryPath}`);
        }
    }

    // Create the necessary directory structure in WASM filesystem
    const pathParts = wasmDirPath.split('/').filter(Boolean);
    let currentPath = '';

    for (const part of pathParts) {
        currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
        try {
            scad.FS.mkdir(currentPath);
        } catch (e) {
            // Directory may already exist
        }
    }

    // Read directory contents
    const entries = fs.readdirSync(libraryPath);

    for (const entry of entries) {
        const fullPath = path.join(libraryPath, entry);
        const wasmPath = path.join(wasmDirPath, entry);

        try {
            const entryStats = fs.statSync(fullPath);

            if (entryStats.isDirectory()) {
                // Recursively process subdirectories
                count += await loadLibraryFiles(scad, fullPath, wasmPath, depth + 1);
            } else {
                // Check if it's a file we want to load (e.g., .scad files)
                if (entry.endsWith('.scad')) {
                    const content = fs.readFileSync(fullPath);
                    try {
                        scad.FS.writeFile(wasmPath, content);
                        count++;
                    } catch (e) {
                        // Continue with other files
                    }
                } else {
                    // Skipping non-SCAD file
                }
            }
        } catch (e) {
            // Continue with other entries
        }
    }

    if (depth == 0) {
        Logger.log(`Finished loading ${count} library files.`);
    }

    return count;
}
