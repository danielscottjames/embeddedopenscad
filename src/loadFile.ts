import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './logger';

const INCLUDE_PATTERN = /include\s*(?:<([^>]+)>|"([^"]+)")/g;
const USE_PATTERN = /use\s*(?:<([^>]+)>|"([^"]+)")/g;

export async function loadFile(
    scad: OpenSCAD.Instance, 
    filePath: string, 
    wasmFilePath: string,
    content?: string,
    processedFiles = new Set<string>(),
): Promise<number> {
    // Skip if we've already processed this file to prevent circular dependencies
    if (processedFiles.has(filePath)) {
        return 0;
    }
    
    processedFiles.add(filePath);
    
    // If content wasn't provided, read it from disk
    if (!content) {
        if (!fs.existsSync(filePath)) {
            return 0;
        }
        content = fs.readFileSync(filePath, 'utf8');
    }

    scad.FS.writeFile(wasmFilePath, content);
    Logger.log(`Loaded ${filePath} to ${wasmFilePath}`);
    
    // Find all include and use statements
    const baseDir = path.dirname(filePath);
    const dependencies: string[] = [];
    
    // Extract paths from include statements
    let match;
    while ((match = INCLUDE_PATTERN.exec(content)) !== null) {
        const depPath = match[1] || match[2]; // Either from <> or "" format
        dependencies.push(depPath);
    }
    
    // Extract paths from use statements
    while ((match = USE_PATTERN.exec(content)) !== null) {
        const depPath = match[1] || match[2]; // Either from <> or "" format
        dependencies.push(depPath);
    }
    
    if (dependencies.length === 0) {
        return 0;
    }
    
    // Process all found dependencies
    let count = 0;
    
    for (const dep of dependencies) {
        const depFilePath = path.resolve(baseDir, dep);
        const wasmDepPath = path.join(path.dirname(wasmFilePath), path.basename(dep));
        
        // The file must exist in the relative path. Otherwise we'll assume it's a library file.
        if (!fs.existsSync(depFilePath)) {
            continue;
        }
        
        try {
            // Recursively process this dependency's dependencies
            count += await loadFile(scad, depFilePath, wasmDepPath, undefined, processedFiles);
        } catch (e) {}
    }
    
    return count;
}