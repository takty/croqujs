/**
 * Study
 *
 * @author Takuto Yanagida
 * @version 2026-11-03
 */

import { Config } from '../lib/config.js';
import { ErrorTranslator } from '../lib/error-translator.js';
import { Session } from '#session';
import { Iwc } from '../lib/iwc.js';
import { createShareLink, createShareQr, isShareLink, readShareLink } from '../lib/share.js';
import { WinState } from '../lib/winstate.js';
import { SideMenu } from './ui/side-menu.js';
import { Toolbar } from './ui/toolbar.js';
import { DialogBox } from './ui/dialog-box.js';
import { OutputPane } from './ui/output-pane.js';
import { Splitter } from './ui/splitter.js';
import { WebDraft } from './web-draft.js';
import { createEditor } from 'croq-mirror';
import './style.css';

async function loadJSON(fileNames) {
	const fs = fileNames.map((url) => {
		return fetch(url);
	});
	const ret = [];
	for (let f of fs) {
		const r = await f;
		ret.push(await r.json());
	}
	return ret;
}

const minmax = (val, min, max) => Math.min(max, Math.max(min, val));

export class Study {

	constructor() {
		this._id = import.meta.env.MODE === 'web' ? crypto.randomUUID() : window.location.hash;
		if (this._id) this._id = this._id.replace('#', '');
		this._webDraft = import.meta.env.MODE === 'web'
			? new WebDraft(window.localStorage, '$croqujs_draft:' + new URL('.', document.baseURI).pathname, this._id)
			: null;
		this._session = new Session(this._id);
		this._isLimitedMode = import.meta.env.MODE === 'web' &&
			['showDirectoryPicker', 'showOpenFilePicker', 'showSaveFilePicker'].some(method => typeof window[method] !== 'function');
		this._webAppDisplayMode = import.meta.env.MODE === 'web'
			? window.matchMedia('(display-mode: standalone), (display-mode: window-controls-overlay)')
			: null;
		this._webAppDisplayMode?.addEventListener('change', () => {
			if (this._res) this._updateWindowTitle();
		});
		this._iwc = new Iwc('#study_' + this._id, 'croqujs-iwc:');

		this._winstate = new WinState(window, '$winstate_study');
		const language = /^ja(?:-|$)/i.test(navigator.language) ? 'ja' : 'en';
		this._config = new Config({ fontSize: 16, lineHeight: 165, softWrap: false, functionLineNumber: false, autoIndent: true, language });
		this._config.addEventListener((cfg) => this._configUpdated(cfg));
		this._lang = this._config.getItem('language', 'ja');
		this._permissions = {};
		this._permissionRequests = [];

		this._session.addWindowCloseListener(() => this.executeCommand('close'));
		window.onbeforeunload = (e) => {
			if (!this._isModified) return;
			e.preventDefault();
			e.returnValue = this._res.msg.confirmExit;
		}

		window.addEventListener('keydown', (e) => {
			if (this._editor && !this._editor.hasFocus() && e.ctrlKey && e.key === 'a') e.preventDefault();
			if ((e.ctrlKey || e.metaKey) && e.key === 'F12') this._session.onStudyToggleDevTools();
		});

		this._initFileDrop();
		this.ready = this._initialize();
		window.addEventListener('unload', () => {
			this._iwc.dispose();
			this._splitter?.destroy();
			this._editor?.destroy();
			this._outputPane?.destroy();
		}, { once: true });
	}

	_initFileDrop() {
		let flag = false;
		window.addEventListener('dragenter', (e) => {
			flag = true;
		}, true);
		window.addEventListener('dragleave', (e) => {
			if (!flag) this._toolbar.hideMessage();
			flag = false;
		}, true);
		window.addEventListener('dragover', (e) => {
			if (flag) this._toolbar.showMessage(this._res.msg.openFile);
			flag = false;
			e.preventDefault();
		}, true);
		window.addEventListener('drop', (e) => {
			this._toolbar.hideMessage();
			this._onFileDropped(e);
		}, true);
	}

