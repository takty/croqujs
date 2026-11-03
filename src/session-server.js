/**
 * SessionServer (JS)
 *
 * @author Takuto Yanagida
 * @version 2026-11-01
 */

import { ipcMain, BrowserWindow, dialog, shell } from 'electron';
import * as FS from './fs-node.js';
import { Backup } from './backup.js';
import { Exporter } from './exporter.js';

const __dirname = FS.moduleDirectory(import.meta.url);

const DEFAULT_EXT = '.js';
const FILE_FILTERS = [
	{ name: 'JavaScript', extensions: ['js'] },
	{ name: 'All Files', extensions: ['*'] }
];

export class SessionServer {

	constructor(id, path) {
		this._id       = id;
		this._studyWin = null;
		this._fieldWin = null;

		if (path) this._initPath = path;

		this._filePath   = null;
		this._isReadOnly = false;
		this._isModified = false;

		this._backup    = new Backup();
		this._exporter  = new Exporter();
		this._tempDirs  = [];
		this._codeCache = '';

		ipcMain.on('notifyServer_' + this._id, (ev, msg, ...args) => { this[msg](...args); });
		ipcMain.handle('callServer_' + this._id, (ev, msg, ...args) => {
			try {
				return this[msg](...args);
			} catch (e) {
				console.error(e);
			}
		});

		this._createStudyWindow();
		// this._studyWin.show();
		// this._studyWin.webContents.toggleDevTools();
	}

