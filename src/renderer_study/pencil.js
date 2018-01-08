/*
 * Pencil: Editor Component Wrapper for CodeMirror
 * 2016-09-30
 */

'use strict';

class Editor {

	constructor(owner, domElm, opt) {
		this._owner = owner;
		this._isEnabled = true;
		this._isReadOnly = false;
		this._isLineNumberByFunctionEnabled = false;

		CodeMirror.keyMap.pcDefault['Shift-Ctrl-R'] = false;  // Directly Change the Key Map!
		this._comp = new CodeMirror(domElm, this.codeMirrorOptions(this._owner._res.jsHintOpt));
		this._comp.getMode().closeBrackets = "()[]''\"\"``";  // Must Overwrite JavaScript Mode Here!
		this._elem = document.querySelector('.CodeMirror');
		this._elem.style.userSelect = 'none';
		this._elem.style.WebkitUserSelect = 'none';

		this.initCaret();
		this.initHideMouseCursorWhenEditing();
		this.initWheelZoom();
		this.initGutterSelection();
		this.initAutoComplete();
		this.initLineNumberByFunction();

		this.rulerEnabled(true);
		this.lineNumberByFunctionEnabled(false);

		this._comp.on('copy', () => {this._owner.onPencilClipboardChanged();});
		this._comp.on('cut', () => {this._owner.onPencilClipboardChanged();});
	}

	codeMirrorOptions(jsHintOpt) {
		return {
			mode: "javascript",
			autoCloseBrackets: true,
			lineNumbers: true,
			indentUnit: 4,
			indentWithTabs: true,
			gutters: ["CodeMirror-lint-markers", "CodeMirror-function-linenumbers", "CodeMirror-linenumbers"],
			extraKeys: {"Ctrl-\\": "autocomplete", "Shift-Tab": "indentLess"},
			highlightSelectionMatches: true,
			matchBrackets: true,
			showCursorWhenSelecting: true,
			dragDrop: true,
			cursorBlinkRate: 530,
			cursorScrollMargin: 32,
			styleActiveLine: true,
			theme: "laccolla",
			inputStyle: "textarea",
			lineWiseCopyCut: false,
			lint: {options: jsHintOpt},
			autofocus: true,
			styleSelectedText: true,
			specialChars: / /,
			specialCharPlaceholder: (c) => {
				const e = document.createElement('span');
				e.innerHTML = '_';
				e.className = 'cm-space';
				return e;
			},
		};
	}

	initCaret() {
		const cursor = document.querySelector('.CodeMirror-cursor');
		window.addEventListener('blur', () => {
			cursor.style.visibility = 'hidden';  // hide cursor on mac
			this._comp.setOption('cursorBlinkRate', -1);
		});
		window.addEventListener('focus', () => {
			cursor.style.visibility = '';
			this._comp.setOption('cursorBlinkRate', 530);
		});
		this._comp.on('cursorActivity', () => {
			cursor.style.visibility = '';
		});
	}

	initHideMouseCursorWhenEditing() {
		let pointerShown = true, to;
		const lines = document.querySelector('.CodeMirror-lines');
		const showPointer = () => {
			if (!pointerShown) lines.style.cursor = 'auto';
			pointerShown = true;
		};
		this._comp.on('cursorActivity', () => {
			clearTimeout(to);
			if (pointerShown) lines.style.cursor = 'none';
			pointerShown = false;
			to = setTimeout(showPointer, 500);
		});
		document.addEventListener('mousemove', showPointer);
	}

	initWheelZoom() {
		let isCtrl = false;

		this._elem.addEventListener('wheel', (e) => {
			if (!this._isEnabled || !isCtrl) return;
			const fs = this.fontSize();
			this.fontSize(fs + ((e.deltaY > 0) ? -1 : 1));
			e.preventDefault();
			this.refresh();
		}, {passive: true});
		this._elem.addEventListener('keydown', (e) => {if (e.which === 17) {isCtrl = (e.type === 'keydown');}});
		this._elem.addEventListener('keyup', (e) => {if (e.which === 17) {isCtrl = (e.type === 'keydown');}});
		this._comp.on('blur', () => {isCtrl = false;});
	}

