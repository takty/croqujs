/**
 *
 * Twin (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2019-08-15
 *
 */


'use strict';

const electron = require('electron');
const { ipcMain, BrowserWindow, dialog, clipboard, nativeImage } = electron;
const promiseIpc = require('electron-promise-ipc');
const require_ = (path) => { let r; return () => { return r || (r = require(path)); }; }

const OS       = require_('os');
const FS       = require_('fs');
const PATH     = require_('path');
const Backup   = require('./backup.js');
const Exporter = require('./exporter.js');

const DEFAULT_EXT = '.js';
const FILE_FILTERS = [{ name: 'JavaScript', extensions: ['js'] }, { name: 'All Files', extensions: ['*'] }];


class Twin {

	constructor(id, path) {
		this._id       = id;
		this._studyWin = null;
		this._fieldWin = null;

		this._filePath   = null;
		this._isReadOnly = false;
		this._isModified = false;

		this._backup    = new Backup();
		this._exporter  = new Exporter();
		this._tempDirs  = [];
		this._codeCache = '';

		ipcMain.on('notifyServer_' + this._id, (ev, msg, ...args) => {
			if (this[msg]) this[msg](...args);
		});
		promiseIpc.on('callServer_' + this._id, ([msg, ...args], ev) => {
			return this[msg](...args);
		});
		if (path) this._initPath = path;
		this._createStudyWindow();
	}

