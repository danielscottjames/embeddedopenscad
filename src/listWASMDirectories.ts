import { Logger } from "./logger";

export function listWASMDirectories(scad: OpenSCAD.Instance, dir: string = '/', depth: number = 0): void {
	// Prevent excessive recursion
	if (depth >= 16) {
		return;
	}

	try {
		// Check if directory exists
		const indent = '  '.repeat(depth);
		Logger.log(`${indent}Listing directory: ${dir}`);

		try {
			// List directory contents
			const entries = scad.FS.readdir(dir);

			// Filter out '.' and '..'
			const filteredEntries = entries.filter((entry: string) => entry !== '.' && entry !== '..');

			if (filteredEntries.length === 0) {
				Logger.log(`${indent}(empty directory)`);
				return;
			}

			// Log each entry
			for (const entry of filteredEntries) {
				const entryPath = `${dir}/${entry}`.replace(/\/+/g, '/');

				try {
					const stat = scad.FS.stat(entryPath);
					const isDirectory = stat.mode & 16384; // 0040000 in octal, directory flag

					if (isDirectory) {
						Logger.log(`${indent}- [DIR] ${entry}`);
						// Recursively list subdirectories
						listWASMDirectories(scad, entryPath, depth + 1);
					} else {
						Logger.log(`${indent}- [FILE] ${entry}`);
					}
				} catch (e) {
					Logger.log(`${indent}- [ERROR] Failed to stat ${entryPath}: ${e}`);
				}
			}
		} catch (e) {
			Logger.log(`${indent}Failed to read directory ${dir}: ${e}`);
		}
	} catch (e) {
		Logger.log(`Error listing directory ${dir}: ${e}`);
	}
}