	initLineNumberByFunction() {
		let stUFPI = null;
		this._comp.on('change', () => {
			if (!this._isLineNumberByFunctionEnabled) return;
			if (stUFPI) clearTimeout(stUFPI);
			stUFPI = setTimeout(() => {this._updateFunctionPositionInfo(this._comp.getValue());}, 10);
		});
	}

	initGutterSelection() {
		const guts = document.querySelector('.CodeMirror-gutters');
		const doc = this._comp.getDoc();
		let fromLine, gutterDown = false;

		this._comp.on('gutterClick', (ed, ll, cls, e) => {
			let style = window.getComputedStyle(guts);
			if (e.which !== 1 || guts.offsetWidth - parseInt(style.borderRightWidth) - 1 < e.clientX) {
				doc.setCursor(ll, 0);
				return;
			}
			if (e.shiftKey) {
				this._select(fromLine, ll);
				return;
			}
			doc.setCursor(ll, 0);
			doc.setSelection({line: ll, ch: 0}, this._getTailPos(doc, ll));
			gutterDown = true;
			fromLine = ll;
		});
		this._elem.addEventListener('mousemove', (e) => {
			if (e.which !== 1) {
				gutterDown = false;
			} else if (gutterDown) {
				const {line} = this._comp.coordsChar({left: e.clientX, top: e.clientY});
				this._select(fromLine, line);
			}
		});
		this._elem.addEventListener('mouseup', (e) => {gutterDown = false;});
	}

	_select(fromLine, toLine) {
		const doc = this._comp.getDoc();
		if (fromLine <= toLine) {
			doc.setSelection({line: fromLine, ch: 0}, this._getTailPos(doc, toLine));
		} else {
			doc.setSelection(this._getTailPos(doc, fromLine), {line: toLine, ch: 0});
		}
	}

	_getTailPos(doc, line) {
		if (doc.lineCount() - 1 === line) {
			return {line: line, ch: doc.getLine(line).length};
		} else {
			return {line: line + 1, ch: 0};
		}
	}

	initAutoComplete() {
		const FS = require('fs');
		const PATH = require('path');
		const remote = require('electron').remote;
		const app = remote.require('electron').app;

		const code = JSON.parse(FS.readFileSync(PATH.join(app.getAppPath(), 'dist/renderer_study/lib/tern/ecmascript.json'), 'utf-8'));
		const browser = JSON.parse(FS.readFileSync(PATH.join(app.getAppPath(), 'dist/renderer_study/lib/tern/browser.json'), 'utf-8'));
		const underscore = JSON.parse(FS.readFileSync(PATH.join(app.getAppPath(), 'dist/renderer_study/lib/tern/underscore.json'), 'utf-8'));

		const server = new CodeMirror.TernServer({defs: [code, browser, underscore]});
		this._comp.on('cursorActivity', (cm) => {server.updateArgHints(cm);});
		this._comp.setOption('extraKeys', {'Ctrl-Tab': (cm) => {this._complete(cm, server);}});
		const reg = /\w|\./;
		let autoComp = null;
		this._comp.on('keypress', (cm, e) => {
			if (reg.test(String.fromCharCode(e.charCode))) {
				if (autoComp) clearTimeout(autoComp);
				autoComp = setTimeout(() => {
					const elm = document.querySelector('.CodeMirror-hints');
					if (!elm) this._autoCompActivated = true;
					this._complete(cm, server);
				}, 500);
			} else {
				if (!autoComp) return;
				clearTimeout(autoComp);
				autoComp = null;
			}
		});
	}

