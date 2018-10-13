/**
 *
 * Study (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-10-11
 *
 */


'use strict';

const electron = require('electron');
const {ipcRenderer} = electron;

const MAX_CONSOLE_OUTPUT_SIZE = 100;

function createDelayFunction(fn, delay) {
	let st = null;
	return () => {
		if (st) clearTimeout(st);
		st = setTimeout(fn, delay);
	};
}


class Study {

	constructor() {
		this._id = window.location.hash;
		if (this._id) this._id = this._id.replace('#', '');
		ipcRenderer.on('callStudyMethod',  (ev, method, ...args) => { this[method](...args); });

		window.ondragover = window.ondrop = (e) => { e.preventDefault(); return false; };

		this._errorMarker = null;
		window.onkeydown = (e) => {
			if (this._editor._comp.hasFocus()) return;
			if (e.ctrlKey && e.keyCode == 'A'.charCodeAt(0)) {
				e.preventDefault();
				return false;
			}
		}

		this._config = new Config({ fontSize: 16, lineHeight: 165, softWrap: false, functionLineNumber: false, language: 'ja' });
		this._config.addEventListener((conf) => this.configUpdated(conf));
		this._lang = this._config.getItem('language');
		if (!this._lang) this._lang = 'ja';
		this._res = ipcRenderer.sendSync('getResource', this._lang);

		this._initEditor();

		this._toolbar    = new Toolbar(this, this._res);
		this._sideMenu   = new SideMenu(this, this._res);
		this._dialogBox  = new DialogBox(this, this._res);
		this._outputPane = new OutputPane();

		this._initWindowResizing(this._editor);

		setTimeout(() => { this._editor.refresh(); }, 0);  // For making the gutter width correct
		this._initOutputPoller();

		window.addEventListener('storage', (e) => {
			if ('study_' + this._id === e.key) {
				window.localStorage.removeItem(e.key);
				const ma = JSON.parse(e.newValue);
				if (ma.message === 'error') {
					this._twinMessage('onFieldErrorOccurred', ma.params);
				} else if (ma.message === 'output') {
					this._twinMessage('onFieldOutputOccurred', ma.params);
				}
			}
		});
		ipcRenderer.on('callFieldMethod', (ev, method, ...args) => {
			window.localStorage.setItem('field_' + this._id, JSON.stringify({ message: 'callFieldMethod', params: {method: method, args: args} }));
		});

		this._filePath    = null;
		this._name        = null;
		this._isReadOnly  = false;
		this._isModified  = false;
		this._historySize = { undo: 0, redo: 0 };

		this._config.notify();
	}

	_initEditor() {
		this._editor = new Editor(this, document.querySelector('#editor'));
		this._editor.fontFamily(this._res.fontSet);
		this._editor.rulerEnabled(true);
		const ec = this._editor.getComponent();

		const w = new Worker('analyzer.js');
		w.addEventListener('message', (e) => {
			this._codeStructure = e.data;
			this._editor.setCodeStructureData(this._codeStructure);
		}, false);
		const analize = createDelayFunction(() => { w.postMessage(ec.getValue()); }, 400);

		ec.on('change', () => {
			this._clearErrorMarker();
			if (this._editor.enabled()) {
				this._isModified  = true;
				this._historySize = this._editor._comp.getDoc().historySize();
				this._twinMessage('onStudyModified', this._historySize );
				this._reflectState();
			}
			analize();
		});
		ec.on('drop', (em, ev) => {
			ev.preventDefault();
			if (ev.dataTransfer.files.length > 0) {
				const filePath = ev.dataTransfer.files[0].path;
				this._checkCanDiscard(this._res.msg.confirmOpen, 'doFileDropped', filePath);
			}
		});
		ec.on('focus', () => { this._sideMenu.close(); });
	}

