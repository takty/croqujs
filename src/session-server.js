/**
 * Session Server
 *
 * @author Takuto Yanagida
 * @version 2026-11-03
 */

import { ipcMain, BrowserWindow, dialog, shell } from 'electron';
import { NodeFileSystem } from './lib/fs-node.js';
import { Backup } from './backup.js';
import { NodeExporter } from './exporter-node.js';
import { UrlProvider, LibraryError } from './url-provider.js';

const FS = new NodeFileSystem();
const __dirname = FS.moduleDirectory(import.meta.url);

const DEFAULT_EXT = '.js';
const FILE_FILTERS = [
	{ name: 'JavaScript', extensions: ['js'] },
	{ name: 'All Files', extensions: ['*'] }
];

export class SessionServer {

	constructor(id, path, urlProvider) {
		this._id       = id;
		this._studyWin = null;
		this._fieldWin = null;

		if (path) this._initPath = path;

		this._filePath   = null;
		this._isReadOnly = false;
		this._isModified = false;
		this._modificationVersion = 0;

		this._backup      = new Backup(FS);
		this._exporter    = new NodeExporter(FS, FS.joinPath(__dirname, './lib/injection.js'));
		this._urlProvider = urlProvider ?? new UrlProvider(FS, id, this._exporter);
		this._codeCache   = '';

		ipcMain.on('notifyServer_' + this._id, async (ev, msg, ...args) => {
			try {
				await this[msg](...args);
			} catch (e) {
				console.error(e);
			}
		});
		ipcMain.handle('callServer_' + this._id, async (ev, msg, ...args) => {
			try {
				return await this[msg](...args);
			} catch (e) {
				console.error(e);
			}
		});

		this._createStudyWindow().catch(error => console.error(error));
		// this._studyWin.show();
		// this._studyWin.webContents.toggleDevTools();
	}