	_createStudyWindow() {
		this._studyWin = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true } });
		this._studyWin.loadURL(`file://${__dirname}/study/study.html#${this._id}`);
		this._studyWin.setMenu(null);
		this._studyWin.on('close', (e) => {
			e.preventDefault();
			this._studyWin.webContents.send('callStudyMethod', 'executeCommand', 'close');
		});
		// this._studyWin.show();
		// this._studyWin.webContents.toggleDevTools();
	}

	_createFieldWindow() {
		this._fieldWin = new BrowserWindow({ show: false });
		this._fieldWin.loadURL(`file://${__dirname}/field/field.html#${this._id}`);
		this._fieldWin.setMenu(null);
		this._fieldWin.on('closed', () => { this._fieldWin = null; });
		return new Promise(resolve => {
			this._fieldWin.once('ready-to-show', () => { resolve(); });
		});
	}


	// -------------------------------------------------------------------------


	onStudyReady() {
		if (this._initPath) {
			return this._openFile(this._initPath);
		} else {
			return this.initializeDocument();
		}
	}

	onStudyModified() {
		this._isModified = true;
	}

	onStudyTitleChanged(title) {
		this._studyWin.setTitle(title);
	}

	async onStudyRequestPageCapture(bcr) {
		if (this._studyWin === null) return;  // When window is closed while capturing
		const scaleFactor = electron.screen.getPrimaryDisplay().scaleFactor;
		const ni = await this._studyWin.capturePage(bcr);
		const url = ni.toDataURL();
		return ['capturedImageReceived', [url, scaleFactor]];
	}

	onStudyCapturedImageCreated(dataUrl) {
		const ni = nativeImage.createFromDataURL(dataUrl);
		clipboard.writeImage(ni);
		return ['showServerAlert', ['copiedAsImage', 'success']];
	}

	onStudyErrorOccurred(info) {
		this._backup.backupErrorLog(info, this._codeCache);
	}

	_returnAlertError(e, dir) {
		let err = e.toString();
		let i = err.indexOf("'");
		if (i === -1) i = err.length;
		err = err.substr(0, i).trim();
		return ['alert_error', `\n${dir}\n${err}`];
	}


	// -------------------------------------------------------------------------


	initializeDocument(text = '', filePath = null) {
		const readOnly = filePath ? ((FS().statSync(filePath).mode & 0x0080) === 0) : false;  // Check Write Flag
		const name = filePath ? PATH().basename(filePath, PATH().extname(filePath)) : '';
		const baseName = filePath ? PATH().basename(filePath) : '';
		const dirName = filePath ? PATH().dirname(filePath) : '';

		this._filePath = filePath;
		this._isReadOnly = readOnly;
		this._isModified = false;
		this._backup.setFilePath(filePath);

		this.stop();
		this._studyWin.show();
		return ['init', [filePath, name, baseName, dirName, readOnly, text]];
	}

	doOpen(defaultPath = this._filePath) {
		const fp = dialog.showOpenDialogSync(this._studyWin, { defaultPath: defaultPath ? defaultPath : '', filters: FILE_FILTERS });
		if (fp) return this._openFile(fp[0]);
		else return ['nop'];
	}

	doFileDropped(path) {
		try {
			const isDir = FS().statSync(path).isDirectory();
			if (!isDir) {
				return this._openFile(path);
			}
			const fns = FS().readdirSync(path);
			const fps = fns.map(e => PATH().join(path, e)).filter((fp) => {
				try {
					return FS().statSync(fp).isFile() && /.*\.js$/.test(fp) && !(/.*\.lib\.js$/.test(fp));
				} catch (e) {
					return ['nop'];
				}
			});
			if (fps.length === 1) {
				return this._openFile(fps[0]);
			} else if (fps.length > 1) {
				return this.doOpen(path);
			}
		} catch (e) {
			if (e.code !== 'ENOENT' && e.code !== 'EPERM') return this._returnAlertError(e, path);
		}
	}

	_openFile(filePath) {
		return new Promise(resolve => {
			FS().readFile(filePath, 'utf-8', (error, contents) => {
				resolve(contents);
			});
		}).then((contents) => {
			if (contents === null) {
				return this._returnAlertError('', filePath);
			}
			return this.initializeDocument(contents, filePath);
		});
	}

	doSaveAs(text, dlgTitle) {
		const fp = dialog.showSaveDialogSync(this._studyWin, { title: dlgTitle, defaultPath: this._filePath ? this._filePath : '', filters: FILE_FILTERS });
		if (!fp) return ['nop'];  // No file is selected.
		let writable = true;
		try {
			writable = ((FS().statSync(fp).mode & 0x0080) !== 0);  // check write flag
		} catch (e) {
			if (e.code !== 'ENOENT') return this._returnAlertError(e, fp);
		}
		if (writable) {
			return this._saveFile(fp, text);
		} else {
			// In Windows, the save dialog itself does not allow to select read only files.
			return this._returnAlertError('', fp);
		}
	}

	doSave(text, dlgTitle) {
		if (this._filePath === null || this._isReadOnly) {
			return this.doSaveAs(text, dlgTitle);
		} else {
			return this._saveFile(this._filePath, text);
		}
	}

	_saveFile(fp, text) {
		if (fp.indexOf('.') === -1) fp += DEFAULT_EXT;
		this._filePath = fp;
		this._backup.setFilePath(fp);

		this._backup.backupExistingFile(text, this._filePath);
		try {
			FS().writeFileSync(this._filePath, text.replace(/\n/g, '\r\n'));

			const name     = PATH().basename(this._filePath, PATH().extname(this._filePath));
			const baseName = PATH().basename(this._filePath);
			const dirName  = PATH().dirname(this._filePath);

			this._isModified = false;
			return ['path', [this._filePath, name, baseName, dirName, false]];
		} catch (e) {
			return this._returnAlertError(e, this._filePath);
		}
	}

	doSaveCopy(text, dlgTitle) {
		const fp = dialog.showSaveDialogSync(this._studyWin, { title: dlgTitle, defaultPath: this._filePath ? this._filePath : '', filters: FILE_FILTERS });
		if (!fp) return ['nop'];  // No file is selected.
		let writable = true;
		try {
			writable = ((FS().statSync(fp).mode & 0x0080) !== 0);  // check write flag
		} catch (e) {
			if (e.code !== 'ENOENT') throw e;
		}
		if (writable) {
			if (fp.indexOf('.') === -1) fp += DEFAULT_EXT;
			this._backup.backupExistingFile(text, fp);
			try {
				FS().writeFileSync(fp, text.replace(/\n/g, '\r\n'));
			} catch (e) {
				return this._returnAlertError(e, fp);
			}
		} else {
			// In Windows, the save dialog itself does not allow to select read only files.
			return this._returnAlertError('', fp);
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
		const expDir = PATH().join(PATH().dirname(this._filePath), name + '.lib.js');

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
			this._rmdirSync(expDir);
			FS().mkdirSync(expDir);

			this._exporter.exportAsWebPage(text, this._filePath, expDir);
			return ['success_export', 'exportedAsWebPage'];
		} catch (e) {
			return this._returnAlertError(e, expDir);
		}
	}

	_makeExportPath(fp) {
		const name = PATH().basename(fp, PATH().extname(fp));
		return PATH().join(PATH().dirname(fp), name + '.export');
	}

	_rmdirSync(dirPath) {
		if (!FS().existsSync(dirPath)) return;
		for (let fp of FS().readdirSync(dirPath)) {
			fp = PATH().join(dirPath, fp);
			if (FS().lstatSync(fp).isDirectory()) {
				this._rmdirSync(fp);
			} else {
				FS().unlinkSync(fp);
			}
		}
		FS().rmdirSync(dirPath);
	}


	// -------------------------------------------------------------------------


	stop() {
		if (!this._fieldWin) return;
		this._fieldWin.close();
	}

	async doRun(text) {  // for Promise Test
		if (this._isModified) this._backup.backupText(text);
		this._codeCache = text;

		if (!this._fieldWin) {
			await this._createFieldWindow();
			this._fieldWin.show();
			return this._execute(text);
		} else {
			if (!this._fieldWin.isVisible()) this._fieldWin.show();
			return this._execute(text);
		}
	}

	async doRunWithoutWindow(text) {  // for Promise Test
		if (this._isModified) this._backup.backupText(text);
		this._codeCache = text;

		if (!this._fieldWin) {
			await this._createFieldWindow();
			return this._execute(text);
		} else {
			this._fieldWin.hide();
			return this._execute(text);
		}
	}

	_execute(codeStr) {  // for Promise Test
		const ret = this._exporter.checkLibraryReadable(codeStr, this._filePath);
		if (ret !== true) {
			const info = { msg: ret, library: true, isUserCode: false };
			this._backup.backupErrorLog(info, this._codeCache);
			return ['error', info];
		}
		this._clearTempPath();
		const expDir = this._getTempPath();
		try {
			this._rmdirSync(expDir);
			FS().mkdirSync(expDir);
			const [success, expPath] = this._exporter.exportAsWebPage(codeStr, this._filePath, expDir, true);
			if (!success) {
				const info = { msg: expPath, library: true, isUserCode: false };
				this._backup.backupErrorLog(info, this._codeCache);
				return ['error', info];
			}
			const baseUrl = 'file:///' + expPath.replace(/\\/g, '/');
			const url = baseUrl + '#' + this._id + ',' + this._exporter._userCodeOffset;
			return ['open', url];
		} catch (e) {
			return this._returnAlertError(e, expDir);
		}
	}

	_getTempPath() {
		const tmpdir = OS().tmpdir();
		const name = 'croqujs-' + Date.now();
		const path = PATH().join(tmpdir, name);
		this._tempDirs.push(path);
		return path;
	}

	_clearTempPath() {
		for (let td of this._tempDirs) this._rmdirSync(td);
		this._tempDirs = [];
	}

}

module.exports = Twin;