	_complete(cm, server) {
		const fn = (cm, c) => this._hint(server, cm, c);
		fn.async = true;
		cm.showHint({hint: fn, completeSingle: false, customKeys: {
			Up: function(cm, handle) {handle.moveFocus(-1);},
			Down: function(cm, handle) {handle.moveFocus(1);},
			PageUp: function(cm, handle) {handle.moveFocus(-handle.menuSize() + 1, true);},
			PageDown: function(cm, handle) {handle.moveFocus(handle.menuSize() - 1, true);},
			Home: function(cm, handle) {handle.setFocus(0);},
			End: function(cm, handle) {handle.setFocus(handle.length - 1);},
			Enter: function(cm, handle) {handle.pick();},
			Tab: function(cm, handle) {handle.pick();},
			Esc: function(cm, handle) {handle.close();}
		}});
	}

	_hint(ts, cm, c) {
		ts.request(cm, {type: 'completions', types: true, docs: false, urls: false, includeKeywords: true, caseInsensitive: true}, (error, data) => {
			if (error) return;
			const from = data.start, to = data.end;
			if (this._autoCompActivated) {
				this._autoCompActivated = false;
				if (to.ch - from.ch === 1) {
					const pc = this._comp.getDoc().getRange(CodeMirror.Pos(from.line, from.ch - 1), CodeMirror.Pos(to.line, to.ch - 1));
					if (pc !== '.') return;
				}
			}
			const completions = [];
			for (let completion of data.completions) {
				let className = this._typeToIcon(completion.type);
				if (data.guess) className += " " + "CodeMirror-Tern-" + "guess";
				completions.push({text: completion.name, displayText: completion.displayName || completion.name, className: className, data: completion});
			}
			c({from: from, to: to, list: completions});
		});
	}