	_createStudyWindow() {
		this._studyWin = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, enableDeprecatedPaste: true, preload: `${__dirname}/preload.js` } });
		allowPaste(this._studyWin.webContents, `${__dirname}/study/study.html`);
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

	_initializeDocument(text = '', filePath = null) {
		this._tempFilePath = null;
		if (filePath && filePath.trim().endsWith('.template.js')) {
			this._tempFilePath = filePath;
			filePath = null;
		}
		const readOnly = filePath ? !FS.isWritable(filePath) : false;  // Check Write Flag
		const name     = filePath ? FS.baseName(filePath, FS.extension(filePath)) : '';
		const baseName = filePath ? FS.baseName(filePath) : '';
		const dirName  = filePath ? FS.dirName(filePath) : '';

		this._filePath   = filePath;
		this._isReadOnly = readOnly;
		this._isModified = false;
		this._backup.setFilePath(filePath);

		const defJsons = this._loadDefJsons(text, this._tempFilePath ?? filePath);

		this.stop();
		this._studyWin.show();
		return [filePath, name, baseName, dirName, readOnly, defJsons, text];
	}

	_loadDefJsons(text, filePath) {
		let ret = [];
		if (text !== '' && filePath) ret = this._exporter.loadDefJsons(text, filePath);
		return ret;
	}

	// -------------------------------------------------------------------------

	onStudyModified() {
		this._isModified = true;
	}

	onStudyTitleChanged(title) {
		this._studyWin.setTitle(title);
	}

	onStudyErrorOccurred(info) {
		this._backup.backupErrorLog(info, this._codeCache);
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

	_returnExecutionError(msg) {
		const info = { msg: msg, library: true, isUserCode: false };
		this._backup.backupErrorLog(info, this._codeCache);
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

	doNew() {
		return ['init', this._initializeDocument()];
	}

	doOpen(dirPath = '') {
		if (dirPath !== '' && this._filePath) dirPath = this._filePath;
		const fp = dialog.showOpenDialogSync(this._studyWin, { defaultPath: dirPath, filters: FILE_FILTERS });
		if (fp) return this._openFile(fp[0]);
		return ['nop'];
	}

	doFileDropped(path) {
		try {
			const isDir = FS.isDirectory(path);
			if (!isDir) return this._openFile(path);

			const fns = FS.listDirectory(path);
			const fps = fns.map(e => FS.joinPath(path, e)).filter((fp) => {
				try {
					return FS.isFile(fp) && /.*\.js$/.test(fp) && !(/.*\.lib\.js$/.test(fp));
				} catch (e) {
					return ['nop'];
				}
			});
			if (fps.length === 1) return this._openFile(fps[0]);
			if (fps.length > 1)   return this.doOpen(path);
		} catch (e) {
			if (e.code !== 'ENOENT' && e.code !== 'EPERM') return this._returnAlertError(e, path);
		}
	}

	async _openFile(filePath) {
		const text = await FS.readTextAsync(filePath);
		if (text === null) return this._returnAlertError('', filePath);
		return ['init', this._initializeDocument(text, filePath)];
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

	_prepareSaving(text, dlgTitle, copy) {
		const fp = dialog.showSaveDialogSync(this._studyWin, { title: dlgTitle, defaultPath: this._filePath ? this._filePath : '', filters: FILE_FILTERS });
		if (!fp) return ['nop'];  // No file is selected.
		let writable = true;
		try {
			writable = FS.isWritable(fp);  // check write flag
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

	_save(fp, text) {
		if (fp.indexOf('.') === -1) fp += DEFAULT_EXT;
		this._filePath = fp;
		this._backup.setFilePath(fp);
		this._backup.backupExistingFile(text, this._filePath);
		try {
			FS.writeText(this._filePath, text.replace(/\n/g, '\r\n'));
			if (this._tempFilePath) {
				this._exporter.copyLibraryOfTemplate(text, this._tempFilePath, FS.dirName(this._filePath));
				this._tempFilePath = null;
			}

			const name     = FS.baseName(this._filePath, FS.extension(this._filePath));
			const baseName = FS.baseName(this._filePath);
			const dirName  = FS.dirName(this._filePath);

			const defJsons = this._loadDefJsons(text, this._filePath);

			this._isModified = false;
			return ['path', [this._filePath, name, baseName, dirName, false, defJsons]];
		} catch (e) {
			return this._returnAlertError(e, this._filePath);
		}
	}

	_saveCopy(fp, text) {
		if (fp.indexOf('.') === -1) fp += DEFAULT_EXT;
		this._backup.backupExistingFile(text, fp);
		try {
			FS.writeText(fp, text.replace(/\n/g, '\r\n'));
			return ['nop'];
		} catch (e) {
			return this._returnAlertError(e, fp);
		}
	}

	doClose(text) {
		if (this._isModified) this._backup.backupText(text);

		this._studyWin.destroy();
		this._studyWin = null;
		if (this._fieldWin) this._fieldWin.close();

		this._clearTempPath();
	}

	doExportAsLibrary(text, libName, isUseDecIncluded, jsonCodeStructure) {
		const codeStructure = JSON.parse(jsonCodeStructure);
		const name = libName.replace(' ', '_').replace('-', '_').replace('+', '_').replace('/', '_').replace('.', '_');
		const expDir = FS.joinPath(FS.dirName(this._filePath), name + '.lib.js');

		try {
			this._exporter.exportAsLibrary(text, expDir, name.toUpperCase(), codeStructure, isUseDecIncluded);
			return ['success_export', 'exportedAsLibrary'];
		} catch (e) {
			return this._returnAlertError(e, expDir);
		}
	}

	doExportAsWebPage(text) {
		if (this._filePath === null) return ['nop'];
		const expDir = this._makeExportPath(this._filePath);
		try {
			FS.removeDirectoryTree(expDir);
			FS.createDirectory(expDir);

			this._exporter.exportAsWebPage(text, this._filePath, expDir);
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
		if (this._isModified) this._backup.backupText(text);
		this._codeCache = text;

		if (!this._fieldWin) {
			await this._createFieldWindow();
		}
		this._fieldWin.showInactive();
		while (!this._fieldWin.isVisible()) {
			await new Promise(resolve => setTimeout(resolve, 200));
		}
		return this._execute(text);
	}

	async doRunWithoutWindow(text) {
		if (this._isModified) this._backup.backupText(text);
		this._codeCache = text;

		if (!this._fieldWin) {
			await this._createFieldWindow();
		} else {
			this._fieldWin.hide();
		}
		return this._execute(text);
	}

	_execute(codeStr) {
		const ret = this._exporter.checkLibraryReadable(codeStr, this._filePath ?? this._tempFilePath);
		if (ret !== true) return this._returnExecutionError(ret);

		this._clearTempPath();
		const expDir = this._getTempPath();
		try {
			FS.removeDirectoryTree(expDir);
			FS.createDirectory(expDir);
			const [success, expPath] = this._exporter.exportAsWebPage(codeStr, this._filePath ?? this._tempFilePath, expDir, true);
			if (!success) return this._returnExecutionError(expPath);

			const baseUrl = FS.executionFileURL(expPath);
			const url = baseUrl + '#' + this._id + ',' + this._exporter._userCodeOffset;
			return ['open', url];
		} catch (e) {
			return this._returnAlertError(e, expDir);
		}
	}

	// -------------------------------------------------------------------------

	_makeExportPath(fp) {
		const name = FS.baseName(fp, FS.extension(fp));
		return FS.joinPath(FS.dirName(fp), name + '.export');
	}

	_getTempPath() {
		const tmpdir = FS.temporaryDirectory();
		const name = 'croqujs-' + Date.now();
		const path = FS.joinPath(tmpdir, name);
		this._tempDirs.push(path);
		return path;
	}

	_clearTempPath() {
		for (let td of this._tempDirs) FS.removeDirectoryTree(td);
		this._tempDirs = [];
	}

}

// -----------------------------------------------------------------------------

// Sessions are shared by multiple windows. Only registered editor pages may use
// the legacy synchronous clipboard read needed by document.execCommand('paste').
const sessions = new WeakMap();

export function allowPaste(contents, pagePath) {
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
	pages.set(contents, FS.toFileURL(pagePath));
}
