import * as vscode from 'vscode';
import { stl2glb } from './stl2glb';
import { patchInitWasm } from './patchinitwasm';

import OpenSCAD from "openscad-wasm";
import { addFonts } from './wasm/openscad.fonts';

import * as path from 'path';
import * as fs from 'fs';

let counter = 0;

interface OpenFile {
	index: number;
	panel: vscode.WebviewPanel;
}

const panels = new Map<vscode.TextEditor, OpenFile>();

async function renderSCAD(document: vscode.TextDocument, preview: boolean = false) {
	// Use our logging-enabled OpenSCAD instance
	const scad = await createOpenSCADWithLogging();
	const inFile = 'input.scad';
	const outFile = 'output.stl';

	// Log information about what we're about to do
	outputChannel?.appendLine(`Processing OpenSCAD file: ${document.fileName}`);
	outputChannel?.appendLine(`Preview mode: ${preview}`);

	// Load user library files if configured
	const config = vscode.workspace.getConfiguration('embeddedopenscad');
	const userLibraryPath = config.get<string>('userLibraryPath', '');
	const librariesPath = '/libraries';

	if (userLibraryPath && userLibraryPath.trim() !== '') {
		outputChannel?.appendLine(`User library path configured: ${userLibraryPath}`);
		try {
			// Check if the path exists before trying to load it
			if (!fs.existsSync(userLibraryPath)) {
				throw new Error(`User library path does not exist: ${userLibraryPath}`);
			}

			// Create the libraries directory and load user library files
			await loadLibraryFiles(scad, userLibraryPath, librariesPath);
			outputChannel?.appendLine(`Successfully loaded library files from ${userLibraryPath}`);

			// Add libraries directory to include path via command-line arguments
			// We'll set this in the args array instead
		} catch (e) {
			const errorMsg = decodeOpenSCADError(e, scad);
			outputChannel?.appendLine(`Failed to load OpenSCAD library files: ${errorMsg}`);
			vscode.window.showErrorMessage(`Failed to load OpenSCAD library files: ${errorMsg}`);
		}
	} else {
		outputChannel?.appendLine('No user library path configured');
	}

	let text = document.getText();
	if (preview) {
		// Setting this with a command line arg doesn't appear to work
		text = `$preview=true;${text}`;
		outputChannel?.appendLine('Added $preview=true to the code');
	}

	outputChannel?.appendLine(`Writing input file: ${inFile}`);
	scad.FS.writeFile(inFile, text);
	try {
		const args = [inFile, "--enable=manifold", "--export-format=binstl"];

		// Add library include path if user library path is configured
		// if (userLibraryPath && userLibraryPath.trim() !== '') {
		// 	// Add standard OpenSCAD library paths
		// 	args.push("-I", librariesPath);
		// }

		args.push("-o", outFile);

		// Log the command we're about to run
		const cmdStr = args.join(' ');
		outputChannel?.appendLine(`Running OpenSCAD with args: ${cmdStr}`);

		// Show the directory structure for debugging
		outputChannel?.appendLine('Checking WASM filesystem structure before execution:');
		listWasmDirectories(scad);

		// Execute OpenSCAD
		scad.callMain(args);
		outputChannel?.appendLine('OpenSCAD processing completed successfully');
	} catch (e: any) {
		// Show output channel on error for debugging
		outputChannel?.appendLine('ERROR: OpenSCAD processing failed');

		// Get more detailed error information from our decoder
		throw decodeOpenSCADError(e, scad);
	}

	outputChannel?.appendLine(`Reading output file: ${outFile}`);
	return scad.FS.readFile(`/${outFile}`);
}

