import * as vscode from 'vscode';
import OpenSCAD from "openscad-wasm";
import { stl2glb } from './stl2glb';
import { patchInitWasm } from './patchinitwasm';

import * as path from 'path';

let counter = 0;

interface OpenFile {
	index: number;
	panel: vscode.WebviewPanel;
}

const panels = new Map<vscode.TextEditor, OpenFile>();

async function renderSCAD(document: vscode.TextDocument, preview: boolean = false) {
	const scad = await patchInitWasm(() => OpenSCAD({ noInitialRun: true }));
	const inFile = 'input.scad';
	const outFile = 'output.stl';

	let text = document.getText();
	if (preview) {
		// Setting this with a command line arg doesn't appear to work
		text = `$preview=true;${text}`;
	}

	scad.FS.writeFile(inFile, text);
	try {
		const args = [inFile, "--enable=manifold", "--export-format=binstl", "-o", outFile];
		scad.callMain(args);
	} catch (e: any) {
		if (typeof e === "number" && scad.formatException) {
			e = scad.formatException(e);
		}
		throw new Error(e);
	}
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
		console.log(e);
		debugger;
	} finally {
		entry.panel.webview.postMessage({ loading: false });
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Embedded OpenSCAD Extension Activated');

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
			vscode.window.showErrorMessage(`Export failed: ${e}`);
		}
	});

	context.subscriptions.push(disposable, fileWatcher, editorCloseListener, exportCommand);
}

export function deactivate() { }
