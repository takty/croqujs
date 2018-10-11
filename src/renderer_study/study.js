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
	function ret() {
		if (st) clearTimeout(st);
		st = setTimeout(fn, delay);
	}
	ret.cancel = function () {
		if (st) clearTimeout(st);
		st = null;
	}
	return ret;
}


class Study {

	constructor(editorSel, tbarSel) {
		this._id = window.location.hash;
		if (this._id) this._id = this._id.replace('#', '');
		ipcRenderer.on('callStudyMethod',  (ev, method, ...args) => { this[method](...args); });
		ipcRenderer.on('callEditorMethod', (ev, method, ...args) => { this._editor[method](...args); });

		window.ondragover = window.ondrop = (e) => { e.preventDefault(); return false; };

		this._res = ipcRenderer.sendSync('getResource');
		this._errorMarker = null;
		this._outputPane = document.getElementById('output-pane');
		window.onkeydown = (e) => {
			if (this._editor._comp.hasFocus()) return;
			if (e.ctrlKey && e.keyCode == 'A'.charCodeAt(0)) {
				e.preventDefault();
				return false;
			}
		}
		this._msgsCache = [];
		this._lang = 'en';

		this._initEditor(editorSel);

		this._config    = new Config({
			softWrap: false,
			lineHeightIdx: 2,
			fontSize: 16,
			functionLineNumber: false,
			languageIdx: 1/*ja*/,
		});
		this._config.addEventListener((conf) => this.configUpdated(conf));

		this._toolbar   = new Toolbar(this, this._res);
		this._sideMenu  = new SideMenu(this, this._res);
		this._dialogBox = new DialogBox(this, this._res);

		this._initWindowResizing(this._editor, tbarSel, editorSel);
		// this.configUpdated(ipcRenderer.sendSync('getConfig'));

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

		this._config.notify();
	}

	_initEditor(editorSel) {
		this._editor = new Editor(this, document.querySelector(editorSel));
		this._editor.fontFamily(this._res.fontSet);
		this._editor.rulerEnabled(true);
		const ec = this._editor.getComponent();

		const w = new Worker('analyzer.js');
		w.addEventListener('message', (e) => {
			this._codeStructure = e.data;
			this._editor.setCodeStructureData(this._codeStructure);
		}, false);
		const analize = createDelayFunction(() => {
			w.postMessage(ec.getValue());
		}, 400);

		ec.on('change', () => {
			this._clearErrorMarker();
			if (this._editor.enabled()) {
				this._twinMessage('onStudyModified', this._editor._comp.getDoc().historySize());
			}
			analize();
		});
		ec.on('drop', (em, ev) => {
			ev.preventDefault();
			if (ev.dataTransfer.files.length > 0) this._twinMessage('onStudyFileDropped', ev.dataTransfer.files[0].path);
		});
		ec.on('focus', () => { this._sideMenu.close(); });
	}