	async _initialize() {
		const rets = await loadJSON(['res/lang.' + this._lang + '.json', 'res/resource.json', 'res/menu.json', 'res/toolbar.json']);
		this._res = Object.assign(rets[0], rets[1]);
		this._res.menu.version = this._res.version;
		this._session.setResources?.(this._res);
		await this._initEditor();

		this._toolbar = new Toolbar(this._res, rets[3], {
			onCommand: (cmd) => {
				if (cmd === 'menu') this._sideMenu.toggle();
				else this.executeCommand(cmd);
			},
		});
		const menu = rets[2].map(section => ({
			...section,
			items: section.items.filter(item => !item.webOnly || import.meta.env.MODE === 'web'),
		}));
		this._sideMenu = new SideMenu(this._res, menu, {
			onCommand: (cmd, close) => this.executeCommand(cmd, close),
			onClose: () => this._editor.focus(),
			shouldHandleShortcut: (e) => {
				if (document.querySelector('dialog[open]')) return false;
				// Leave copying text in the output pane to the browser on Mac.
				const isMac = navigator.platform.toLowerCase().indexOf('mac') !== -1;
				const isCopy = e.metaKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'c';
				return !(isMac && isCopy && !this._editor.hasFocus());
			},
		});
		this._dialogBox = new DialogBox(this._res, {
			onOpen: () => {
				this._sideMenu.close();
				this._editor.setSettings({ disabled: true });
			},
			onClose: () => {
				this._editor.setSettings({ disabled: false });
				this._editor.focus();
			},
		});
		this._outputPane = new OutputPane(document.querySelector('#output-pane'), this._res, {
			onVisibilityChange: flag => this._splitter.setVisible(flag),
		});

		this._filePath    = null;
		this._name        = null;
		this._baseName    = null;
		this._dirName     = null;
		this._isReadOnly  = false;
		this._isModified  = false;
		this._errorMarker = null;

		this._splitter = new Splitter(document.querySelector('#splitter'), {
			main    : document.querySelector('.main'),
			handle  : document.querySelector('#handle'),
			sub     : document.querySelector('#output-pane'),
			minMain : document.querySelector('.toolbar').offsetHeight + 100,
			onResize: mainHeight => {
				document.querySelector('#editor').style.height = (mainHeight - document.querySelector('.toolbar').offsetHeight) + 'px';
				this._editor.refresh();
			},
		});
		this._initFieldConnection();

		document.addEventListener('focus', (e) => {
			this._readClipboard();
		});
		setTimeout(() => { this._editor.refresh(); }, 0);  // For making the gutter width correct

		this._config.notify();

		const [msg, arg] = await this._session.doReady();
		const draft = this._webDraft?.read() ?? null;
		this._handleServerResponse(msg, arg);
		if (draft !== null) this._loadUnsavedCode(draft);
		if (import.meta.env.MODE === 'web') {
			let loading = this._openShareLink();
			window.addEventListener('hashchange', () => {
				loading = loading.then(() => this._openShareLink());
			});
			await loading;
		}

		this._readClipboard();
		window.focus();
	}

	_loadUnsavedCode(code) {
		this._editor.loadDocument(code);
		this._isModified = true;
		this._session.onStudyModified();
		this._updateWindowTitle();
		return this._webDraft.write(code);
	}