async function updatePreview(editor: vscode.TextEditor, entry: OpenFile) {
	entry.panel.webview.postMessage({ loading: true });

	try {
		const output = await renderSCAD(editor.document, true);
		const glb = await stl2glb(output);
		const model = Buffer.from(glb).toString('base64');

		entry.panel.webview.postMessage({
			src: model,
		});
	} catch (e) {
		// Display error message to user
		const errorMessage = e instanceof Error ? e.message : String(e);
		vscode.window.showErrorMessage(`OpenSCAD Error: ${errorMessage}`,
			'Show Output Channel').then(selection => {
				if (selection === 'Show Output Channel') {
					vscode.commands.executeCommand('workbench.action.output.show');
				}
			});
	} finally {
		entry.panel.webview.postMessage({ loading: false });
	}
}

let outputChannel: vscode.OutputChannel | undefined;

export function activate(context: vscode.ExtensionContext) {
	console.log('Embedded OpenSCAD Extension Activated');

	// Create the output channel at activation time
	outputChannel = outputChannel || vscode.window.createOutputChannel('OpenSCAD');

	async function setWebviewLinks(content: PromiseLike<string>, panel: vscode.WebviewPanel) {
		let text = await content;
		text = text.replace(/@media\{([^}]+)\}/g, (match, fileName) => {
			return panel.webview.asWebviewUri(
				vscode.Uri.joinPath(context.extensionUri, 'media', fileName)
			).toString();
		});
		return text;
	}

	const HTML = vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.extensionUri, 'media', 'index.html')).then((content) => {
		return new TextDecoder().decode(content);
	});

	const disposable = vscode.commands.registerCommand('embeddedopenscad.previewSCAD', async () => {
		const editor = vscode.window.activeTextEditor;

		if (editor) {
			if (!panels.has(editor)) {
				const panel = vscode.window.createWebviewPanel(
					`openscadPreview-${counter++}`,
					`Preview ${path.basename(editor.document.fileName)}`,
					vscode.ViewColumn.Beside,
					{
						enableScripts: true,
						localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
					}
				);

				panel.onDidDispose(() => {
					panels.delete(editor);
				});

				panels.set(editor, { index: counter, panel });
				panel.webview.html = await setWebviewLinks(HTML, panel);
			}

			const entry = panels.get(editor)!;
			await updatePreview(editor, entry);
		} else {
			vscode.window.showInformationMessage('No active editor!');
		}
	});

	// Add file watcher
	const fileWatcher = vscode.workspace.onDidSaveTextDocument(document => {
		for (const [editor, entry] of panels.entries()) {
			if (editor.document === document) {
				updatePreview(editor, entry);
				break;
			}
		}
	});

	// Add editor close handler
	const editorCloseListener = vscode.window.onDidChangeVisibleTextEditors(editors => {
		for (const [editor] of panels) {
			if (!editors.includes(editor)) {
				panels.delete(editor);
			}
		}
	});

	const exportCommand = vscode.commands.registerCommand('embeddedopenscad.exportSCAD', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor!');
			return;
		}

		try {
			const currentFile = editor.document.uri;
			const exportPath = currentFile.with({ path: currentFile.path.replace(/\.scad$/, '.stl') });

			const output = await renderSCAD(editor.document);
			await vscode.workspace.fs.writeFile(exportPath, output);

			vscode.window.showInformationMessage('STL file exported successfully!');
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			vscode.window.showErrorMessage(`Export failed: ${errorMessage}`);
			console.error("Export error:", e);
		}
	});

	context.subscriptions.push(disposable, fileWatcher, editorCloseListener, exportCommand);
}

/**
 * Recursively loads library files from the specified directory into the WASM filesystem
 * @param scad The OpenSCAD instance
 * @param libraryPath The path to the directory containing library files
 * @param wasmDirPath The path in the WASM filesystem where to mount the library files
 */