	async _createStudyWindow() {
		this._studyWin = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, enableDeprecatedPaste: true, preload: `${__dirname}/preload.js` } });
		await allowPaste(this._studyWin.webContents, `${__dirname}/study/study.html`);
		this._studyWin.loadURL(`file://${__dirname}/study/study.html#${this._id}`);
		this._studyWin.setMenu(null);
		this._studyWin.on('close', (e) => {
			e.preventDefault();
			this._studyWin.webContents.send('windowClose');
		});
		this._studyWin.webContents.setWindowOpenHandler(({ url }) => {
			if (!url.startsWith(`file://${__dirname}/`)) {
				shell.openExternal(url);
				return { action: 'deny' };
			}
			return { action: 'allow' };
		});
	}

	_createFieldWindow() {
		this._fieldWin = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
		return new Promise(resolve => {
			this._fieldWin.once('ready-to-show', resolve);
			this._fieldWin.on('closed', () => { this._fieldWin = null; });
			this._fieldWin.setMenu(null);
			this._fieldWin.loadURL(`file://${__dirname}/field/field.html#${this._id}`);
		});
	}

	async _initializeDocument(text = '', filePath = null) {
		this._tempFilePath = null;
		if (filePath && filePath.trim().endsWith('.template.js')) {
			this._tempFilePath = filePath;
			filePath = null;
		}
		const readOnly = filePath ? !(await FS.isWritable(filePath)) : false;  // Check Write Flag
		const name     = filePath ? FS.baseName(filePath, FS.extension(filePath)) : '';
		const baseName = filePath ? FS.baseName(filePath) : '';
		const dirName  = filePath ? FS.directoryName(filePath) : '';

		this._filePath   = filePath;
		this._isReadOnly = readOnly;
		this._isModified = false;
		this._backup.setFilePath(filePath);

		const defJsons = await this._loadDefJsons(text, this._tempFilePath ?? filePath);

		this.stop();
		this._studyWin.show();
		return [filePath, name, baseName, dirName, readOnly, defJsons, text];
	}

	async _loadDefJsons(text, filePath) {
		let ret = [];
		if (text !== '' && filePath) ret = await this._exporter.loadDefJsons(text, filePath);
		return ret;
	}

	// -------------------------------------------------------------------------

	onStudyModified() {
		this._isModified = true;
		this._modificationVersion++;
	}

	onStudyTitleChanged(title) {
		this._studyWin.setTitle(title);
	}

	async onStudyErrorOccurred(info) {
		await this._backup.backupErrorLog(info, this._codeCache);
	}

	onStudyProgramClosed() {
		this.stop();
	}

	onStudyToggleDevTools() {
		this._studyWin.webContents.toggleDevTools();
	}

	onStudyToggleDevToolsField() {
		if (this._fieldWin) this._fieldWin.webContents.toggleDevTools();
	}

	_returnAlertError(e, dir) {
		let err = e.toString();
		let i = err.indexOf("'");
		if (i === -1) i = err.length;
		err = err.substr(0, i).trim();
		return ['alert_error', `\n${dir}\n${err}`];
	}

	async _returnExecutionError(msg) {
		const info = { msg: msg, library: true, isUserCode: false };
		await this._backup.backupErrorLog(info, this._codeCache);
		return ['error', info];
	}

	// -------------------------------------------------------------------------

	doReady() {
		if (this._initPath) {
			return this._openFile(this._initPath);
		} else {
			return this.doNew();
		}
	}

	doUnmaximize() {
		this._studyWin.unmaximize();
	}

	// -------------------------------------------------------------------------

	async doNew() {
		return ['init', await this._initializeDocument()];
	}

	doOpen(dirPath = '') {
		if (dirPath !== '' && this._filePath) dirPath = this._filePath;
		const fp = dialog.showOpenDialogSync(this._studyWin, { defaultPath: dirPath, filters: FILE_FILTERS });
		if (fp) return this._openFile(fp[0]);
		return ['nop'];
	}

	async doFileDropped(path) {
		try {
			const isDir = await FS.isDirectory(path);
			if (!isDir) return await this._openFile(path);

			const entries = await FS.readDirectory(path);
			const fps = entries
				.filter(entry => entry.kind === 'file' && /.*\.js$/.test(entry.name) && !/.*\.lib\.js$/.test(entry.name))
				.map(entry => FS.joinPath(path, entry.name));
			if (fps.length === 1) return await this._openFile(fps[0]);
			if (fps.length > 1)   return await this.doOpen(path);
		} catch (e) {
			if (e.code !== 'ENOENT' && e.code !== 'EPERM') return this._returnAlertError(e, path);
		}
	}

	async _openFile(filePath) {
		try {
			const text = await FS.readText(filePath);
			return ['init', await this._initializeDocument(text, filePath)];
		} catch (e) {
			return this._returnAlertError(e, filePath);
		}
	}

	doSave(text, dlgTitle) {
		if (this._filePath === null || this._isReadOnly) {
			return this.doSaveAs(text, dlgTitle);
		} else {
			return this._save(this._filePath, text);
		}
	}

	doSaveAs(text, dlgTitle) {
		return this._prepareSaving(text, dlgTitle, false);
	}

	doSaveCopy(text, dlgTitle) {
		return this._prepareSaving(text, dlgTitle, true);
	}

	async _prepareSaving(text, dlgTitle, copy) {
		const fp = dialog.showSaveDialogSync(this._studyWin, { title: dlgTitle, defaultPath: this._filePath ? this._filePath : '', filters: FILE_FILTERS });
		if (!fp) return ['nop'];  // No file is selected.
		let writable = true;
		try {
			writable = await FS.isWritable(fp);  // check write flag
		} catch (e) {
			if (e.code !== 'ENOENT') return this._returnAlertError(e, fp);
		}
		if (writable) {
			if (copy && this._tempFilePath === null) return this._saveCopy(fp, text);
			else return this._save(fp, text);
		}
		// In Windows, the save dialog itself does not allow to select read only files.
		return this._returnAlertError('', fp);
	}

	async _save(fp, text) {
		const modificationVersion = this._modificationVersion;
		if (fp.indexOf('.') === -1) fp += DEFAULT_EXT;
		this._filePath = fp;
		this._backup.setFilePath(fp);
		try {
			await this._backup.backupExistingFile(text, this._filePath);
			await FS.writeText(fp, text.replace(/\n/g, '\r\n'));
			if (this._tempFilePath) {
				await this._exporter.copyLibraryOfTemplate(text, this._tempFilePath, FS.directoryName(this._filePath));
				this._tempFilePath = null;
			}

			const name     = FS.baseName(this._filePath, FS.extension(this._filePath));
			const baseName = FS.baseName(this._filePath);
			const dirName  = FS.directoryName(this._filePath);

			const defJsons = await this._loadDefJsons(text, this._filePath);

			// Edits received while saving still need to be saved.
			this._isModified = this._modificationVersion !== modificationVersion;
			return ['path', [this._filePath, name, baseName, dirName, false, defJsons]];
		} catch (e) {
			return this._returnAlertError(e, this._filePath);
		}
	}

	async _saveCopy(fp, text) {
		if (fp.indexOf('.') === -1) fp += DEFAULT_EXT;
		try {
			await this._backup.backupExistingFile(text, fp);
			await FS.writeText(fp, text.replace(/\n/g, '\r\n'));
			return ['nop'];
		} catch (e) {
			return this._returnAlertError(e, fp);
		}
	}

	async doClose(text) {
		if (this._isModified) await this._backup.backupText(text);

		await this._urlProvider.dispose();

		this._studyWin.destroy();
		this._studyWin = null;
		if (this._fieldWin) this._fieldWin.close();

	}

	async doExportAsLibrary(text, libName, isUseDecIncluded, jsonCodeStructure) {
		const codeStructure = JSON.parse(jsonCodeStructure);
		const name = libName.replace(' ', '_').replace('-', '_').replace('+', '_').replace('/', '_').replace('.', '_');
		const expDir = FS.joinPath(FS.directoryName(this._filePath), name + '.lib.js');

		try {
			await this._exporter.exportAsLibrary(text, expDir, name.toUpperCase(), codeStructure, isUseDecIncluded);
			return ['success_export', 'exportedAsLibrary'];
		} catch (e) {
			return this._returnAlertError(e, expDir);
		}
	}

	async doExportAsWebPage(text) {
		if (this._filePath === null) return ['nop'];
		const expDir = this._makeExportPath(this._filePath);
		try {
			await FS.removeDirectoryTree(expDir);
			await FS.createDirectory(expDir);

			await this._exporter.exportAsWebPage(text, this._filePath, expDir);
			return ['success_export', 'exportedAsWebPage'];
		} catch (e) {
			return this._returnAlertError(e, expDir);
		}
	}

	// -------------------------------------------------------------------------

	stop() {
		if (!this._fieldWin) return;
		this._fieldWin.close();
	}

	async doRun(text) {
		if (this._isModified) await this._backup.backupText(text);
		this._codeCache = text;

		if (!this._fieldWin) {
			await this._createFieldWindow();
		}
		this._fieldWin.showInactive();
		while (!this._fieldWin.isVisible()) {
			await new Promise(resolve => setTimeout(resolve, 200));
		}
		return this._getRunResponse(text);
	}

	async doRunWithoutWindow(text) {
		if (this._isModified) await this._backup.backupText(text);
		this._codeCache = text;

		if (!this._fieldWin) {
			await this._createFieldWindow();
		} else {
			this._fieldWin.hide();
		}
		return this._getRunResponse(text);
	}

	async _getRunResponse(text) {
		try {
			const url = await this._urlProvider.createUrl(text, this._filePath ?? this._tempFilePath);
			return ['open', url];
		} catch (e) {
			if (e instanceof LibraryError) return this._returnExecutionError(e.message);
			return this._returnAlertError(e, e.path ?? '');
		}
	}

	// -------------------------------------------------------------------------

	_makeExportPath(fp) {
		const name = FS.baseName(fp, FS.extension(fp));
		return FS.joinPath(FS.directoryName(fp), name + '.export');
	}

}

// -----------------------------------------------------------------------------

// Sessions are shared by multiple windows. Only registered editor pages may use
// the legacy synchronous clipboard read needed by document.execCommand('paste').
const sessions = new WeakMap();

export async function allowPaste(contents, pagePath) {
	const pageURL = await FS.toFileURL(pagePath);
	const session = contents.session;
	let pages = sessions.get(session);
	if (!pages) {
		pages = new WeakMap();
		sessions.set(session, pages);
		const allow = (requester, permission, details) => {
			if (permission !== 'deprecated-sync-clipboard-read') return true;
			const page = requester && pages.get(requester);
			return !!page && !requester.isDestroyed() && details.isMainFrame === true &&
				requester.getURL().split('#')[0] === page &&
				details.requestingUrl?.split('#')[0] === page;
		};
		session.setPermissionCheckHandler((requester, permission, _origin, details) => allow(requester, permission, details));
		session.setPermissionRequestHandler((requester, permission, callback, details) => callback(allow(requester, permission, details)));
	}
	pages.set(contents, pageURL);
}
