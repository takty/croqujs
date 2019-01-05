/**
 *
 * Editor: Editor Component Wrapper for CodeMirror
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2019-01-05
 *
 */


'use strict';


class Editor {

	constructor(owner, domElm) {
		this._owner = owner;
		this._isEnabled = true;
		this._isReadOnly = false;
		this._isFunctionLineNumberEnabled = false;
		this._isLineSelModeEnabled = false;
		this._codeStructure = {};

		CodeMirror.keyMap.pcDefault['Shift-Ctrl-R'] = false;  // Directly Change the Key Map!
		this._comp = new CodeMirror(domElm, this.codeMirrorOptions(this._owner._res.jsHintOpt));
		this._comp.getMode().closeBrackets = '()[]\'\'""``';  // Must Overwrite JavaScript Mode Here!
		this._elem = document.querySelector('.CodeMirror');
		this._elem.style.userSelect = 'none';
		this._elem.style.WebkitUserSelect = 'none';

		this.initCaret();
		this.initHideMouseCursorWhenEditing();
		this.initWheelZoom();
		this.initGutterSelection();
		this.initCodeStructureView();

		loadJSON(['lib/tern/ecmascript.json', 'lib/tern/browser.json', 'libl.json'], (ret) => {
			this.initAutoComplete(ret);
		});

		this.rulerEnabled(true);
		this.functionLineNumberEnabled(false);

		this._comp.on('refresh', () => { this._updateCodeStructureView(); });
		this._comp.on('renderLine', (cm, line, elt) => {
			if (!cm.getOption('lineWrapping')) return;
			const charWidth = this._comp.defaultCharWidth(), basePadding = 2;
			const off = CodeMirror.countColumn(line.text, null, cm.getOption('tabSize')) * charWidth;
			elt.style.textIndent = '-' + off + 'px';
			elt.style.paddingLeft = (basePadding + off) + 'px';
		});
	}

