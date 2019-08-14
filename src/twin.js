/**
 *
 * Twin (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2019-08-13
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

		ipcMain.on('fromRenderer_' + this._id, (ev, msg, ...args) => {
			if (this[msg]) this[msg](...args);
		});
		promiseIpc.on('fromRendererPromise_' + this._id, ([msg, ...args], ev) => {
			console.log(msg);
			let res = null;
			if (this[msg]) res = this[msg](...args);
			console.log(res);
			return res;
		});
		if (path) this._initPath = path;
		this._createStudyWindow();
	}

	_createStudyWindow() {
		this._studyWin = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true } });
		this._studyWin.loadURL(`file://${__dirname}/study/study.html#${this._id}`);
		this._studyWin.once('ready-to-show', () => {
			// this._studyWin.show();
			// if (this._initPath) {
			// 	setTimeout(() => { this._openFile(this._initPath); }, 100);
			// } else {
			// 	this._initializeDocument();
			// }
		});
		this._studyWin.on('close', (e) => {
			e.preventDefault();
			this.callStudyMethod('executeCommand', 'close');
		});
		this._studyWin.setMenu(null);
	}

	onStudyReady() {
		if (this._initPath) {
			return this._openFile_(this._initPath);
		} else {
			return this._initializeDocument_();
		}
	}

	// _initializeDocument(text = '', filePath = null) {
	// 	const readOnly = filePath ? ((FS().statSync(filePath).mode & 0x0080) === 0) : false;  // Check Write Flag
	// 	const name = filePath ? PATH().basename(filePath, PATH().extname(filePath)) : '';
	// 	const baseName = filePath ? PATH().basename(filePath) : '';
	// 	const dirName = filePath ? PATH().dirname(filePath) : '';

	// 	setTimeout(() => {
	// 		this.callStudyMethod('initializeDocument', text, filePath, name, baseName, dirName, readOnly);
	// 	}, 100);

	// 	this._filePath = filePath;
	// 	this._isReadOnly = readOnly;
	// 	this._isModified = false;
	// 	this._backup.setFilePath(filePath);

	// 	this.stop();
	// 	this._studyWin.show();
	// }

	_initializeDocument_(text = '', filePath = null) {
		const readOnly = filePath ? ((FS().statSync(filePath).mode & 0x0080) === 0) : false;  // Check Write Flag
		const name     = filePath ? PATH().basename(filePath, PATH().extname(filePath)) : '';
		const baseName = filePath ? PATH().basename(filePath) : '';
		const dirName  = filePath ? PATH().dirname(filePath) : '';

		this._filePath   = filePath;
		this._isReadOnly = readOnly;
		this._isModified = false;
		this._backup.setFilePath(filePath);

		this.stop();
		this._studyWin.show();
		return ['initializeDocument', [text, filePath, name, baseName, dirName, readOnly]];
	}


	// -------------------------------------------------------------------------


	callStudyMethod(method, ...args) {
		this._studyWin.webContents.send('callStudyMethod', method, ...args);
	}


	// -------------------------------------------------------------------------


	onStudyModified() {
		this._isModified = true;
	}

	onStudyTitleChanged(title) {
		this._studyWin.setTitle(title);
	}

	onStudyRequestPageCapture(bcr) {
		if (this._studyWin === null) return;  // When window is closed while capturing
		const scaleFactor = electron.screen.getPrimaryDisplay().scaleFactor;
		this._studyWin.capturePage(bcr, (ni) => {
			const url = ni.toDataURL();
			this.callStudyMethod('capturedImageReceived', url, scaleFactor);
		});
	}

	onStudyCapturedImageCreated(dataUrl) {
		const ni = nativeImage.createFromDataURL(dataUrl);
		clipboard.writeImage(ni);
		setTimeout(() => { this.callStudyMethod('showServerAlert', 'copiedAsImage', 'success'); }, 0);
	}

	onStudyErrorOccurred(info) {
		this._backup.backupErrorLog(info, this._codeCache);
	}


	// -------------------------------------------------------------------------


	// doOpen(defaultPath = this._filePath) {
	// 	const fp = dialog.showOpenDialogSync(this._studyWin, { defaultPath: defaultPath ? defaultPath : '', filters: FILE_FILTERS });
	// 	if (fp) this._openFile(fp[0]);
	// }

	// doFileDropped(path) {
	// 	try {
	// 		const isDir = FS().statSync(path).isDirectory();
	// 		if (!isDir) {
	// 			this._openFile(path);
	// 			return;
	// 		}
	// 		const fns = FS().readdirSync(path);
	// 		const fps = fns.map(e => PATH().join(path, e)).filter((fp) => {
	// 			try {
	// 				return FS().statSync(fp).isFile() && /.*\.js$/.test(fp) && !(/.*\.lib\.js$/.test(fp));
	// 			} catch (e) {
	// 				return false;
	// 			}
	// 		});
	// 		if (fps.length === 1) {
	// 			this._openFile(fps[0]);
	// 		} else if (fps.length > 1) {
	// 			this.doOpen(path);
	// 		}
	// 	} catch (e) {
	// 		if (e.code !== 'ENOENT' && e.code !== 'EPERM') throw e;
	// 	}
	// }

	// _openFile(filePath) {
	// 	FS().readFile(filePath, 'utf-8', (error, contents) => {
	// 		if (contents === null) {
	// 			this._outputError('', filePath);
	// 			return;
	// 		}
	// 		this._initializeDocument(contents, filePath);
	// 	});
	// }

	doOpen_(defaultPath = this._filePath) {
		const fp = dialog.showOpenDialogSync(this._studyWin, { defaultPath: defaultPath ? defaultPath : '', filters: FILE_FILTERS });
		if (fp) return this._openFile_(fp[0]);
	}

	doFileDropped_(path) {
		try {
			const isDir = FS().statSync(path).isDirectory();
			if (!isDir) {
				return this._openFile_(path);
			}
			const fns = FS().readdirSync(path);
			const fps = fns.map(e => PATH().join(path, e)).filter((fp) => {
				try {
					return FS().statSync(fp).isFile() && /.*\.js$/.test(fp) && !(/.*\.lib\.js$/.test(fp));
				} catch (e) {
					return false;
				}
			});
			if (fps.length === 1) {
				return this._openFile_(fps[0]);
			} else if (fps.length > 1) {
				return this.doOpen_(path);
			}
		} catch (e) {
			if (e.code !== 'ENOENT' && e.code !== 'EPERM') throw e;
		}
	}

	_openFile_(filePath) {
		return new Promise(resolve => {
			FS().readFile(filePath, 'utf-8', (error, contents) => {
				resolve(contents);
			});
		}).then((contents) => {
			if (contents === null) {
				return this._outputError_('', filePath);
			}
			return this._initializeDocument_(contents, filePath);
		});
	}

	// doSaveAs(text, dlgTitle) {
	// 	const fp = dialog.showSaveDialogSync(this._studyWin, { title: dlgTitle, defaultPath: this._filePath ? this._filePath : '', filters: FILE_FILTERS });
	// 	if (!fp) return;  // No file is selected.
	// 	let writable = true;
	// 	try {
	// 		writable = ((FS().statSync(fp).mode & 0x0080) !== 0);  // check write flag
	// 	} catch (e) {
	// 		if (e.code !== 'ENOENT') throw e;
	// 	}
	// 	if (writable) {
	// 		this._saveFile(fp, text);
	// 	} else {
	// 		// In Windows, the save dialog itself does not allow to select read only files.
	// 		this._outputError(e, this._filePath);
	// 	}
	// }

	// doSave(text, dlgTitle) {
	// 	if (this._filePath === null || this._isReadOnly) {
	// 		this.doSaveAs(text, dlgTitle);
	// 	} else {
	// 		this._saveFile(this._filePath, text);
	// 	}
	// }

	// _saveFile(fp, text) {
	// 	if (fp.indexOf('.') === -1) fp += DEFAULT_EXT;
	// 	this._filePath = fp;
	// 	this._backup.setFilePath(fp);

	// 	this._backup.backupExistingFile(text, this._filePath);
	// 	try {
	// 		FS().writeFileSync(this._filePath, text.replace(/\n/g, '\r\n'));

	// 		const name     = PATH().basename(this._filePath, PATH().extname(this._filePath));
	// 		const baseName = PATH().basename(this._filePath);
	// 		const dirName  = PATH().dirname(this._filePath);
	// 		this.callStudyMethod('setDocumentFilePath', this._filePath, name, baseName, dirName, false);

	// 		this._isModified = false;
	// 	} catch (e) {
	// 		this._outputError(e, this._filePath);
	// 	}
	// }

	doSaveAs_(text, dlgTitle) {
		const fp = dialog.showSaveDialogSync(this._studyWin, { title: dlgTitle, defaultPath: this._filePath ? this._filePath : '', filters: FILE_FILTERS });
		if (!fp) return;  // No file is selected.
		let writable = true;
		try {
			writable = ((FS().statSync(fp).mode & 0x0080) !== 0);  // check write flag
		} catch (e) {
			if (e.code !== 'ENOENT') throw e;
		}
		if (writable) {
			return this._saveFile_(fp, text);
		} else {
			// In Windows, the save dialog itself does not allow to select read only files.
			return this._outputError_(e, this._filePath);
		}
	}

	doSave_(text, dlgTitle) {
		if (this._filePath === null || this._isReadOnly) {
			return this.doSaveAs_(text, dlgTitle);
		} else {
			return this._saveFile_(this._filePath, text);
		}
	}

	_saveFile_(fp, text) {
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
			return ['setDocumentFilePath', [this._filePath, name, baseName, dirName, false]];
		} catch (e) {
			return this._outputError_(e, this._filePath);
		}
	}

	// doSaveCopy(text, dlgTitle) {
	// 	const fp = dialog.showSaveDialogSync(this._studyWin, { title: dlgTitle, defaultPath: this._filePath ? this._filePath : '', filters: FILE_FILTERS });
	// 	if (!fp) return;  // No file is selected.
	// 	let writable = true;
	// 	try {
	// 		writable = ((FS().statSync(fp).mode & 0x0080) !== 0);  // check write flag
	// 	} catch (e) {
	// 		if (e.code !== 'ENOENT') throw e;
	// 	}
	// 	if (writable) {
	// 		if (fp.indexOf('.') === -1) fp += DEFAULT_EXT;
	// 		this._backup.backupExistingFile(text, fp);
	// 		try {
	// 			FS().writeFileSync(fp, text.replace(/\n/g, '\r\n'));
	// 		} catch (e) {
	// 			this._outputError(e, fp);
	// 		}
	// 	} else {
	// 		// In Windows, the save dialog itself does not allow to select read only files.
	// 		this._outputError(e, this._filePath);
	// 	}
	// }

	doSaveCopy_(text, dlgTitle) {
		const fp = dialog.showSaveDialogSync(this._studyWin, { title: dlgTitle, defaultPath: this._filePath ? this._filePath : '', filters: FILE_FILTERS });
		if (!fp) return;  // No file is selected.
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
				return this._outputError_(e, fp);
			}
		} else {
			// In Windows, the save dialog itself does not allow to select read only files.
			return this._outputError_(e, this._filePath);
		}
	}

	// _outputError(e, dir) {
	// 	let err = e.toString();
	// 	let i = err.indexOf("'");
	// 	if (i === -1) i = err.length;
	// 	err = err.substr(0, i).trim();
	// 	this.callStudyMethod('showServerAlert', 'error', 'error', '\n' + dir + '\n' + err);
	// }

	_outputError_(e, dir) {
		let err = e.toString();
		let i = err.indexOf("'");
		if (i === -1) i = err.length;
		err = err.substr(0, i).trim();
		return ['showServerAlert', ['error', 'error', '\n' + dir + '\n' + err]];
	}

	doClose(text) {
		if (this._isModified) this._backup.backupText(text);

		this._studyWin.destroy();
		this._studyWin = null;
		if (this._fieldWin) this._fieldWin.close();

		this._clearTempPath();
	}

	// doExportAsLibrary(libName, isUseDecIncluded, text, jsonCodeStructure) {
	// 	const codeStructure = JSON.parse(jsonCodeStructure);
	// 	const name = libName.replace(' ', '_').replace('-', '_').replace('+', '_').replace('/', '_').replace('.', '_');
	// 	const expDir = PATH().join(PATH().dirname(this._filePath), name + '.lib.js');

	// 	try {
	// 		this._exporter.exportAsLibrary(text, expDir, name.toUpperCase(), codeStructure, isUseDecIncluded);
	// 		this.callStudyMethod('showServerAlert', 'exportedAsLibrary', 'success');
	// 	} catch (e) {
	// 		this._outputError(e, expDir);
	// 	}
	// }

	doExportAsLibrary_(libName, isUseDecIncluded, text, jsonCodeStructure) {
		const codeStructure = JSON.parse(jsonCodeStructure);
		const name = libName.replace(' ', '_').replace('-', '_').replace('+', '_').replace('/', '_').replace('.', '_');
		const expDir = PATH().join(PATH().dirname(this._filePath), name + '.lib.js');

		try {
			this._exporter.exportAsLibrary(text, expDir, name.toUpperCase(), codeStructure, isUseDecIncluded);
			return ['showServerAlert', ['exportedAsLibrary', 'success']];
		} catch (e) {
			return this._outputError_(e, expDir);
		}
	}

	// doExportAsWebPage(text) {
	// 	if (this._filePath === null) return;
	// 	const expDir = this._makeExportPath(this._filePath);
	// 	try {
	// 		this._rmdirSync(expDir);
	// 		FS().mkdirSync(expDir);

	// 		this._exporter.exportAsWebPage(text, this._filePath, expDir);
	// 		this.callStudyMethod('showServerAlert', 'exportedAsWebPage', 'success');
	// 	} catch (e) {
	// 		this._outputError(e, expDir);
	// 	}
	// }

	doExportAsWebPage_(text) {
		if (this._filePath === null) return ['', []];
		const expDir = this._makeExportPath(this._filePath);
		try {
			this._rmdirSync(expDir);
			FS().mkdirSync(expDir);

			this._exporter.exportAsWebPage(text, this._filePath, expDir);
			return ['showServerAlert', ['exportedAsWebPage', 'success']];
		} catch (e) {
			return this._outputError_(e, expDir);
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

	// doRun(text) {
	// 	if (this._isModified) this._backup.backupText(text);
	// 	this._codeCache = text;

	// 	if (!this._fieldWin) {
	// 		this._createFieldWindow();
	// 		this._fieldWin.once('ready-to-show', () => {
	// 			this._fieldWin.show();
	// 			this._execute(text);
	// 		});
	// 	} else {
	// 		if (!this._fieldWin.isVisible()) this._fieldWin.show();
	// 		this._execute(text);
	// 	}
	// }

	// doRunWithoutWindow(text) {
	// 	if (this._isModified) this._backup.backupText(text);
	// 	this._codeCache = text;

	// 	if (!this._fieldWin) {
	// 		this._createFieldWindow();
	// 		this._fieldWin.once('ready-to-show', () => { this._execute(text); });
	// 	} else {
	// 		this._fieldWin.hide();
	// 		this._execute(text);
	// 	}
	// }

	// _execute(codeStr) {
	// 	const ret = this._exporter.checkLibraryReadable(codeStr, this._filePath);
	// 	if (ret !== true) {
	// 		const info = { msg: ret, library: true, isUserCode: false };
	// 		this._backup.backupErrorLog(info, this._codeCache);
	// 		this.callStudyMethod('addErrorMessage', info);
	// 		return;
	// 	}
	// 	this._clearTempPath();
	// 	const expDir = this._getTempPath();
	// 	try {
	// 		this._rmdirSync(expDir);
	// 		FS().mkdirSync(expDir);
	// 		const [success, expPath] = this._exporter.exportAsWebPage(codeStr, this._filePath, expDir, true);
	// 		if (!success) {
	// 			const info = { msg: expPath, library: true, isUserCode: false };
	// 			this._backup.backupErrorLog(info, this._codeCache);
	// 			this.callStudyMethod('addErrorMessage', info);
	// 			return;
	// 		}
	// 		const baseUrl = 'file:///' + expPath.replace(/\\/g, '/');
	// 		const url = baseUrl + '#' + this._id + ',' + this._exporter._userCodeOffset;
	// 		this.callStudyMethod('openProgram', url);
	// 	} catch (e) {
	// 		this._outputError(e, expDir);
	// 	}
	// }

	async doRun_(text) {  // for Promise Test
		if (this._isModified) this._backup.backupText(text);
		this._codeCache = text;

		if (!this._fieldWin) {
			await this._createFieldWindow();
			this._fieldWin.show();
			return this._execute_(text);
		} else {
			if (!this._fieldWin.isVisible()) this._fieldWin.show();
			return this._execute_(text);
		}
	}

	async doRunWithoutWindow_(text) {  // for Promise Test
		if (this._isModified) this._backup.backupText(text);
		this._codeCache = text;

		if (!this._fieldWin) {
			await this._createFieldWindow();
			return this._execute_(text);
		} else {
			this._fieldWin.hide();
			return this._execute_(text);
		}
	}

	_execute_(codeStr) {  // for Promise Test
		const ret = this._exporter.checkLibraryReadable(codeStr, this._filePath);
		if (ret !== true) {
			const info = { msg: ret, library: true, isUserCode: false };
			this._backup.backupErrorLog(info, this._codeCache);
			return ['addErrorMessage', [info]];
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
				return ['addErrorMessage', [info]];
			}
			const baseUrl = 'file:///' + expPath.replace(/\\/g, '/');
			const url = baseUrl + '#' + this._id + ',' + this._exporter._userCodeOffset;
			return ['openProgram', [url]];
		} catch (e) {
			return this._outputError_(e, expDir);
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

	_createFieldWindow() {
		this._fieldWin = new BrowserWindow({ show: false });
		this._fieldWin.loadURL(`file://${__dirname}/field/field.html#${this._id}`);
		this._fieldWin.on('closed', () => { this._fieldWin = null; });
		this._fieldWin.setMenu(null);
		return new Promise(resolve => {
			this._fieldWin.once('ready-to-show', () => { resolve(); });
		});
	}

}

module.exports = Twin;