async function loadLibraryFiles(scad: any, libraryPath: string, wasmDirPath: string): Promise<void> {
	// Use the log function if available
	const log = (msg: string) => {
		if (outputChannel?.appendLine) {
			outputChannel?.appendLine(msg);
		} else {
			console.log(msg);
		}
	};

	log(`Loading library files from ${libraryPath} to ${wasmDirPath}`);

	// Create the necessary directory structure in WASM filesystem
	try {
		// Create each directory in the path
		const pathParts = wasmDirPath.split('/').filter(Boolean);
		let currentPath = '';

		for (const part of pathParts) {
			currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
			try {
				scad.FS.mkdir(currentPath);
				log(`Created WASM directory: ${currentPath}`);
			} catch (e) {
				// Directory may already exist
				log(`Note: Directory ${currentPath} may already exist`);
			}
		}
	} catch (e) {
		log(`Error creating directory structure: ${e}`);
	}

	try {
		// Check if the library path exists
		const stats = fs.statSync(libraryPath);
		if (!stats.isDirectory()) {
			const errMsg = `User library path is not a directory: ${libraryPath}`;
			log(`ERROR: ${errMsg}`);
			throw new Error(errMsg);
		}

		// Read directory contents
		const entries = fs.readdirSync(libraryPath);
		log(`Found ${entries.length} entries in ${libraryPath}`);

		let scadFilesCount = 0;

		for (const entry of entries) {
			const fullPath = path.join(libraryPath, entry);
			const wasmPath = path.join(wasmDirPath, entry);

			try {
				const entryStats = fs.statSync(fullPath);

				if (entryStats.isDirectory()) {
					// Recursively process subdirectories
					log(`Processing subdirectory: ${entry}`);
					await loadLibraryFiles(scad, fullPath, wasmPath);
				} else {
					// Check if it's a file we want to load (e.g., .scad files)
					if (entry.endsWith('.scad')) {
						log(`Loading SCAD file: ${entry}`);
						const content = fs.readFileSync(fullPath);
						try {
							scad.FS.writeFile(wasmPath, content);
							scadFilesCount++;
							log(`Successfully wrote ${wasmPath} to WASM filesystem`);
						} catch (e) {
							const errMsg = `Failed to write file to WASM FS: ${wasmPath}`;
							log(`ERROR: ${errMsg} - ${e}`);
							console.error(errMsg, e);
							// Continue with other files
						}
					} else {
						log(`Skipping non-SCAD file: ${entry}`);
					}
				}
			} catch (e) {
				log(`ERROR: Failed to process ${fullPath}: ${e}`);
				// Continue with other entries
			}
		}

		log(`Successfully loaded ${scadFilesCount} SCAD files to ${wasmDirPath}`);
	} catch (e) {
		const errMsg = `Error loading library files from ${libraryPath}: ${e}`;
		log(`ERROR: ${errMsg}`);
		console.error(errMsg, e);
		throw e;
	}
}

function decodeOpenSCADError(error: unknown, scad: OpenSCAD.Instance): string {
	// First try to use the built-in formatException if available
	if (typeof error === "number") {
		// if (scad.formatException) {
		// 	try {
		// 		const formattedError = scad.formatException(error);
		// 		if (formattedError && typeof formattedError === "string" && formattedError !== String(error)) {
		// 			return formattedError;
		// 		}
		// 	} catch (e) {
		// 		// Continue trying to parse the error...
		// 	}
		// }

		return decodeAbortString(scad, error);
	}

	// Generic error message if all else fails
	return `Unknown OpenSCAD: ${error}.`;
}

function decodeAbortString(inst: OpenSCAD.Instance, ptr: number) {
	if (!ptr) return '(null)';
	ptr >>>= 0;                                 // force unsigned

	const H8 = inst.HEAPU8;
	const H32 = inst.HEAPU32;
	const td = new TextDecoder('utf-8');

	/* ---------- follow up to TWO indirections -------------------- */
	for (let hop = 0; hop < 2; ++hop) {
		if (ptr > 0 && ptr < H8.length) {
			const p2 = H32[ptr >> 2] >>> 0;
			if (p2 > 0 && p2 < H8.length && p2 !== ptr) {
				ptr = p2;                     // one hop deeper
				continue;
			}
		}
		break;                            // not a valid hop → stop
	}

	/* ---------- scan to string boundaries ----------------------- */
	let start = ptr;
	while (start > 0 && H8[start - 1] !== 0) --start;

	let end = ptr;
	while (end < H8.length && H8[end] !== 0) ++end;

	return td.decode(H8.subarray(start, end));
}


