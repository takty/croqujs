/**
 * Session Local
 *
 * @author Takuto Yanagida
 * @version 2022-11-05
 */

'use strict';

class SessionLocal {

	#id = null;

	constructor(id) {
		this.#id = id;
	}

	addWindowCloseListener(fn) {
	}


	// -------------------------------------------------------------------------


	onStudyToggleDevTools() {

	}

	onStudyModified() {

	}

	onStudyErrorOccurred(info) {

	}

	onStudyToggleDevToolsField() {

	}

	onStudyTitleChanged(title) {

	}

	onStudyProgramClosed() {

	}

	doUnmaximize() {

	}


	// -------------------------------------------------------------------------


	doReady() {
		return ['', []];
	}

	//

	doNew() {
		return ['init', this.#initializeDocument()];
	}

	doOpen(dirPath = '') {
		return this.#doOpen(dirPath);
	}

	doClose(text) {
		return this.#doClose(text);
	}

	doFileDropped(path) {
		return this.#doFileDropped(path);
	}

	//

	doSave(text, dlgTitle) {
		return this.#doSave(text, dlgTitle);
	}

	doSaveAs(text, dlgTitle) {
		return this.#prepareSaving(text, dlgTitle, false);
	}

	doSaveCopy(text, dlgTitle) {
		return this.#prepareSaving(text, dlgTitle, true);
	}

	doExportAsWebPage(text) {
		return this.#doExportAsWebPage(text);
	}

	doExportAsLibrary(text, libName, isUseDecIncluded, jsonCodeStructure) {
		return this.#doExportAsLibrary(text, libName, isUseDecIncluded, jsonCodeStructure);
	}

	doRun(text) {
		return this.#doRun(text);
	}

	doRunWithoutWindow(text) {
		return this._doRunWithoutWindow(text);
	}


	// -------------------------------------------------------------------------


	#filePath   = null;
	#isReadOnly = false;
	#isModified = false;

	#exporter  = new Exporter();
	#tempDirs  = [];
	#codeCache = '';

	#tempFilePath = null;

	#initializeDocument(text = '', filePath = null) {
		this.#tempFilePath = null;
		if (filePath && filePath.trim().endsWith('.template.js')) {
			this.#tempFilePath = filePath;
			filePath = null;
		}
		const readOnly = filePath ? ((FS().statSync(filePath).mode & 0x0080) === 0) : false;  // Check Write Flag
		const name     = filePath ? PATH().basename(filePath, PATH().extname(filePath)) : '';
		const baseName = filePath ? PATH().basename(filePath) : '';
		const dirName  = filePath ? PATH().dirname(filePath) : '';

		this.#filePath   = filePath;
		this.#isReadOnly = readOnly;
		this.#isModified = false;
		// this.#backup.setFilePath(filePath);

		const defJsons = this.#loadDefJsons(text, this.#tempFilePath ?? filePath);

		this.stop();
		// this._studyWin.show();
		return [filePath, name, baseName, dirName, readOnly, defJsons, text];
	}

