import { stl2glb } from './stl2glb';
import { ErrorFromOpenSCAD, patchInitWasm } from './patchinitwasm';
import { addFonts } from './wasm/openscad.fonts';
import { unknownToString } from './util';
import { decodeAndRethrowErrorFromOpenSCAD } from './error';
import { loadLibraryFiles } from './loadLibraryFiles';
import { Logger, setOutputChannel } from './logger';

import OpenSCAD from "openscad-wasm";
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const LIBRARIES_PATH = '/libraries';

interface OpenFile {
	index: number;
	panel: vscode.WebviewPanel;
}

const panels = new Map<vscode.TextEditor, OpenFile>();
let counter = 0;
let outputChannel!: vscode.OutputChannel;

let extensionContext: vscode.ExtensionContext | undefined;

export function activate(context: vscode.ExtensionContext) {
	extensionContext = context;
	outputChannel = vscode.window.createOutputChannel('OpenSCAD');
	setOutputChannel(outputChannel);

	async function setWebviewLinks(content: PromiseLike<string>, panel: vscode.WebviewPanel) {
		let text = await content;
		text = text.replace(/@media\{([^}]+)\}/g, (_, fileName) => {
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

	const fileWatcher = vscode.workspace.onDidSaveTextDocument(document => {
		for (const [editor, entry] of panels.entries()) {
			if (editor.document === document) {
				updatePreview(editor, entry);
				break;
			}
		}
	});

	const editorCloseListener = vscode.window.onDidChangeVisibleTextEditors(editors => {
		for (const [editor] of panels) {
			if (!editors.includes(editor)) {
				panels.delete(editor);
			}
		}
	});

	const exportCommand = vscode.commands.registerCommand('embeddedopenscad.exportSCAD', exportSCADToSTL);

	context.subscriptions.push(disposable, fileWatcher, editorCloseListener, exportCommand);

	printAbout().then(() => {
		Logger.log('\nEmbedded OpenSCAD Extension Activated\n');
	})
}

export function deactivate() {
	extensionContext = undefined;
}

async function renderSCAD(document: vscode.TextDocument, preview: boolean = false) {
	const scad = await createInstance();

	Logger.log(`Processing OpenSCAD file: ${document.fileName}`);

	// Use the actual filename in the virtual filesystem
	const inFile = path.basename(document.fileName);
	const outFile = 'output.stl';

	let text = document.getText();
	if (preview) {
		// Setting this with a command line arg doesn't appear to work
		text = `$preview=true;${text}`;
		Logger.log('Added $preview=true; to the code');
	}

	scad.FS.writeFile(inFile, text);

	try {
		const config = vscode.workspace.getConfiguration('embeddedopenscad');
		const enableManifold = config.get<boolean>('enableManifold', true);
		const args = [inFile];
		if (enableManifold) {
			args.push('--enable=manifold');
		}
		args.push('--export-format=binstl', '-o', outFile);

		Logger.log(`OpenSCAD ${args.join(' ')}`);

		// Show the directory structure for debugging
		// Logger.log('Checking WASM filesystem structure before execution:');
		// listWASMDirectories(scad);

		const exitCode = scad.callMain(args);
		if (exitCode != 0) {
			throw exitCode;
		}

		const output = scad.FS.readFile(`/${outFile}`);
		Logger.log('OpenSCAD processing finished');

		const wasSuccess = !scad.getLastError?.();

		return { output, wasSuccess };
	} catch (e: unknown) {
		// Get more detailed error information from our decoder
		decodeAndRethrowErrorFromOpenSCAD(e, scad);
	}
}

async function updatePreview(editor: vscode.TextEditor, entry: OpenFile) {
	entry.panel.webview.postMessage({ loading: true });

	try {
		const { output } = await renderSCAD(editor.document, true);
		const glb = await stl2glb(output);
		const model = Buffer.from(glb).toString('base64');

		entry.panel.webview.postMessage({
			src: model,
		});
	} catch (e) {
		if (!(e instanceof ErrorFromOpenSCAD)) {
			Logger.error(e);
		}
		// TODO: Notify the user somehow that re-rendering their changes failed.
	} finally {
		entry.panel.webview.postMessage({ loading: false });
	}
}

async function exportSCADToSTL(): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	const currentFile = editor?.document.uri;
	if (!editor || !currentFile || !currentFile.path.endsWith('.scad')) {
		vscode.window.showWarningMessage('No .scad file open to export!');
		return;
	}

	const fileName = path.basename(currentFile.fsPath);
	const exportFileName = fileName.replace(/\.scad$/, '.stl');
	const exportPath = currentFile.with({ path: currentFile.path.replace(/\.scad$/, '.stl') });

	// Show immediate toast notification
	vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: `Exporting ${fileName} to STL...`,
			cancellable: false
		},
		async () => {
			try {
				const { output, wasSuccess } = await renderSCAD(editor.document);
				await vscode.workspace.fs.writeFile(exportPath, output);

				if (wasSuccess) {
					vscode.window.showInformationMessage(
						`STL file exported successfully: ${exportFileName}`,
						"Open File"
					).then(selection => {
						if (selection === "Open File") {
							vscode.commands.executeCommand('vscode.open', exportPath);
						}
					});
				} else {
					vscode.window.showInformationMessage(
						`STL file exported with warnings: ${exportFileName}`,
						"Open File",
						"View Warnings"
					).then(selection => {
						if (selection === "Open File") {
							vscode.commands.executeCommand('vscode.open', exportPath);
						} else if (selection === "View Warnings") {
							outputChannel.show();
						}
					});
				}
			} catch (e) {
				if (!(e instanceof ErrorFromOpenSCAD)) {
					Logger.error(e);
				}
				errorToast(unknownToString(e));
			}
		}
	);
}

async function printAbout() {
	try {
		const instance = await createInstance(false);
		instance.callMain(['--info']);
	} catch (e) { }
}

async function createInstance(loadData = true): Promise<OpenSCAD.Instance> {
	Logger.log('\n');

	const scad = await patchInitWasm(() => OpenSCAD({
		noInitialRun: true,
	}));

	if (loadData) {
		await Logger.timeAsync('Loaded fonts and library files in:', async () => {
			// Load some default fonts (not configurable for now)
			scad.FS.mkdir(`/fonts`);
			const fontConfig = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extensionContext!.extensionUri, 'media', 'fonts.conf'));
			scad.FS.writeFile('/fonts/fonts.conf', Buffer.from(fontConfig));
			addFonts(scad);

			// Load user library files if configured
			const config = vscode.workspace.getConfiguration('embeddedopenscad');
			const userLibraryPath = config.get<string>('userLibraryPath', '');
			if (userLibraryPath) {
				if (!fs.existsSync(userLibraryPath)) {
					throw new Error(`User library path does not exist: ${userLibraryPath}`);
				}

				await loadLibraryFiles(scad, userLibraryPath, LIBRARIES_PATH);
			}
		});
	}

	return scad;
}

/**
 * Shows an error message with a button that takes the user to the output pane
 * @param message The error message to display
 */
function errorToast(message: string): void {
	vscode.window.showErrorMessage(message, "View Output").then(selection => {
		if (selection === "View Output") {
			outputChannel.show();
		}
	});
}
