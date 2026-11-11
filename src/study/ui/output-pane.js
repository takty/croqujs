/**
 * Output Pane
 *
 * @author Takuto Yanagida
 * @version 2026-11-01
 */

import './output-pane.css';

const MAX_SIZE = 100;
const DELAY    = 100;

// Rebuild the supported formatting without attaching nodes from the input HTML.
function appendFormattedOutput(target, html) {
	const template = document.createElement('template');
	template.innerHTML = html;
	function appendChildren(parent, source) {
		for (const node of source.childNodes) {
			if (node.nodeType === Node.TEXT_NODE) {
				parent.appendChild(document.createTextNode(node.data));
				continue;
			}
			if (!['span', 'div', 'br', 'b'].includes(node.localName)) continue;
			const element = document.createElement(node.localName);
			const typeClass = node.getAttribute('class');
			if (typeClass && /^type(?:-[a-z0-9-]+)?$/.test(typeClass)) element.className = typeClass;
			appendChildren(element, node);
			parent.appendChild(element);
		}
	}
	appendChildren(target, template.content);
}

export class OutputPane {

	constructor(elm, res, { onVisibilityChange = () => {} } = {}) {
		this._onVisibilityChange = onVisibilityChange;
		this._res = res;

		this._elm = elm;
		this._elm.classList.add('output-pane');
		this._elm.replaceChildren(document.createElement('div'));
		this._msgsCache = [];
		this._stOutput = null;
		this._stEnabled = null;
		this._stScroll = null;

		this._errorCount = 0;
		this._clickEvents = [];

		const con = new Worker(new URL('./output-pane-worker.js', import.meta.url));
		this._worker = con;
		con.addEventListener('message', (e) => { this._addMessages(e.data); }, false);
		this._console = (type, msgs = false) => { con.postMessage(JSON.stringify({ type, msgs })); };
	}

	destroy() {
		this._worker.terminate();
		clearTimeout(this._stOutput);
		clearTimeout(this._stEnabled);
		clearTimeout(this._stScroll);
		this._msgsCache = [];
		this._clickEvents = [];
		this._elm.replaceChildren();
	}

	initialize() {
		this._elm.innerHTML = '<div></div>';
		this._errorCount = 0;
		this._clickEvents = [];
		this._setEnabled(false);
	}

	getErrorCount() {
		return this._errorCount;
	}

	toggle() {
		this._setEnabled(this._elm.offsetHeight === 0);
	}

	setMessageReceivable(flag) {
		if (flag) {
			this._console('on');
		} else {
			this._console('off');
		}
	}

	addOutput(msgs) {
		this._console('output', msgs);
	}

	addError(msg, className, onClick) {
		const e = document.createElement('div');
		e.className = className;
		appendFormattedOutput(e, msg);
		if (onClick) {
			e.addEventListener('click', onClick);
			e.style.cursor = 'pointer';
			e.id = 'output-pane-' + this._errorCount;
			this._clickEvents[e.id] = onClick;
		}
		const inner = this._cloneLines(MAX_SIZE - 1);
		this._elm.replaceChild(inner, this._elm.firstChild);
		this._elm.firstChild.appendChild(e);
		this._setEnabled(true);
		this._errorCount += 1;
	}

	_addMessages(msgs) {
		msgs = this._compactMessages(msgs, this._msgsCache);
		this._msgsCache = this._msgsCache.concat(msgs);
		const fn = () => {
			this._stOutput = null;
			this._outputs(this._msgsCache.splice(0, MAX_SIZE));
			if (this._msgsCache.length) {
				this._stOutput = setTimeout(fn, DELAY);
			}
		};
		if (!this._stOutput) this._stOutput = setTimeout(fn, DELAY);
	}

	_compactMessages(msgs, cache) {
		const nms = [];
		let last = null;
		for (let m of msgs) {
			if (last && last.type === m.type && last.msg === m.msg) {
				last.count += m.count;
			} else {
				nms.push(m);
				last = m;
			}
		}
		if (0 < cache.length && 0 < nms.length) {
			const tail = cache[cache.length - 1];
			const top = nms[0];
			if (tail.type === top.type && tail.msg === top.msg) {
				tail.count += top.count;
				nms.shift();
			}
		}
		return nms;
	}

	_setEnabled(flag) {
		if ((flag && this._elm.offsetHeight === 0) || (!flag && this._elm.offsetHeight > 0)) {
			this._onVisibilityChange(flag);
		}
		if (flag) {
			clearTimeout(this._stScroll);
			this._stScroll = setTimeout(() => { this._elm.scrollTop = this._elm.scrollHeight }, DELAY);
		}
	}

	_outputs(msgs) {
		const inner = this._cloneLines(MAX_SIZE - msgs.length);

		for (let m of msgs) {
			const e = document.createElement('div');
			e.className = m.type === 'err' ? 'err' : 'std';
			if (Number.isSafeInteger(m.count) && m.count > 1) {
				const count = document.createElement('span');
				count.className = 'count';
				count.textContent = m.count;
				e.appendChild(count);
			}
			if (typeof m.msg === 'string') appendFormattedOutput(e, this._format(m.msg));
			this._assignTypeLabel(e);
			inner.appendChild(e);
		}
		this._elm.replaceChild(inner, this._elm.firstChild);

		if (this._stEnabled) clearTimeout(this._stEnabled);
		this._stEnabled = setTimeout(() => {
			this._setEnabled(true);
			this._stEnabled = null;
		}, 200);
	}

	_assignTypeLabel(msgElm) {
		for (const { type, label } of this._res.typeLabels) {
			const es = msgElm.getElementsByClassName('type-' + type);
			for (const e of es) e.title = label;
		}
	}

	_format(text) {
		text = text.replace(/\t/g, '&nbsp;&nbsp;&nbsp;&nbsp;');
		text = text.replace(/\n/g, '<br>');
		return text;
	}

	_cloneLines(keptCount) {
		const inner = this._elm.firstChild.cloneNode(true);
		const size = inner.hasChildNodes() ? inner.childNodes.length : 0;
		const removedSize = Math.min(size, size - keptCount);
		for (let i = 0; i < removedSize; i += 1) {
			inner.removeChild(inner.firstChild);
		}
		for (let i = 0; i < inner.children.length; i += 1) {
			const cn = inner.children[i];
			if (!cn.id) continue;
			const e = this._clickEvents[cn.id];
			if (e) cn.addEventListener('click', e);
		}
		return inner;
	}

}