/**
 * Captures output from OpenSCAD WASM for debugging purposes
 * @returns A configured OpenSCAD instance that captures output
 */
async function createOpenSCADWithLogging(): Promise<any> {
	// Use the global output channel
	outputChannel = outputChannel || vscode.window.createOutputChannel('OpenSCAD');

	// Show the output channel now so it's visible when processing starts
	outputChannel.clear();
	outputChannel.show();
	outputChannel.appendLine('=== OpenSCAD Processing Log ' + new Date().toISOString() + ' ===');

	// Create a patched instance with logging
	const scad: any = await patchInitWasm(() => OpenSCAD({
		noInitialRun: true,
	}));

	scad.FS.mkdir(`/fonts`);
	scad.FS.writeFile('/fonts/fonts.conf', `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>

  <!-- 1 ▪ Scan this directory for fonts                               -->
  <dir>/usr/share/fonts</dir>

  <!-- 2 ▪ Let Fontconfig write its cache here (RAM-backed in WASM)    -->
  <cachedir>/tmp/fontcache</cachedir>

  <!-- 3 ▪ Hard-wire the canonical aliases so nothing comes back NULL -->
  <alias>
    <family>sans-serif</family>
    <prefer><family>Liberation Sans</family></prefer>
  </alias>
  <alias>
    <family>serif</family>
    <prefer><family>Liberation Serif</family></prefer>
  </alias>
  <alias>
    <family>monospace</family>
    <prefer><family>Liberation Mono</family></prefer>
  </alias>

</fontconfig>`)

	addFonts(scad);

	return scad;
}

/**
 * Recursively lists the directory structure in the WASM filesystem for debugging
 * @param scad The OpenSCAD instance
 * @param dir The directory to list
 * @param depth Current recursion depth
 */
function listWasmDirectories(scad: any, dir: string = '/', depth: number = 0): void {
	const log = (msg: string) => {
		if (outputChannel?.appendLine) {
			outputChannel?.appendLine(msg);
		} else {
			console.log(msg);
		}
	};

	// Prevent excessive recursion
	if (depth > 9) {
		return;
	}

	try {
		// Check if directory exists
		const indent = '  '.repeat(depth);
		log(`${indent}Listing directory: ${dir}`);

		try {
			// List directory contents
			const entries = scad.FS.readdir(dir);

			// Filter out '.' and '..'
			const filteredEntries = entries.filter((entry: string) => entry !== '.' && entry !== '..');

			if (filteredEntries.length === 0) {
				log(`${indent}(empty directory)`);
				return;
			}

			// Log each entry
			for (const entry of filteredEntries) {
				const entryPath = `${dir}/${entry}`.replace(/\/+/g, '/');

				try {
					const stat = scad.FS.stat(entryPath);
					const isDirectory = stat.mode & 16384; // 0040000 in octal, directory flag

					if (isDirectory) {
						log(`${indent}- [DIR] ${entry}`);
						// Recursively list subdirectories
						listWasmDirectories(scad, entryPath, depth + 1);
					} else {
						log(`${indent}- [FILE] ${entry}`);
					}
				} catch (e) {
					log(`${indent}- [ERROR] Failed to stat ${entryPath}: ${e}`);
				}
			}
		} catch (e) {
			log(`${indent}Failed to read directory ${dir}: ${e}`);
		}
	} catch (e) {
		log(`Error listing directory ${dir}: ${e}`);
	}
}

export function deactivate() { }