	async _openShareLink() {
		const url = new URL(window.location.href);
		if (!isShareLink(url)) return;

		const messages = this._res.msg;
		let code;
		try {
			code = await readShareLink(url);
		} catch (error) {
			this._removeShareHash(url);
			await this._dialogBox.showAlert(error instanceof RangeError ? messages.shareTooLong : messages.shareInvalid, 'error');
			return;
		}
		if (window.location.href !== url.href) return;
		if (this._isModified || this._webDraft.read() !== null) {
			const { isConfirmed } = await this._dialogBox.showConfirm(messages.confirmShare, 'warning', {
				confirmButtonText: messages.openShare,
				cancelButtonText: messages.keepDraft,
			});
			if (!isConfirmed) {
				this._removeShareHash(url);
				return;
			}
			if (window.location.href !== url.href) return;
		}

		const [, documentArgs] = await this._session.doNew();
		if (window.location.href !== url.href) return;
		this._initDocument(...documentArgs, false);
		if (this._loadUnsavedCode(code)) this._removeShareHash(url);
	}

	_removeShareHash(url) {
		if (window.location.href !== url.href) return;
		url.hash = '';
		window.history.replaceState(window.history.state, '', url);
	}

	async _copyShare(asQr) {
		const messages = this._res.msg;
		const clipboard = navigator.clipboard;
		const mime = asQr ? 'image/png' : 'text/plain';
		const canWriteItem = typeof ClipboardItem === 'function' && clipboard?.write;
		try {
			if (!clipboard || (asQr && !canWriteItem)) throw new Error('Clipboard unavailable');
			const link = createShareLink(new URL(window.location.href), this._editor.getValue());
			if (canWriteItem) {
				// Safari requires the write to begin during the menu gesture.
				const data = import.meta.env.MODE === 'web' && asQr
					? link.then(createShareQr)
					: link.then(url => new Blob([url], { type: mime }));
				const [encoded, copied] = await Promise.allSettled([
					data,
					clipboard.write([new ClipboardItem({ [mime]: data })]),
				]);
				if (encoded.status === 'rejected') throw encoded.reason;
				if (copied.status === 'rejected') throw copied.reason;
			} else {
				await clipboard.writeText(await link);
			}
		} catch (error) {
			const message = error instanceof RangeError
				? (asQr ? messages.shareQrTooLong : messages.shareTooLong)
				: (asQr ? messages.shareQrCopyFailed : messages.shareCopyFailed);
			await this._dialogBox.showAlert(message, 'error');
			return;
		}
		await this._dialogBox.showAlert(asQr ? messages.shareQrCopied : messages.shareCopied, 'success');
	}

	async _readClipboard() {
		try {
			const text = await navigator.clipboard.readText();
			this._reflectClipboardState(text);
		} catch {
			// Clipboard access may be denied or unavailable until the document has focus.
		}
	}

	async _initEditor() {
		this._editor = await createEditor(document.querySelector('#editor'), {
			language  : this._lang,
			fontFamily: this._res.fontSet,
		});
		this._editor.on('change', (event) => {
			this._clearErrorMarker();
			if (event.origin !== 'edit') return;
			this._isModified = true;
			if (event.text === this._webSavedText) this._webDraft?.clear();
			else this._webDraft?.write(event.text);
			this._session.onStudyModified();
		});
		this._editor.on('state', () => {
			if (this._toolbar) this._reflectState();
		});
		this._editor.on('focus', () => { this._sideMenu?.close(); });
		this._editor.on('settings', (settings) => {
			if (settings.fontSize !== this._config.getItem('fontSize')) {
				this._config.setItem('fontSize', settings.fontSize);
			}
		});
		this._editor.on('error', (error) => { console.error(error.message); });
		this._editor.on('copy', ({ text }) => { this._reflectClipboardState(text); });
		this._editor.on('cut',  ({ text }) => { this._reflectClipboardState(text); });
	}

	_initFieldConnection() {
		this._iwc.listen(ma => {
			if (ma.message === 'error') {
				this._session.onStudyErrorOccurred(ma.params);
				this._addErrorMessage(ma.params);
			} else if (ma.message === 'output') {
				this._outputPane.addOutput(ma.params);
			} else if (ma.message === 'requestPermission') {
				this._permissionRequests.push(ma.params);
				if (this._permissionRequests.length === 1) this._handlePermission();
			} else if (ma.message === 'toggleDevTools') {
				this._session.onStudyToggleDevToolsField();
			}
		});
	}