	_initWindowResizing(ed) {
		const body   = document.querySelector('body');
		const main   = document.querySelector('.main');
		const tbar   = document.querySelector('.toolbar');
		const editor = document.querySelector('#editor');
		const div    = document.querySelector('#handle');
		const sub    = document.querySelector('.sub');

		const tbarH  = tbar.offsetHeight;
		const divH   = this._res.divH;

		let mouseDown = false, resizing = false;
		let subH = 100, py;

		const setSubPaneHeight = (subH) => {
			const h   = body.offsetHeight;
			const edH = h - (tbarH + divH + subH);
			editor.style.height = edH + 'px';
			main.style.height   = (tbarH + edH) + 'px';
			sub.style.height    = subH + 'px';
			ed.refresh();
		};
		const onMouseMoveDiv = (e) => {
			if (!mouseDown) return;
			const h = body.offsetHeight;
			const mainH = e.pageY - py;

			let subH = h - (mainH + divH);
			if (mainH - tbarH < 100) subH = h - (tbarH + 100 + divH);
			if (subH < 32) subH = 0;
			setSubPaneHeight(subH);
			resizing = true;
			e.preventDefault();
		};
		const onMouseUpDiv = (e) => {
			if (!mouseDown) return;
			mouseDown = false;
			if (sub.offsetHeight > 32) subH = sub.offsetHeight;
			e.preventDefault();
		};
		div.addEventListener('mousedown', (e) => {
			py = e.pageY - div.offsetTop;
			mouseDown = true;
			resizing = false;
		});
		div.addEventListener('mousemove', onMouseMoveDiv);
		div.addEventListener('mouseup', onMouseUpDiv);
		div.addEventListener('click', () => { if (!resizing) setSubPaneHeight(sub.offsetHeight === 0 ? subH : 0); });

		document.body.addEventListener('mousemove', onMouseMoveDiv);
		document.body.addEventListener('mouseup', onMouseUpDiv);
		document.body.addEventListener('mouseenter', (e) => { if (mouseDown && !e.buttons) mouseDown = false; });

		window.addEventListener('resize', () => { setSubPaneHeight(sub.offsetHeight); });
		setSubPaneHeight(sub.offsetHeight);
	}

	_initOutputPoller() {
		let lastTime = window.performance.now();
		const loop = (curTime) => {
			if (200 < curTime - lastTime) {
				this._twinMessage('onStudyRequestOutput', MAX_CONSOLE_OUTPUT_SIZE);
				lastTime = curTime;
			}
			window.requestAnimationFrame(loop);
		};
		window.requestAnimationFrame(loop);
	}

	_twinMessage(msg, ...args) {
		ipcRenderer.send('fromRenderer_' + this._id, msg, ...args);
	}

	_twinMessageSync(msg, ...args) {
		return ipcRenderer.sendSync('fromRendererSync_' + this._id, msg, ...args);
	}


	// -------------------------------------------------------------------------


	configUpdated(conf) {
		this._lang = conf.language;

		this._editor.lineWrapping(conf.softWrap);
		this._editor.lineHeight(parseInt(conf.lineHeight, 10) + '%');
		this._editor.fontSize(parseInt(conf.fontSize, 10));
		this._editor.functionLineNumberEnabled(conf.functionLineNumber);

		const pane = document.querySelector('.sub');
		pane.style.fontSize = parseInt(conf.fontSize, 10) + 'px';

		if (!this._jsHintLoaded) {
			const se = document.createElement('script');
			se.src = './lib/jshint/' + (this._lang === 'en' ? 'jshint.js' : 'jshint-ja-edu.js');
			document.getElementsByTagName('head')[0].appendChild(se);
			this._jsHintLoaded = true;
		}
		this._editor.refresh();
		this._sideMenu.reflectConfig(conf);

		setTimeout(() => { this._twinMessage('onStudyConfigModified', conf); }, 100);
	}

	reflectClipboardState(text) {  // Called By Main
		this._toolbar.reflectClipboard(text);
		this._sideMenu.reflectClipboard(text);
	}

	_reflectState() {
		const state = {
			isFileOpened: this._filePath !== null,
			canUndo     : this._historySize.undo > 0,
			canRedo     : this._historySize.redo > 0,
		}
		this._toolbar.reflectState(state);
		this._sideMenu.reflectState(state);
	}

	onEditorEnabled(flag) {
		this._twinMessage('onStudyEnabled', flag);
	}

	onEditorClipboardChanged() {
		setTimeout(() => { ipcRenderer.send('onClipboardChanged'); }, 0);
	}


	// -------------------------------------------------------------------------


	initializeDocument(text, filePath, name, readOnly) {  // Called By Twin
		this._filePath   = filePath;
		this._name       = name;
		this._isReadOnly = readOnly;
		this._isModified = false;
		this._reflectState();

		this._editor.enabled(false);
		this._editor.value(text);
		this._editor.readOnly(readOnly);
		this._editor.enabled(true);

		this._clearErrorMarker();
		this._outputPane.initialize();
	}

	setDocumentFilePath(filePath, name, readOnly) {  // Called By Twin
		this._filePath   = filePath;
		this._name       = name;
		this._isReadOnly = readOnly;
		this._isModified = false;
		this._reflectState();

		this._editor.readOnly(readOnly);
	}