	_typeToIcon(type) {
		let suffix;
		if (type == "?") suffix = "unknown";
		else if (type == "number" || type == "string" || type == "bool") suffix = type;
		else if (/^fn\(/.test(type)) suffix = "fn";
		else if (/^\[/.test(type)) suffix = "array";
		else suffix = "object";
		return "CodeMirror-Tern-" + "completion " + "CodeMirror-Tern-" + "completion-" + suffix;
	}


	// =========================================================================


	getComponent() {
		return this._comp;
	}

	refresh() {
		this._comp.refresh();
		this.lineNumberByFunctionEnabled(this._isLineNumberByFunctionEnabled);
	}

	enabled(flag) {
		if (flag === undefined) return this._isEnabled;
		this._isEnabled = flag;
		this._comp.setOption('readOnly', flag ? this._isReadOnly : 'nocursor');
		if (flag) this._comp.focus();
		this._owner.onPencilEnabled(flag);
	}

	readOnly(flag) {
		if (flag === undefined) return this._comp.getOption('readOnly');
		this._isReadOnly = flag;
		this._comp.setOption('readOnly', flag);
	}

	value(content) {
		if (content === undefined) return this._comp.getValue();
		this._comp.setValue(content);
		this._comp.getDoc().clearHistory();
		this._comp.getDoc().setCursor(0, 0);
		this.refresh();
	}

	selection() {
		return this._comp.getSelection();
	}

	rulerEnabled(flag) {
		if (flag === undefined) return this._comp.getOption('rulers') != null;
		if (flag) {
			this._comp.setOption('rulers', [...Array(3).keys()].map(i => ({column: (i + 1) * 4, color: '#f6b0c5', lineStyle: 'dashed'})));
		} else {
			this._comp.setOption('rulers', null);
		}
	}

	setSimpleView() {
		const orig = {
			scrollbarStyle: this._comp.getOption('scrollbarStyle'),
			readOnly: this._comp.getOption('readOnly'),
			styleActiveLine: this._comp.getOption('styleActiveLine'),
			cursorBlinkRate: this._comp.getOption('cursorBlinkRate'),
			cursorHeight: this._comp.getOption('cursorHeight'),
			lineWrapping: this._comp.getOption('lineWrapping'),
		};
		this._comp.setOption('scrollbarStyle', 'null');
		this._comp.setOption('readOnly', 'nocursor');
		this._comp.setOption('styleActiveLine', false);
		this._comp.setOption('cursorBlinkRate', -1);
		this._comp.setOption('cursorHeight', 0);
		this._comp.setOption('lineWrapping', false);
		return orig;
	}

	restoreOriginalView(orig) {
		this._comp.setOption('scrollbarStyle', orig.scrollbarStyle);
		this._comp.setOption('readOnly', orig.readOnly);
		this._comp.setOption('styleActiveLine', orig.styleActiveLine);
		this._comp.setOption('cursorBlinkRate', orig.cursorBlinkRate);
		this._comp.setOption('cursorHeight', orig.cursorHeight);
		this._comp.setOption('lineWrapping', orig.lineWrapping);
	}


	// EDIT COMMAND ============================================================


	undo() {
		if (this._isEnabled) this._comp.execCommand('undo');
	}

	redo() {
		if (this._isEnabled) this._comp.execCommand('redo');
	}

	cut() {
		if (this._isEnabled) document.execCommand('cut');
	}

	copy() {
		if (this._isEnabled) document.execCommand('copy');
	}

	paste() {
		if (this._isEnabled) document.execCommand('paste');
	}

	delete() {
		if (this._isEnabled) document.execCommand('delete');
	}

	selectAll() {
		if (this._isEnabled) this._comp.execCommand('selectAll');
	}

	toggleComment() {
		if (this._isEnabled) this._comp.execCommand('toggleComment');
	}

	format() {
		if (!this._isEnabled) return;
		const doc = this._comp.getDoc();
		const useTab = this._comp.getOption('indentWithTabs'), tabSize = this._comp.getOption('tabSize');
		const opts = Object.assign({}, this._owner._res.jsBeautifyOpt);
		Object.assign(opts, {indent_char: (useTab ? '\t' : ' '), indent_size: (useTab ? 1 : tabSize), indent_with_tabs: useTab});

		let start, end;
		if (doc.somethingSelected()) {
			start = doc.getCursor('from');
			end = doc.getCursor('to');
		} else {
			let li = doc.lineCount() - 1;
			start = {line: 0, ch: 0};
			end = {line: li, ch: doc.getLine(li).length};
		}
		let curPos;
		const {line, ch} = doc.getCursor('head');
		if (start.line !== end.line) {
			if (Math.abs(start.line - line) < Math.abs(end.line - line)) curPos = Object.assign({}, start);
			else curPos = Object.assign({}, end);
		} else {
			if (Math.abs(start.ch - ch) < Math.abs(end.ch - ch)) curPos = Object.assign({}, start);
			else curPos = Object.assign({}, end);
		}
		if (start.line < end.line && end.ch === 0) end.line = Math.max(start.line, end.line - 1);

		start.ch = 0;
		end.ch = doc.getLine(end.line).length;

		let text = doc.getRange(start, end);
		try {
			text = js_beautify(text, opts);
			text = text.replace(/(.); \/\//gm, '$1;  //');  // コメントの前の空白を二つにする
			doc.replaceRange(text, start, end);
			doc.setCursor(curPos);
		} catch (e) {
		}
	}

	find() {
		if (!this._isEnabled) return;
		this._comp.execCommand('find');
	}

	findNext() {
		if (!this._isEnabled) return;
		this._comp.execCommand('findNext');
	}

	replace() {
		if (!this._isEnabled) return;
		this._comp.execCommand('replace');
	}


	// VIEW COMMAND ============================================================


	lineWrapping(flag) {
		if (flag === undefined) return this._comp.getOption('lineWrapping');
		this._comp.setOption('lineWrapping', flag);
	}

	fontFamily(attr) {
		if (attr === undefined) return this._elem.style.fontFamily;
		this._elem.style.fontFamily = attr;
	}

	lineHeight(attr) {
		if (attr === undefined) return this._elem.style.lineHeight;
		this._elem.style.lineHeight = attr;
	}

	fontSize(px, fireEvent = true) {
		if (px === undefined) return parseInt(this._elem.style.fontSize, 10);
		const size = Math.min(64, Math.max(10, px));
		this._elem.style.fontSize = size + 'px';
		if (fireEvent) this._owner.onPencilFontSizeChanged(size);
	}

	isLineNumberByFunctionEnabled() {
		return this._isLineNumberByFunctionEnabled;
	}

	getLineNumberByFunction(lineNo) {
		return this._lineNoByFunc[lineNo];
	}

	lineNumberByFunctionEnabled(flag) {
		this._isLineNumberByFunctionEnabled = flag;

		if (flag) {
			this._updateFunctionPositionInfo(this._comp.getValue());
		} else {
			this._comp.clearGutter('CodeMirror-function-linenumbers');
			this._comp.setOption('lineNumbers', true);
			const fl = document.getElementsByClassName('CodeMirror-function-linenumbers')[0];
			fl.style.display = 'none';
			this._comp.refresh();
		}
	}

	_updateFunctionPositionInfo(codeStr) {
		const w = new Worker('analyzer.js');
		w.addEventListener('message', (e) => {
			this._updateLineNoByFuncGutter(e.data);
		}, false);
		w.postMessage(codeStr);
	}

	_updateLineNoByFuncGutter(lines) {
		const lineCount = this._comp.getDoc().lineCount();

		this._lineNoByFunc = [];
		let fnIdx = 0, off = 0;
		for (let i = 0; i < lineCount; i += 1) {
			if (i === lines[fnIdx]) {
				off = lines[fnIdx];
				fnIdx += 1;
			}
			this._lineNoByFunc.push([fnIdx, (1 + i - off)]);
		}
		if (lineCount === 0) this._lineNoByFunc.push([0, 1]);
		const width = this._calcWidth(this._comp, lineCount);

		this._comp.operation(() => {
			if (this._comp.getOption('lineNumbers')) {
				this._comp.setOption('lineNumbers', false);
			}
			this._comp.clearGutter('CodeMirror-function-linenumbers');
			this._lineNoByFunc.forEach((e, i) => {
				const ln = document.createElement('div');
				if (e[0] !== 0 && e[1] === 1) {
					ln.innerHTML = e[0];
					ln.classList.add('CodeMirror-function-number');
				} else {
					ln.innerHTML = e[1];
					ln.classList.add('CodeMirror-function-linenumber');
				}
				ln.classList.add((e[0] % 2 === 0) ? 'CodeMirror-function-odd' : 'CodeMirror-function-even');
				this._comp.setGutterMarker(i, 'CodeMirror-function-linenumbers', ln);
			});
			const fl = document.getElementsByClassName('CodeMirror-function-linenumbers')[0];
			fl.style.width = width;
			fl.style.display = '';
			this._comp.refresh();
		});
	}

	_calcWidth(cm, str) {
		const _elt = (tag, content, className) => {
			var e = document.createElement(tag);
			if (className) e.className = className;
			e.appendChild(content);
			return e;
		};
		if (str.length === 0) str = '0';
		const doc = cm.doc, display = cm.display;
		const test = display.measure.appendChild(_elt('div', _elt('div', document.createTextNode(str)), 'CodeMirror-function-linenumber CodeMirror-gutter-elt'));
		const innerW = test.firstChild.offsetWidth;
		const padding = test.offsetWidth - innerW;
		const lineNumWidth = Math.max(innerW, display.lineGutter.offsetWidth - padding) + 1 + padding;
		return (lineNumWidth || 1) + 'px';
	}

};

module.exports = Editor;
