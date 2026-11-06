/**
 * Splitter
 *
 * @author Takuto Yanagida
 * @version 2026-11-01
 */

import './splitter.css';

export class Splitter {

	constructor(elm, { main, handle, sub, minMain = 100, minSub = 32, height = 100, onResize = () => {} }) {
		this._elm        = elm;
		this._main       = main;
		this._handle     = handle;
		this._sub        = sub;
		this._minMain    = minMain;
		this._minSub     = minSub;
		this._lastHeight = height;
		this._onResize   = onResize;
		this._events     = new AbortController();
		handle.classList.add('splitter-handle');

		let pressed = false, resizing = false, py;
		const options = { signal: this._events.signal };
		handle.addEventListener('mousedown', e => {
			py       = e.clientY - handle.getBoundingClientRect().top;
			pressed  = true;
			resizing = false;
		}, options);
		elm.ownerDocument.addEventListener('mousemove', e => {
			if (!pressed) return;
			resizing = true;
			const mainHeight = e.clientY - py - elm.getBoundingClientRect().top;
			this._setHeight(elm.clientHeight - mainHeight - handle.offsetHeight);
			e.preventDefault();
		}, options);
		elm.ownerDocument.addEventListener('mouseup', e => {
			if (!pressed) return;
			pressed = false;
			if (minSub < sub.offsetHeight) this._lastHeight = sub.offsetHeight;
			e.preventDefault();
		}, options);
		handle.addEventListener('click', () => {
			if (!resizing) this.setVisible(sub.offsetHeight === 0);
		}, options);
		elm.ownerDocument.body.addEventListener('mouseenter', e => {
			if (pressed && !e.buttons) pressed = false;
		}, options);
		this._observer = new ResizeObserver(() => this._setHeight(sub.offsetHeight));
		this._observer.observe(elm);
		this._setHeight(sub.offsetHeight);
	}

	setVisible(flag) {
		if (flag !== (this._sub.offsetHeight > 0)) this._setHeight(flag ? this._lastHeight : 0);
	}

	destroy() {
		this._events.abort();
		this._observer.disconnect();
	}

	_setHeight(height) {
		const available = Math.max(0, this._elm.clientHeight - this._handle.offsetHeight);
		height = Math.max(0, Math.min(height, available - this._minMain));
		if (height < this._minSub) height = 0;
		const mainHeight = available - height;
		this._main.style.height = mainHeight + 'px';
		this._sub.style.height  = height + 'px';
		this._onResize(mainHeight, height);
	}

}