	#loadDefJsons(text, filePath) {
		let ret = [];
		if (text !== '' && filePath) ret = this.#exporter.loadDefJsons(text, filePath);
		return ret;
	}

	#returnAlertError(e, dir) {
		let err = e.toString();
		let i = err.indexOf("'");
		if (i === -1) i = err.length;
		err = err.substr(0, i).trim();
		return ['alert_error', `\n${dir}\n${err}`];
	}

	#returnExecutionError(msg) {
		const info = { msg: msg, library: true, isUserCode: false };
		// this.#backup.backupErrorLog(info, this.#codeCache);
		return ['error', info];
	}

	#doOpen(dirPath = '') {
		if (dirPath !== '' && this.#filePath) dirPath = this.#filePath;
		const fp = dialog.showOpenDialogSync(this._studyWin, { defaultPath: dirPath, filters: FILE_FILTERS });
		if (fp) return this.#openFile(fp[0]);
		return ['nop'];
	}

	async #openFile(filePath) {
		const text = await new Promise(resolve => {
			FS().readFile(filePath, 'utf-8', (error, contents) => { resolve(contents); });
		});
		if (text === null) return this.#returnAlertError('', filePath);
		return ['init', this.#initializeDocument(text, filePath)];
	}

	#doClose(text) {
		// if (this.#isModified) this._backup.backupText(text);

		this._studyWin.destroy();
		this._studyWin = null;
		if (this._fieldWin) this._fieldWin.close();

		this._clearTempPath();
	}

	#doFileDropped(path) {
		try {
			const isDir = FS().statSync(path).isDirectory();
			if (!isDir) return this.#openFile(path);

			const fns = FS().readdirSync(path);
			const fps = fns.map(e => PATH().join(path, e)).filter((fp) => {
				try {
					return FS().statSync(fp).isFile() && /.*\.js$/.test(fp) && !(/.*\.lib\.js$/.test(fp));
				} catch (e) {
					return ['nop'];
				}
			});
			if (fps.length === 1) return this.#openFile(fps[0]);
			if (fps.length > 1)   return this.doOpen(path);
		} catch (e) {
			if (e.code !== 'ENOENT' && e.code !== 'EPERM') return this.#returnAlertError(e, path);
		}
	}

	#prepareSaving(text, dlgTitle, copy) {
		const fp = dialog.showSaveDialogSync(this._studyWin, { title: dlgTitle, defaultPath: this.#filePath ? this.#filePath : '', filters: FILE_FILTERS });
		if (!fp) return ['nop'];  // No file is selected.
		let writable = true;
		try {
			writable = ((FS().statSync(fp).mode & 0x0080) !== 0);  // check write flag
		} catch (e) {
			if (e.code !== 'ENOENT') return this.#returnAlertError(e, fp);
		}
		if (writable) {
			if (copy && this.#tempFilePath === null) return this.#saveCopy(fp, text);
			else return this.#save(fp, text);
		}
		// In Windows, the save dialog itself does not allow to select read only files.
		return this.#returnAlertError('', fp);
	}

	#doSave(text, dlgTitle) {
		if (this.#filePath === null || this.#isReadOnly) {
			return this.doSaveAs(text, dlgTitle);
		} else {
			return this.#save(this.#filePath, text);
		}
	}

	#save(fp, text) {
		if (fp.indexOf('.') === -1) fp += DEFAULT_EXT;
		this.#filePath = fp;
		this._backup.setFilePath(fp);
		this._backup.backupExistingFile(text, this.#filePath);
		try {
			FS().writeFileSync(this.#filePath, text.replace(/\n/g, '\r\n'));
			if (this.#tempFilePath) {
				this.#exporter.copyLibraryOfTemplate(text, this.#tempFilePath, PATH().dirname(this.#filePath));
				this.#tempFilePath = null;
			}

			const name     = PATH().basename(this.#filePath, PATH().extname(this.#filePath));
			const baseName = PATH().basename(this.#filePath);
			const dirName  = PATH().dirname(this.#filePath);

			const defJsons = this.#loadDefJsons(text, this.#filePath);

			this.#isModified = false;
			return ['path', [this.#filePath, name, baseName, dirName, false, defJsons]];
		} catch (e) {
			return this.#returnAlertError(e, this.#filePath);
		}
	}

	#saveCopy(fp, text) {
		if (fp.indexOf('.') === -1) fp += DEFAULT_EXT;
		// this._backup.backupExistingFile(text, fp);
		try {
			FS().writeFileSync(fp, text.replace(/\n/g, '\r\n'));
			return ['nop'];
		} catch (e) {
			return this.#returnAlertError(e, fp);
		}
	}

	#doExportAsWebPage(text) {
		if (this.#filePath === null) return ['nop'];
		const expDir = this._makeExportPath(this.#filePath);
		try {
			this._rmdirSync(expDir);
			FS().mkdirSync(expDir);

			this.#exporter.exportAsWebPage(text, this.#filePath, expDir);
			return ['success_export', 'exportedAsWebPage'];
		} catch (e) {
			return this.#returnAlertError(e, expDir);
		}
	}

	#doExportAsLibrary(text, libName, isUseDecIncluded, jsonCodeStructure) {
		const codeStructure = JSON.parse(jsonCodeStructure);
		const name = libName.replace(' ', '_').replace('-', '_').replace('+', '_').replace('/', '_').replace('.', '_');
		const expDir = PATH().join(PATH().dirname(this.#filePath), name + '.lib.js');

		try {
			this.#exporter.exportAsLibrary(text, expDir, name.toUpperCase(), codeStructure, isUseDecIncluded);
			return ['success_export', 'exportedAsLibrary'];
		} catch (e) {
			return this.#returnAlertError(e, expDir);
		}
	}

	async #doRun(text) {
		if (this.#isModified) this._backup.backupText(text);
		this.#codeCache = text;

		if (!this._fieldWin) {
			await this._createFieldWindow();
		}
		this._fieldWin.show();
		while (!this._fieldWin.isVisible()) {
			await new Promise(resolve => setTimeout(resolve, 200));
		}
		return this.#execute(text);
	}

	async _doRunWithoutWindow(text) {
		if (this.#isModified) this._backup.backupText(text);
		this.#codeCache = text;

		if (!this._fieldWin) {
			await this._createFieldWindow();
		} else {
			this._fieldWin.hide();
		}
		return this.#execute(text);
	}

	#execute(codeStr) {
		const ret = this.#exporter.checkLibraryReadable(codeStr, this.#filePath ?? this.#tempFilePath);
		if (ret !== true) return this.#returnExecutionError(ret);

		this._clearTempPath();
		const expDir = this._getTempPath();
		try {
			this._rmdirSync(expDir);
			FS().mkdirSync(expDir);
			const [success, expPath] = this.#exporter.exportAsWebPage(codeStr, this.#filePath ?? this.#tempFilePath, expDir, true);
			if (!success) return this.#returnExecutionError(expPath);

			const baseUrl = 'file:///' + expPath.replace(/\\/g, '/');
			const url = baseUrl + '#' + this._id + ',' + this.#exporter._userCodeOffset;
			return ['open', url];
		} catch (e) {
			return this.#returnAlertError(e, expDir);
		}
	}

}