	_initWindowResizing(ed, tbarSel, editorSel) {
		const body   = document.querySelector('body');
		const main   = document.querySelector('.main');
		const tbar   = document.querySelector(tbarSel);
		const editor = document.querySelector(editorSel);
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


	onEditorEnabled(flag) {
		this._twinMessage('onStudyEnabled', flag);
	}

	onEditorClipboardChanged() {
		setTimeout(() => {ipcRenderer.send('onClipboardChanged');}, 0);
	}


	// -------------------------------------------------------------------------


	setConfig(key, val) {  // Called By Main Directly
		this._config.setItem(key, val);
	}

	configUpdated(conf) {
		this._lang = (conf.languageIdx === 0) ? 'en' : 'ja';

		this._editor.lineWrapping(conf.softWrap);
		this._editor.lineHeight(this._res.lineHeights[conf.lineHeightIdx]);
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
	
		this._twinMessage('onStudyConfigModified', conf);
	}

	reflectClipboardState(text) {  // Called By Main Directly
		this._toolbar.reflectClipboard(text);
		this._sideMenu.reflectClipboard(text);
	}

	toggleOutputPane() {  // Called By Main Directly
		const pane = this._outputPane;
		this._outputPaneEnabled(pane.offsetHeight === 0);
	}


	// -------------------------------------------------------------------------


	reflectTwinState(state) {  // Called By Twin
		this._toolbar.reflectState(state);
		this._sideMenu.reflectState(state);
	}

	prepareExecution(selected, nextMethod) {  // Called By Twin
		setTimeout(() => {
			this._clearErrorMarker();
			this._outputPane.innerHTML = '<div></div>';
			const text = selected ? this._editor.selection() : this._editor.value();
			this._twinMessage(nextMethod, text);
		}, 100);
	}

	sendBackText(messageForMain) {  // Called By Twin
		this._twinMessage(messageForMain, this._editor.value());
	}

	sendBackTextWithCodeStructure(messageForMain) {  // Called By Twin
		const cs = JSON.stringify(this._codeStructure);
		this._twinMessage(messageForMain, this._editor.value(), cs);
	}

	clearCurrentState() {  // Called By Twin
		this._clearErrorMarker();
		this._outputPane.innerHTML = '<div></div>';
		this._outputPaneEnabled(false);
	}

	_clearErrorMarker() {
		if (this._errorMarker) {
			this._editor.getComponent().getDoc().removeLineClass(this._errorMarker, 'wrap', 'error-line');
			this._errorMarker = null;
		}
	}

	_outputPaneEnabled(flag) {
		const pane = this._outputPane;
		if ((flag && pane.offsetHeight === 0) || (!flag && pane.offsetHeight > 0)) {
			const ev = document.createEvent('HTMLEvents');
			ev.initEvent('click', true, false);
			const r = document.querySelector('#handle');
			r.dispatchEvent(ev);
		}
		if (flag) setTimeout(() => {pane.scrollTop = pane.scrollHeight}, 100);
	}

	addConsoleOutput(msgs) {  // Called By Twin
		this._msgsCache = this._msgsCache.concat(msgs);
		const fn = () => {
			this._onOutputTimeout = null;
			this._outputs(this._msgsCache.splice(0, 100));
			if (this._msgsCache.length) {
				this._onOutputTimeout = setTimeout(fn, 100);
			}
		};
		if (!this._onOutputTimeout) setTimeout(fn, 100);
	}

	_outputs(msgs) {
		const pane = this._outputPane;
		const inner = this._cloneOutputPaneLines(MAX_CONSOLE_OUTPUT_SIZE - msgs.length);

		for (let m of msgs) {
			let elm = document.createElement('div');
			elm.className = m.type;
			const count = (m.count > 1) ? ('<span class="count">' + m.count + '</span>') : '';
			elm.innerHTML = count + m.msg;
			inner.appendChild(elm);
		}
		pane.replaceChild(inner, pane.firstChild);

		if (this._outputPaneEnabledTimeout) clearTimeout(this._outputPaneEnabledTimeout);
		this._outputPaneEnabledTimeout = setTimeout(() => {
			this._outputPaneEnabled(true);
			this._outputPaneEnabledTimeout = null;
		}, 200);
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
		const elm = this._outputErrorMessage(msg, 'err');
		if (info.isUserCode) {
			const doc = this._editor.getComponent().getDoc();
			doc.setCursor(info.line - 1, info.col - 1, { scroll: true });
			this._clearErrorMarker();
			this._errorMarker = doc.addLineClass(info.line - 1, 'wrap', 'error-line');
			this._makeErrorMessageClickable(elm, info);
		}
	}

	_outputErrorMessage(msg, className) {
		const pane = this._outputPane;
		const inner = this._cloneOutputPaneLines(MAX_CONSOLE_OUTPUT_SIZE - 1);
		pane.replaceChild(inner, pane.firstChild);

		const elm = document.createElement('div');
		elm.className = className;
		if (msg.indexOf('<') === -1) {
			elm.appendChild(document.createTextNode(msg));
		} else {
			elm.innerHTML = msg;
		}
		pane.firstChild.appendChild(elm);

		this._outputPaneEnabled(true);
		return elm;
	}

	_makeErrorMessageClickable(elm, info) {
		elm.addEventListener('click', () => {
			doc.setCursor(info.line - 1, info.col - 1, { scroll: true });
			this._editor.getComponent().focus();
		});
		elm.style.cursor = 'pointer';
	}

	_cloneOutputPaneLines(keptCount) {
		const inner = this._outputPane.firstChild.cloneNode(true);
		const size = inner.hasChildNodes() ? inner.childNodes.length : 0;
		for (let i = 0, I = Math.min(size, size - keptCount); i < I; i += 1) inner.removeChild(inner.firstChild);
		return inner;
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


	showAbout() {
		this.showAlert(this._res.about, 'info');
	}

	showAlert(text, type) {  // Called By Twin
		this._dialogBox.showAlert(text, type);
	}

	showConfirm(text, type, messageForMain) {  // Called By Twin
		this._dialogBox.showConfirm(text, type, () => {
			if (messageForMain) this._twinMessage(messageForMain);
		});
	}

	showPrompt(text, type, placeholder, value, messageForMain) {  // Called By Twin
		this._dialogBox.showPrompt(text, type, placeholder, value, (resVal) => {
			if (messageForMain) this._twinMessage(messageForMain, resVal);
		});
	}


	// -------------------------------------------------------------------------


	executeCommand(cmd, close = true) {
		if (close) this._sideMenu.close();
		const conf = this._config;

		// File Command

		if (cmd === 'save') {
			this._twinMessage('save');
		} else if (cmd === 'exportAsLibrary') {
			this._twinMessage('exportAsLibrary');
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
			this._twinMessage('run');
		}

		// View Command

		if (cmd === 'tileWin') {
			this._twinMessage('tileWin');

		} else if (cmd === 'fontSizePlus') {
			let size = conf.getItem('fontSize');
			size = Math.min(64, Math.max(10, size + 2));
			conf.setItem('fontSize', size);
		} else if (cmd === 'fontSizeMinus') {
			let size = conf.getItem('fontSize');
			size = Math.min(64, Math.max(10, size - 2));
			conf.setItem('fontSize', size);
		} else if (cmd === 'fontSizeReset') {
			conf.setItem('fontSize', 16);

		} else if (cmd === 'lineHeightPlus') {
			let idx = conf.getItem('lineHeightIdx');
			idx = Math.min(4, Math.max(0, idx - 1));
			conf.setItem('lineHeightIdx', idx);
		} else if (cmd === 'lineHeightMinus') {
			let idx = conf.getItem('lineHeightIdx');
			idx = Math.min(4, Math.max(0, idx + 1));
			conf.setItem('lineHeightIdx', idx);
		} else if (cmd === 'lineHeightReset') {
			conf.setItem('lineHeightIdx', 2);
	
		} else if (cmd === 'toggleSoftWrap') {
			const f = conf.getItem('softWrap');
			conf.setItem('softWrap', !f);
		} else if (cmd === 'toggleFunctionLineNumber') {
			const f = conf.getItem('functionLineNumber');
			conf.setItem('functionLineNumber', !f);
		} else if (cmd === 'toggleOutputPane') {
			this.toggleOutputPane();
		}

		// Help Command

		if (cmd === 'showAbout') {
			this.showAbout();
		}

	}

}