	_clearErrorMarker() {
		if (this._errorMarker) {
			this._editor.getComponent().getDoc().removeLineClass(this._errorMarker, 'wrap', 'error-line');
			this._errorMarker = null;
		}
	}

	addConsoleOutput(msgs) {  // Called By Twin
		this._outputPane.addConsoleOutput(msgs);
	}

	addErrorMessage(info) {  // Called By Twin
		let msg;
		if (info.import) {
			msg = this._res.msg.cannotImport.replace('%s', info.msg);
		} else {
			const file = info.isUserCode ? '' : `(${info.fileName}) `;
			const transMsg = new ErrorTranslator(this._lang).translate(info.msg);
			msg = `${file}%lineno% [${info.col}] - ${transMsg}`;
			if (info.isUserCode && this._editor.isFunctionLineNumberEnabled()) {
				const lnf = this._editor.getFunctionLineNumber(info.line - 1);
				msg = msg.replace('%lineno%', lnf[0] + ':' + lnf[1]);
			} else {
				msg = msg.replace('%lineno%', info.line);
			}
		}
		if (info.isUserCode) {
			const doc = this._editor.getComponent().getDoc();
			const jump = () => {
				doc.setCursor(info.line - 1, info.col - 1, { scroll: true });
				this._editor.getComponent().focus();
			};
			this._outputPane.setErrorMessage(msg, 'err', jump);
			this._clearErrorMarker();
			this._errorMarker = doc.addLineClass(info.line - 1, 'wrap', 'error-line');
			jump();
		} else {
			this._outputPane.setErrorMessage(msg, 'err');
		}
	}


	// -------------------------------------------------------------------------


	sendBackCapturedImages() {  // Called By Twin
		const orig = this._editor.setSimpleView();
		this._toolbar.showMessage(this._res.msg.copyingAsImage, true);

		const sf = electron.screen.getPrimaryDisplay().scaleFactor;
		const count = this._editor._comp.getDoc().lineCount();
		const lineHeight = this._editor._comp.defaultTextHeight();
		const logicalImageHeight = lineHeight * count + lineHeight * 0.25;
		const topDelta = lineHeight * 10;

		const bcr = this._editor._elem.getBoundingClientRect();
		const r = {x: bcr.left, y: bcr.top, width: bcr.width, height: bcr.height};

		const canvas = document.createElement('canvas');
		canvas.width = r.width * sf;
		canvas.height = logicalImageHeight * sf;

		this._editor._comp.scrollTo(0, 0);
		this._editor._comp.refresh();
		this._editor.enabled(false);  // After showing modal, it becomes true.

		let top = 0;
		const capture = () => {
			const dataUrl = this._twinMessageSync('onStudyRequestPageCapture', r);
			top += topDelta;
			const finished = (top > logicalImageHeight);

			this._addImageToCanvas(canvas, this._editor._comp.getScrollInfo().top * sf, dataUrl, finished);

			if (finished) {
				this._toolbar.hideMessage(200);
				setTimeout(() => {
					this._editor.restoreOriginalView(orig);
					this._editor._comp.scrollTo(0, 0);
				}, 200);
			} else {
				this._editor._comp.scrollTo(0, top);
				this._editor._comp.refresh();
				setTimeout(capture, 200);
			}
		};
		setTimeout(capture, 400);
	}

	_addImageToCanvas(canvas, y, dataUrl, finished) {
		const img = new Image();
		img.onload = () => {
			const ctx = canvas.getContext('2d');
			ctx.drawImage(img, 0, y);
			if (finished) this._twinMessage('onStudyCapturedImageCreated', canvas.toDataURL('image/png'));
		};
		img.src = dataUrl;
	}


	// -------------------------------------------------------------------------


	showAlert(text, type) {  // Called By Twin
		window.focus();
		this._dialogBox.showAlert(text, type);
	}

	_showConfirm(text, type, messageForMain, ...args) {
		window.focus();
		this._dialogBox.showConfirm(text, type, () => {
			if (messageForMain) this._twinMessage(messageForMain, ...args);
		});
	}

	_showPrompt(text, type, placeholder, value, messageForMain, ...args) {
		window.focus();
		this._dialogBox.showPrompt(text, type, placeholder, value, (resVal) => {
			if (messageForMain) this._twinMessage(messageForMain, resVal, ...args);
		});
	}


	// -------------------------------------------------------------------------


	_checkCanDiscard(msg, returnMsg, ...args) {
		if (this._isModified) {
			this._showConfirm(msg, 'warning', returnMsg, ...args);
		} else {
			this._twinMessage(returnMsg, ...args);
		}
	}

