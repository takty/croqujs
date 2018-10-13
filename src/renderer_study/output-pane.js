/**
 *
 * Output Pane
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-10-13
 *
 */


'use strict';


class OutputPane {

	constructor() {
		const ELM_ID = 'output-pane';

		this._elm = document.getElementById(ELM_ID);
		this._msgsCache = [];
		this._stOutput = null;
		this._stEnabled = null;
	}

	initialize() {
		this._elm.innerHTML = '<div></div>';
		this._setEnabled(false);
	}

	toggle() {
		this._setEnabled(this._elm.offsetHeight === 0);
	}

	addConsoleOutput(msgs) {
		this._msgsCache = this._msgsCache.concat(msgs);
		const fn = () => {
			this._stOutput = null;
			this._outputs(this._msgsCache.splice(0, 100));
			if (this._msgsCache.length) {
				this._stOutput = setTimeout(fn, 100);
			}
		};
		if (!this._stOutput) setTimeout(fn, 100);
	}

	setErrorMessage(msg, className, onClick) {
		const e = document.createElement('div');
		e.className = className;
		if (msg.indexOf('<') === -1) {
			e.appendChild(document.createTextNode(msg));
		} else {
			e.innerHTML = msg;
		}
		if (onClick) {
			e.addEventListener('click', onClick);
			e.style.cursor = 'pointer';
		}
		const inner = this._cloneLines(MAX_CONSOLE_OUTPUT_SIZE - 1);
		this._elm.replaceChild(inner, this._elm.firstChild);
		this._elm.firstChild.appendChild(e);
		this._setEnabled(true);
	}

	_setEnabled(flag) {
		if ((flag && this._elm.offsetHeight === 0) || (!flag && this._elm.offsetHeight > 0)) {
			const ev = document.createEvent('HTMLEvents');
			ev.initEvent('click', true, false);
			const r = document.querySelector('#handle');
			r.dispatchEvent(ev);
		}
		if (flag) setTimeout(() => { this._elm.scrollTop = this._elm.scrollHeight }, 100);
	}

	_outputs(msgs) {
		const inner = this._cloneLines(MAX_CONSOLE_OUTPUT_SIZE - msgs.length);

		for (let m of msgs) {
			const e = document.createElement('div');
			e.className = m.type;
			const c = (m.count > 1) ? ('<span class="count">' + m.count + '</span>') : '';
			e.innerHTML = c + m.msg;
			inner.appendChild(e);
		}
		this._elm.replaceChild(inner, this._elm.firstChild);

		if (this._stEnabled) clearTimeout(this._stEnabled);
		this._stEnabled = setTimeout(() => {
			this._setEnabled(true);
			this._stEnabled = null;
		}, 200);
	}

	_cloneLines(keptCount) {
		const inner = this._elm.firstChild.cloneNode(true);
		const size = inner.hasChildNodes() ? inner.childNodes.length : 0;
		const removedSize = Math.min(size, size - keptCount);
		for (let i = 0; i < removedSize; i += 1) {
			inner.removeChild(inner.firstChild);
		}
		return inner;
	}

}