	async _handlePermission() {
		while (this._permissionRequests.length) {
			await this._doHandlePermission(this._permissionRequests[0]);
			this._permissionRequests.shift();
		}
	}

	async _doHandlePermission(type) {
		if (this._permissions[type] !== true) {
			const { value: res } = await this._dialogBox.showConfirm(this._res.msg.permission[type], 'warning');
			this._permissions[type] = res;
		}
		if (this._permissions[type] === true) {
			switch (type) {
				case 'user_media_a':
					if (this._permissions['user_media_v'] === true) this._permissions['user_media_av'] = true;
					break;
				case 'user_media_v':
					if (this._permissions['user_media_a'] === true) this._permissions['user_media_av'] = true;
					break;
				case 'user_media_av':
					this._permissions['user_media_a'] = true;
					this._permissions['user_media_v'] = true;
					break;
			}
		}
		this._iwc.send('#injection_' + this._id, { message: 'permission', params: { type: type, result: this._permissions[type] } });
	}

	// -------------------------------------------------------------------------

	_callField(method, ...args) {
		if (this._session.callField) return this._session.callField(method, ...args);
		this._iwc.send('#field_' + this._id, { message: 'callFieldMethod', params: { method: method, args: args } });
	}

	// -------------------------------------------------------------------------

	_configUpdated(cfg) {
		this._lang = cfg.language;
		document.documentElement.lang = this._lang;

		this._editor.setSettings({
			lineWrapping       : cfg.softWrap,
			lineHeight         : parseInt(cfg.lineHeight, 10),
			fontSize           : parseInt(cfg.fontSize, 10),
			functionLineNumbers: cfg.functionLineNumber,
			autoIndent         : cfg.autoIndent,
		});

		const pane = document.querySelector('.sub');
		pane.style.fontSize = parseInt(cfg.fontSize, 10) + 'px';

		this._editor.refresh();
		this._sideMenu.reflectConfig(cfg);
	}

	_reflectClipboardState(text) {
		this._toolbar.reflectClipboard(text);
		this._sideMenu.reflectClipboard(text);
	}

	_reflectState() {
		const state = {
			isFileOpened: this._filePath !== null,
			canUndo     : this._editor.getState().canUndo,
			canRedo     : this._editor.getState().canRedo,
		}
		this._toolbar.reflectState(state);
		this._sideMenu.reflectState(state);
	}

	// -------------------------------------------------------------------------

	_initDocument(filePath, name, baseName, dirName, readOnly, defJsons, text, clearDraft = true) {
		this._setDocumentFile(filePath, name, baseName, dirName, readOnly, defJsons);

		this._editor.loadDocument(text);
		this._webSavedText = text;
		if (clearDraft) this._webDraft?.clear();
		this._editor.focus();

		this._clearErrorMarker();
		this._outputPane.initialize();
	}

	_setDocumentFile(filePath, name, baseName, dirName, readOnly, defJsons) {
		if (defJsons) {
			const defs = [];
			for (let d of defJsons) {
				try {
					defs.push(JSON.parse(d));
				} catch(e) {
					console.error(d);
				}
			}
			this._editor.setDefinitions(defs);
		} else {
			this._editor.setDefinitions([]);
		}
		this._filePath    = filePath;
		this._name        = name;
		this._baseName    = baseName;
		this._dirName     = dirName;
		this._isReadOnly  = readOnly;
		this._isModified  = false;
		this._reflectState();

		this._editor.setSettings({ readOnly });
		this._updateWindowTitle();
	}