	codeMirrorOptions(jsHintOpt) {
		return {
			mode: 'javascript',
			autoCloseBrackets: true,
			lineNumbers: true,
			indentUnit: 4,
			indentWithTabs: true,
			gutters: ['CodeMirror-lint-markers', 'CodeMirror-function-linenumbers', 'CodeMirror-linenumbers'],
			extraKeys: {'Ctrl-\\': 'autocomplete', 'Shift-Tab': 'indentLess'},
			highlightSelectionMatches: true,
			matchBrackets: true,
			showCursorWhenSelecting: true,
			dragDrop: true,
			cursorBlinkRate: 530,
			cursorScrollMargin: 32,
			styleActiveLine: true,
			theme: 'laccolla',
			inputStyle: 'textarea',
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
			this._owner.executeCommand(e.deltaY > 0 ? 'fontSizeMinus' : 'fontSizePlus');
			e.preventDefault();
		}, {passive: true});
		this._elem.addEventListener('keydown', (e) => {if (e.which === 17) {isCtrl = (e.type === 'keydown');}});
		this._elem.addEventListener('keyup',   (e) => {if (e.which === 17) {isCtrl = (e.type === 'keydown');}});
		this._comp.on('blur', () => {isCtrl = false;});
	}

	// -------------------------------------------------------------------------

	initCodeStructureView() {
		this._canvas = document.createElement('canvas');
		this._canvas.style.position = 'absolute';

		const parent = document.getElementsByClassName('CodeMirror-sizer')[0];
		parent.insertBefore(this._canvas, parent.firstElementChild);

		this._setCanvasSize();
		this._comp.on('change', () => { this._setCanvasSize(); });

		const fn = () => {
			const c = this._canvas;
			const w = c.parentElement.clientWidth;
			const h = c.parentElement.clientHeight;
			if (c.width !== w || c.height !== h) {
				this._setCanvasSize();
				this._updateCodeStructureView();
			}
		};
		let st = null;
		this._comp.on('scroll', () => {
			if (st) clearTimeout(fn);
			st = setTimeout(fn, 200);
		});
	}

	_setCanvasSize() {
		const c = this._canvas;
		const w = c.parentElement.clientWidth;
		const h = c.parentElement.clientHeight;
		c.style.minWidth  = w + 'px';
		c.style.minHeight = h + 'px';
		c.style.width     = w + 'px';
		c.style.height    = h + 'px';
		c.width  = w;
		c.height = h;
		c.getContext('2d').clearRect(0, 0, w, h);
	}

	_updateCodeStructureView() {
		const cs = this._codeStructure;
		const ctx = this._canvas.getContext('2d');

		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

		if (cs.fnLocs) {
			ctx.fillStyle = 'rgba(255, 127, 0, 0.1)';
			for (let loc of cs.fnLocs) this._drawSyntaxRange(ctx, loc);
		}
		if (cs.ifLocs) {
			ctx.fillStyle = 'rgba(0, 127, 0, 0.1)';
			for (let loc of cs.ifLocs) this._drawSyntaxRange(ctx, loc);
		}
		if (cs.forLocs) {
			ctx.fillStyle = 'rgba(0, 127, 255, 0.1)';
			for (let loc of cs.forLocs) this._drawSyntaxRange(ctx, loc);
		}
	}

	_drawSyntaxRange(ctx, pos) {
		const bgn = pos[0], end = pos[1];
		const scc = this._comp.charCoords({line: bgn.line - 1, ch: bgn.column}, 'local');
		const ecc = this._comp.charCoords({line: end.line - 1, ch: end.column}, 'local');
		scc.left += 4;

		const lh = this._comp.defaultTextHeight();
		const tcc = this._comp.charCoords({line: bgn.line - 1, ch: bgn.column + 3}, 'local');
		const iw = tcc.right - scc.left - 3;
		const w = ctx.canvas.width / 2;

		this._fillLeftRoundedRect(ctx, scc.left, scc.top + 3, iw, ecc.top - scc.top + lh - 6, lh / 1.5);
		this._fillRightRoundedRect(ctx, scc.left + iw, scc.top + 3, w, lh - 3, lh / 1.5);
		if (bgn.line !== end.line) {
			this._fillRightRoundedRect(ctx, scc.left + iw, ecc.top, w, lh - 3, lh / 1.5);
		}

		const elsecc = this._comp.charCoords({line: bgn.line - 1, ch: bgn.column + 4}, 'local');
		const elsew = elsecc.right - scc.left - 4;

		for (let i = 2; i < pos.length; i += 1) {
			const icc = this._comp.charCoords({ line: pos[i].line - 1, ch: pos[i].column }, 'local');
			this._fillRightRoundedRect(ctx, scc.left + iw, icc.top + 3, elsew, lh - 6, lh / 1.5);
		}
	}

	_fillLeftRoundedRect(ctx, x, y, width, height, radius) {
		if (height < radius * 2) radius = height / 2;
		ctx.beginPath();
		ctx.moveTo(x + radius, y);
		ctx.lineTo(x + width, y);
		ctx.lineTo(x + width, y + height);
		ctx.lineTo(x + radius, y + height);
		ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
		ctx.lineTo(x, y + radius);
		ctx.quadraticCurveTo(x, y, x + radius, y);
		ctx.fill();
	}

	_fillRightRoundedRect(ctx, x, y, width, height, radius) {
		if (height < radius * 2) radius = height / 2;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(x + width - radius, y);
		ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
		ctx.lineTo(x + width, y + height - radius);
		ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
		ctx.lineTo(x, y + height);
		ctx.lineTo(x, y);
		ctx.fill();
	}

	// -------------------------------------------------------------------------

	initGutterSelection() {
		const doc = this._comp.getDoc();
		const guts = document.querySelector('.CodeMirror-gutters');
		let downLine = -1, fromLine = -1, dragging = false;

		this._comp.on('gutterClick', (cm, line, gut, e) => {
			if (!isGutter(e)) {
				downLine = -1;
				fromLine = -1;
				this.setLineSelectionMode(false);
				doc.setCursor(getLine(e), 0);
			}
		});
		this._elem.addEventListener('mousedown', (e) => {
			if (isGutter(e)) {
				downLine = getLine(e);
				dragging = true;

				if (e.shiftKey) {
					if (fromLine === -1) fromLine = this._comp.getCursor().line;
					this._select(fromLine, downLine);
					this.setLineSelectionMode(false);
				} else if (this._isLineSelModeEnabled) {
					this._select(fromLine, downLine);
				} else {
					fromLine = downLine;
					this._select(fromLine);
				}
			}
		});
		this._elem.addEventListener('mousemove', (e) => {
			if (!dragging) return;
			if (e.which === 0) {
				dragging = false;
			} else {
				this._select(fromLine, getLine(e));
			}
		});
		this._elem.addEventListener('mouseup', (e) => {
			if (dragging && isGutter(e)) {
				if (e.shiftKey) {
				} else if (this._isLineSelModeEnabled) {
				} else {
					if (getLine(e) === downLine) {
						this.setLineSelectionMode(true);
						fromLine = downLine;
					}
				}
			}
			dragging = false;
		});
		this._comp.on('cursorActivity', () => {
			if (doc.getSelection() === '') {
				this.setLineSelectionMode(false);
			}
		});
		const isGutter = (e) => {
			const s = window.getComputedStyle(guts);
			return !(guts.offsetWidth - parseInt(s.borderRightWidth) - 1 < e.clientX);
		};
		const getLine = (e) => {
			const { line } = this._comp.coordsChar({ left: e.clientX, top: e.clientY });
			return line;
		};
	}

	setLineSelectionMode(enabled) {
		if (enabled) {
			this._isLineSelModeEnabled = true;
			this._elem.classList.add('line-selection-mode');
		} else {
			this._isLineSelModeEnabled = false;
			this._elem.classList.remove('line-selection-mode');
		}
	}

	_select(fromLine, toLine = false) {
		const doc = this._comp.getDoc();
		if (toLine === false) {
			doc.setCursor(fromLine, 0);
			doc.setSelection({ line: fromLine, ch: 0 }, this._getTailPos(doc, fromLine));
		} else {
			if (fromLine <= toLine) {
				doc.setSelection({line: fromLine, ch: 0}, this._getTailPos(doc, toLine));
			} else {
				doc.setSelection(this._getTailPos(doc, fromLine), {line: toLine, ch: 0});
			}
		}
	}

	_getTailPos(doc, line) {
		if (doc.lineCount() - 1 === line) {
			return {line: line, ch: doc.getLine(line).length};
		} else {
			return {line: line + 1, ch: 0};
		}
	}

	initAutoComplete(defs) {
		const server = new CodeMirror.TernServer({ defs: defs });
		this._comp.on('cursorActivity', (cm) => { server.updateArgHints(cm); });
		this._comp.setOption('extraKeys', { 'Ctrl-Tab': (cm) => { this._complete(cm, server); } });
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
		cm.showHint({ hint: fn, completeSingle: false, customKeys: {
			Up      : function (cm, handle) { handle.moveFocus(-1); },
			Down    : function (cm, handle) { handle.moveFocus(1); },
			PageUp  : function (cm, handle) { handle.moveFocus(-handle.menuSize() + 1, true); },
			PageDown: function (cm, handle) { handle.moveFocus(handle.menuSize() - 1, true); },
			Home    : function (cm, handle) { handle.setFocus(0); },
			End     : function (cm, handle) { handle.setFocus(handle.length - 1); },
			Enter   : function (cm, handle) { handle.pick(); },
			Tab     : function (cm, handle) { handle.pick(); },
			Esc     : function (cm, handle) { handle.close(); }
		} });
	}

	_hint(ts, cm, c) {
		ts.request(cm, { type: 'completions', types: true, includeKeywords: true }, (error, data) => {
			if (error) return;
			const from = data.start, to = data.end;
			if (this._autoCompActivated) {
				this._autoCompActivated = false;
				if (from.line === to.line && to.ch - from.ch === 1) {
					const pc = this._comp.getDoc().getRange(CodeMirror.Pos(from.line, from.ch - 1), CodeMirror.Pos(to.line, to.ch - 1));
					if (pc !== '.') return;
				}
			}
			const completions = [];
			for (let completion of data.completions) {
				let className = this._typeToIcon(completion.type);
				if (data.guess) className += ' ' + 'CodeMirror-Tern-' + 'guess';
				completions.push({ text: completion.name, displayText: completion.displayName || completion.name, className: className, data: completion });
			}
			c({ from: from, to: to, list: completions });
		});
	}

	_typeToIcon(type) {
		let suffix;
		if (type === '?') suffix = 'unknown';
		else if (type === 'number' || type === 'string' || type === 'bool') suffix = type;
		else if (/^fn\(/.test(type)) suffix = 'fn';
		else if (/^\[/.test(type)) suffix = 'array';
		else suffix = 'object';
		return 'CodeMirror-Tern-' + 'completion ' + 'CodeMirror-Tern-' + 'completion-' + suffix;
	}


	// =========================================================================


	getComponent() {
		return this._comp;
	}

	refresh() {
		this._comp.refresh();
		this._setCanvasSize();
		this._updateLineNumberGutter();
	}

	enabled(flag) {
		if (flag === undefined) return this._isEnabled;
		this._isEnabled = flag;
		this._comp.setOption('readOnly', flag ? this._isReadOnly : 'nocursor');
		if (flag) this._comp.focus();
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

	setCodeStructureData(data) {
		this._codeStructure = data;
		this._updateLineNumberGutter();
		this._updateCodeStructureView();
	}

	rulerEnabled(flag) {
		if (flag === undefined) return this._comp.getOption('rulers') !== null;
		if (flag) {
			this._comp.setOption('rulers', [...Array(3).keys()].map(i => ({column: (i + 1) * 4, color: '#f6b0c5', lineStyle: 'dashed'})));
		} else {
			this._comp.setOption('rulers', null);
		}
	}

	setSimpleView() {
		const orig = {
			scrollbarStyle : this._comp.getOption('scrollbarStyle'),
			readOnly       : this._comp.getOption('readOnly'),
			styleActiveLine: this._comp.getOption('styleActiveLine'),
			cursorBlinkRate: this._comp.getOption('cursorBlinkRate'),
			cursorHeight   : this._comp.getOption('cursorHeight'),
			lineWrapping   : this._comp.getOption('lineWrapping'),
		};
		this._comp.setOption('scrollbarStyle',  'null');
		this._comp.setOption('readOnly',        'nocursor');
		this._comp.setOption('styleActiveLine', false);
		this._comp.setOption('cursorBlinkRate', -1);
		this._comp.setOption('cursorHeight',    0);
		this._comp.setOption('lineWrapping',    false);
		return orig;
	}

	restoreOriginalView(orig) {
		this._comp.setOption('scrollbarStyle',  orig.scrollbarStyle);
		this._comp.setOption('readOnly',        orig.readOnly);
		this._comp.setOption('styleActiveLine', orig.styleActiveLine);
		this._comp.setOption('cursorBlinkRate', orig.cursorBlinkRate);
		this._comp.setOption('cursorHeight',    orig.cursorHeight);
		this._comp.setOption('lineWrapping',    orig.lineWrapping);
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
		const cms = document.getElementsByClassName('CodeMirror');
		for (let cm of cms) {
			if (flag) cm.classList.add('wordwrap');
			else cm.classList.remove('wordwrap');
		}
	}

	fontFamily(attr) {
		if (attr === undefined) return this._elem.style.fontFamily;
		this._elem.style.fontFamily = attr;
	}

	lineHeight(attr) {
		if (attr === undefined) return this._elem.style.lineHeight;
		this._elem.style.lineHeight = attr;
	}

	fontSize(px) {
		if (px === undefined) return parseInt(this._elem.style.fontSize, 10);
		const size = Math.min(64, Math.max(10, px));
		this._elem.style.fontSize = size + 'px';
	}

	isFunctionLineNumberEnabled() {
		return this._isFunctionLineNumberEnabled;
	}

	getFunctionLineNumber(lineNo) {
		return this._lineNoByFunc[lineNo];
	}

	functionLineNumberEnabled(flag) {
		this._isFunctionLineNumberEnabled = flag;
		this._updateLineNumberGutter();
	}

	_updateLineNumberGutter() {
		if (this._isFunctionLineNumberEnabled) {
			this._updateFuncLineNoGutter();
		} else {
			this._comp.clearGutter('CodeMirror-function-linenumbers');
			this._comp.setOption('lineNumbers', true);
			const fl = document.getElementsByClassName('CodeMirror-function-linenumbers')[0];
			fl.style.display = 'none';
			this._comp.refresh();
		}
	}

	_updateFuncLineNoGutter() {
		const lines = this._codeStructure.fnLocs;
		if (!lines || lines.length === 0) return;
		const lineCount = this._comp.getDoc().lineCount();

		this._lineNoByFunc = [];
		let fnIdx = 0, off = 0;
		for (let i = 0; i < lineCount; i += 1) {
			if (lines[fnIdx] !== undefined && i === lines[fnIdx][0].line - 1) {
				off = lines[fnIdx][0].line - 1;
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
		const display = cm.display;
		const test = display.measure.appendChild(_elt('div', _elt('div', document.createTextNode(str)), 'CodeMirror-function-linenumber CodeMirror-gutter-elt'));
		const innerW = test.firstChild.offsetWidth;
		const padding = test.offsetWidth - innerW;
		const lineNumWidth = Math.max(innerW, display.lineGutter.offsetWidth - padding) + 1 + padding;
		return (lineNumWidth || 1) + 'px';
	}

};