	_prepareExecution(nextMethod) {
		setTimeout(() => {
			this._clearErrorMarker();
			this._outputPane.initialize();
			this._twinMessage(nextMethod, this._editor.value());
		}, 100);
	}

	executeCommand(cmd, close = true) {
		if (close) this._sideMenu.close();
		const conf = this._config;

		// File Command

		if (cmd === 'new') {
			this._checkCanDiscard(this._res.msg.confirmNew, '_initializeDocument');
		} else if (cmd === 'open') {
			this._checkCanDiscard(this._res.msg.confirmOpen, 'doOpen');
		} else if (cmd === 'save') {
			this._twinMessage('doSave', this._editor.value());
		} else if (cmd === 'saveAs') {
			this._twinMessage('doSaveAs', this._editor.value());
		} else if (cmd === 'close') {
			this._checkCanDiscard(this._res.msg.confirmExit, 'doClose', this._editor.value());

		} else if (cmd === 'exportAsLibrary') {
			const cs = JSON.stringify(this._codeStructure);
			this._showPrompt(this._res.msg.enterLibraryName, 'input', this._res.msg.libraryName, this._name, 'doExportAsLibrary', this._editor.value(), cs);
		} else if (cmd === 'exportAsWebPage') {
			this._twinMessage('doExportAsWebPage', this._editor.value());

		} else if (cmd === 'setLanguageJa') {
			conf.setItem('language', 'ja');
			this.showAlert(this._res.msg.alertNextTime, 'info');
		} else if (cmd === 'setLanguageEn') {
			conf.setItem('language', 'en');
			this.showAlert(this._res.msg.alertNextTime, 'info');
		}

		// Edit Command

		if (cmd === 'undo') {
			this._editor.undo();
		} else if (cmd === 'redo') {
			this._editor.redo();

		} else if (cmd === 'cut') {
			this._editor.cut();
		} else if (cmd === 'copy') {
			this._editor.copy();
		} else if (cmd === 'paste') {
			this._editor.paste();
		} else if (cmd === 'selectAll') {
			this._editor.selectAll();

		} else if (cmd === 'toggleComment') {
			this._editor.toggleComment();
		} else if (cmd === 'format') {
			this._editor.format();

		} else if (cmd === 'find') {
			this._editor.find();
		} else if (cmd === 'findNext') {
			this._editor.findNext();
		} else if (cmd === 'replace') {
			this._editor.replace();

		} else if (cmd === 'copyAsImage') {
			this.sendBackCapturedImages();
		}

		// Code Command

		if (cmd === 'run') {
			this._prepareExecution('doRun');
		} else if (cmd === 'runInFullScreen') {
			this._prepareExecution('doRunInFullScreen');
		} else if (cmd === 'stop') {
			this._twinMessage('stop');
		} else if (cmd === 'runWithoutWindow') {
			this._prepareExecution('doRunWithoutWindow');
		}

		// View Command

		if (cmd === 'tileWin') {
			this._twinMessage('tileWin');

		} else if (cmd === 'fontSizePlus') {
			const size = Math.min(64, Math.max(10, conf.getItem('fontSize') + 2));
			conf.setItem('fontSize', size);
		} else if (cmd === 'fontSizeMinus') {
			const size = Math.min(64, Math.max(10, conf.getItem('fontSize') - 2));
			conf.setItem('fontSize', size);
		} else if (cmd === 'fontSizeReset') {
			conf.setItem('fontSize', 16);

		} else if (cmd === 'lineHeightPlus') {
			const lh = Math.min(195, Math.max(135, conf.getItem('lineHeight') + 15));
			conf.setItem('lineHeight', lh);
		} else if (cmd === 'lineHeightMinus') {
			const lh = Math.min(195, Math.max(135, conf.getItem('lineHeight') - 15));
			conf.setItem('lineHeight', lh);
		} else if (cmd === 'lineHeightReset') {
			conf.setItem('lineHeight', 165);
	
		} else if (cmd === 'toggleSoftWrap') {
			conf.setItem('softWrap', !conf.getItem('softWrap'));
		} else if (cmd === 'toggleFunctionLineNumber') {
			conf.setItem('functionLineNumber', !conf.getItem('functionLineNumber'));
		} else if (cmd === 'toggleOutputPane') {
			this._outputPane.toggle();
		}

		// Help Command

		if (cmd === 'showAbout') {
			this.showAlert(this._res.about, 'info');
		}

	}

}
