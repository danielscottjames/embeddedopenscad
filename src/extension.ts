import * as vscode from 'vscode';
import OpenSCAD from "openscad-wasm";
import { stl2glb } from './stl2glb';
import { patchInitWasm } from './patchinitwasm';

let instance: Promise<OpenSCAD.Instance> = patchInitWasm(() => OpenSCAD({ noInitialRun: true }));

let counter = 0;

interface OpenFile {
	index: number;
	panel: vscode.WebviewPanel;
}

const panels = new Map<vscode.TextEditor, OpenFile>();

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
					"OpenSCAD Preview (...)",
					vscode.ViewColumn.Beside,
					{
						enableScripts: true,
						localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
					}
				);

				panels.set(editor, { index: counter, panel });
				panel.webview.html = await setWebviewLinks(HTML, panel);
			}

			const entry = panels.get(editor)!;

			try {
				const scad = await instance;

				const document = editor.document;

				const inFile = `${entry.index}.scad`;
				const outFile = `${entry.index}.stl`;

				scad.FS.writeFile(inFile, document.getText());
				scad.callMain([inFile, "--enable=manifold", "--export-format=binstl", "-o", outFile]);
				const output = scad.FS.readFile(`/${outFile}`);

				const glb = await stl2glb(output);
				const model = Buffer.from(glb).toString('base64');

				entry.panel.webview.postMessage({
					src: model,
				});
			} catch (e) {
				console.log(e);
				debugger;
			}
		} else {
			vscode.window.showInformationMessage('No active editor!');
		}
	});

	context.subscriptions.push(disposable);
}

export function deactivate() { }