	_updateWindowTitle() {
		const prefix = (this._isModified ? '* ' : '') +
			(this._isLimitedMode ? `(${this._res.limitedMode}) ` : '') +
			(this._isReadOnly ? `(${this._res.readOnly}) ` : '');
		const fn     = (this._filePath === null) ? this._res.untitled : this._baseName;
		const fp     = (this._filePath === null || !this._dirName) ? '' : (' — ' + this._dirName);
		const suffix = this._webAppDisplayMode?.matches ? '' : ' — Croqujs';
		const title  = prefix + fn + fp + suffix;
		if (window.title !== title) {
			window.title = title;
			this._session.onStudyTitleChanged(title);
		}
	}

	_addErrorMessage(info) {
		let msg;
		if (info.library) {
			msg = this._res.msg.cannotReadLibrary.replace('%s', info.msg);
		} else {
			const transMsg = new ErrorTranslator(this._lang).translate(info.msg);
			if (info.isPromise) {
				msg = `[in promise] - ${transMsg}`;
			} else {
				const file = info.isUserCode ? '' : `(${info.fileName}) `;
				msg = `${file}%lineno% [${info.col}] - ${transMsg}`;

				if (!info.isUserCode) {
					const lc = this._extractErrorLocation(info);
					if (lc) {
						info.line       = lc[0];
						info.col        = lc[1];
						info.isUserCode = true;
						msg = `%lineno% [${info.col}] (${info.fileName}) - ${transMsg}`;
					}
				}
				if (info.isUserCode && this._editor.getSettings().functionLineNumbers) {
					const line = Math.max(0, Math.min(info.line - 1, this._editor.getLineCount() - 1));
					const lnf = this._editor.getFunctionLineNumber(line);
					msg = msg.replace('%lineno%', lnf[0] + ':' + lnf[1]);
				} else {
					msg = msg.replace('%lineno%', info.line);
				}
			}
		}
		if (info.isUserCode) {
			const line = Math.max(0, Math.min(info.line - 1, this._editor.getLineCount() - 1));
			const jump = () => {
				this._editor.moveTo({ line, ch: Math.max(0, info.col - 1) });
			};
			this._outputPane.addError(msg, 'err', jump);
			this._clearErrorMarker();
			this._errorMarker = this._editor.highlightLine(line);
			if (this._outputPane.getErrorCount() === 1) jump();
		} else {
			this._outputPane.addError(msg, 'err');
		}
	}

	_clearErrorMarker() {
		if (!this._errorMarker) return;
		this._editor.clearHighlight(this._errorMarker);
		this._errorMarker = null;
	}

	_extractErrorLocation(info) {
		if (!info.stack) return false;
		const stack = info.stack.split('\n').map((e) => e.trim());
		for (let s of stack) {
			if (s.startsWith('at ')) {
				const [, , path] = s.split(' ');
				if (path && path.includes('index.html')) {
					const p = path.indexOf('index.html');
					let loc = path.substr(p + 11);
					if (loc.endsWith(')')) loc = loc.substr(0, loc.length - 1);
					return loc.split(':');
				}
			}
		}
		return false;
	}

	// -------------------------------------------------------------------------

	_cmdTileWindow() {
		this._session.doUnmaximize();
		const x = window.screen.availLeft, y = window.screen.availTop;
		const w = window.screen.availWidth / 2, h = window.screen.availHeight;
		window.moveTo(x, y);
		window.resizeTo(w, h);
		this._callField('alignWindow', x + w, y, w, h);

		const state = { x: x + w, y: y, width: w, height: h };
		window.localStorage.setItem('$winstate_field', JSON.stringify(state));
	}

	// -------------------------------------------------------------------------

	executeCommand(cmd, close = true) {
		if (cmd === 'run' && this._session.prepareRun?.() === false) return;
		if (close) this._sideMenu.close();
		this._editor.setLineSelectionMode(false);

		if (import.meta.env.MODE === 'web' && (cmd === 'copyShareLink' || cmd === 'copyShareQr')) {
			this._copyShare(cmd === 'copyShareQr');
			return;
		}
		setTimeout(() => {
			const cfg = this._config;

			if (this._executeCommandFile(cmd)) return;
			if (this._executeCommandCode(cmd)) return;

			if      (cmd === 'undo')          this._editor.execute('undo');
			else if (cmd === 'redo')          this._editor.execute('redo');
			else if (cmd === 'cut')           this._editor.execute('cut');
			else if (cmd === 'copy')          this._editor.execute('copy');
			else if (cmd === 'paste')         this._editor.execute('paste');
			else if (cmd === 'selectAll')     this._editor.execute('selectAll');
			else if (cmd === 'toggleComment') this._editor.execute('toggleComment');
			else if (cmd === 'format')        this._editor.execute('format');
			else if (cmd === 'find')          this._editor.execute('find');
			else if (cmd === 'findNext')      this._editor.execute('findNext');
			else if (cmd === 'replace')       this._editor.execute('replace');

			else if (cmd === 'tileWin')       this._cmdTileWindow();
			else if (cmd === 'showAbout')     this._dialogBox.showAlert(this._res.about.join('\n'), 'info');

			else if (cmd === 'fontSizePlus')     cfg.setItem('fontSize', minmax(cfg.getItem('fontSize') + 2, 10, 64));
			else if (cmd === 'fontSizeMinus')    cfg.setItem('fontSize', minmax(cfg.getItem('fontSize') - 2, 10, 64));
			else if (cmd === 'fontSizeReset')    cfg.setItem('fontSize', 16);
			else if (cmd === 'lineHeightPlus')   cfg.setItem('lineHeight', minmax(cfg.getItem('lineHeight') + 15, 135, 195));
			else if (cmd === 'lineHeightMinus')  cfg.setItem('lineHeight', minmax(cfg.getItem('lineHeight') - 15, 135, 195));
			else if (cmd === 'lineHeightReset')  cfg.setItem('lineHeight', 165);
			else if (cmd === 'toggleSoftWrap')   cfg.setItem('softWrap', !cfg.getItem('softWrap'));
			else if (cmd === 'toggleFnLineNum')  cfg.setItem('functionLineNumber', !cfg.getItem('functionLineNumber'));
			else if (cmd === 'toggleAutoIndent') cfg.setItem('autoIndent', !cfg.getItem('autoIndent'));
			else if (cmd === 'toggleOutputPane') this._outputPane.toggle();

			if (cmd === 'setLanguageJa') {
				cfg.setItem('language', 'ja');
				this._dialogBox.showAlert(this._res.msg.alertNextTime, 'info');
			} else if (cmd === 'setLanguageEn') {
				cfg.setItem('language', 'en');
				this._dialogBox.showAlert(this._res.msg.alertNextTime, 'info');
			}

			// Experimental
			if (cmd === 'toggleLamono') {
				const ff = this._editor.getSettings().fontFamily;
				if (ff.indexOf('LaMono') === -1) this._editor.setSettings({ fontFamily: 'LaMono, ' + this._res.fontSet });
				else this._editor.setSettings({ fontFamily: this._res.fontSet });
				setTimeout(() => { this._editor.refresh(); }, 0);
			}
		}, 0);
	}

	_handleServerResponse(msg, arg) {
		if (msg === 'init') {
			this._initDocument(...arg);
		} else if (msg === 'path') {
			this._setDocumentFile(...arg);
		} else if (msg === 'success_export') {
			this._dialogBox.showAlert(this._res.msg[arg], 'success');
		} else if (msg === 'open') {
			this._callField('openProgram', arg);
		} else if (msg === 'alert_error') {
			this._dialogBox.showAlert(this._res.msg['error'] + arg, 'error');
		} else if (msg === 'error') {
			this._addErrorMessage(arg);
		}
	}

	// -------------------------------------------------------------------------

	_executeCommandFile(cmd) {
		switch (cmd) {
			case 'new':
				this._handleOpening(this._res.msg.confirmNew, () => this._session.doNew());
				return true;
			case 'open':
				this._handleOpening(this._res.msg.confirmOpen, () => this._session.doOpen());
				return true;
			case 'close':
				this._handleOpening(this._res.msg.confirmExit, () => this._session.doClose(this._editor.getValue()));
				return true;
			case 'save':
				this._handleSaving(text => this._session.doSave(text, this._res.dialogTitle.saveAs));
				return true;
			case 'saveAs':
				this._handleSaving(text => this._session.doSaveAs(text, this._res.dialogTitle.saveAs));
				return true;
			case 'saveCopy':
				this._handleSaving(text => this._session.doSaveCopy(text, this._res.dialogTitle.saveCopy));
				return true;
			case 'exportAsLibrary':
				this._onExportAsLibrary();
				return true;
			case 'exportAsWebPage':
				this._handleSaving(text => this._session.doExportAsWebPage(text));
				return true;
		}
		return false;
	}

	async _onFileDropped(e) {
		e.preventDefault();
		if (this._session.getDroppedFile) {
			if (![...e.dataTransfer.items].some(item => item.kind === 'file')) return;
			const handle = this._session.getDroppedFile(e.dataTransfer);
			this._handleOpening(this._res.msg.confirmOpen, () => this._session.doFileDropped(handle));
		} else if (e.dataTransfer.files.length > 0) {
			const filePath = this._session.getPathForFile(e.dataTransfer.files[0]);
			this._handleOpening(this._res.msg.confirmOpen, () => this._session.doFileDropped(filePath));
		}
	}

	async _onExportAsLibrary() {
		const { value: [libName, flag] } = await this._dialogBox.showPromptWithOption(this._res.msg.enterLibName, '', this._res.msg.libName, this._name, this._res.msg.includeUsedLibs);
		if (libName) {
			try {
				const snapshot   = await this._editor.analyzeNow();
				const [msg, arg] = await this._session.doExportAsLibrary(snapshot.text, libName, flag, JSON.stringify(snapshot));
				this._handleServerResponse(msg, arg);
			} catch (error) {
				await this._dialogBox.showAlert(this._res.msg.error + error.message, 'error');
			}
		}
		return true;
	}

	async _handleOpening(text, open) {
		if (this._isModified) {
			const { value: res } = await this._dialogBox.showConfirm(text, 'warning');
			if (!res) return;
		}
		const [msg, arg] = await open();
		this._handleServerResponse(msg, arg);
	}

	async _handleSaving(save) {
		const text = this._editor.getValue();
		const [msg, arg] = await save(text);
		this._handleServerResponse(msg, arg);
		if (this._webDraft && msg === 'path') {
			this._webSavedText = text;
			if (this._editor.getValue() === text) {
				this._webDraft.clear();
			} else {
				this._isModified = true;
				this._session.onStudyModified();
				this._webDraft.write(this._editor.getValue());
				this._updateWindowTitle();
			}
		}
	}

	// -------------------------------------------------------------------------

	_executeCommandCode(cmd) {
		switch (cmd) {
			case 'run':
				this._handleExecution(text => this._session.doRun(text));
				return true;
			case 'runWithoutWindow':
				this._handleExecution(text => this._session.doRunWithoutWindow(text));
				return true;
			case 'stop':
				this._callField('closeProgram');
				this._session.onStudyProgramClosed();
				return true;
		}
		return false;
	}

	async _handleExecution(run) {
		await this._resetOutputPane();
		const [msg, arg] = await run(this._editor.getValue());
		this._handleServerResponse(msg, arg);
	}

	_resetOutputPane() {
		this._callField('closeProgram');
		this._outputPane.setMessageReceivable(false);

		return new Promise(resolve => {
			setTimeout(() => {
				this._clearErrorMarker();
				this._outputPane.initialize();
				this._outputPane.setMessageReceivable(true);
				resolve();
			}, 100);
		});
	}

}
