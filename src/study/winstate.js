/**
 *
 * WinState (JS)
 *
 * @author Takuto Yanagida
 * @version 2020-09-28
 *
 */


'use strict';

const WINSTATE_MIN_WIDTH  = 400;
const WINSTATE_MIN_HEIGHT = 300;

class WinState {

	constructor(win, key = 'winState', suppressRestore = false, config = win.localStorage) {
		this._state  = {};
		this._win    = win;
		this._key    = key;
		this._config = config;

		this._initialize(suppressRestore);
	}

	_initialize(suppressRestore) {
		const POLING_INTERVAL = 500;
		const MINOR_DELAY = 0;

		const raw = this._config.getItem(this._key);
		const t = raw ? JSON.parse(raw) : null;

		if (t && suppressRestore !== true) {
			this._state = { x: t.x, y: t.y, width: t.width, height: t.height };
			this._restore();
			this._win.addEventListener('load', () => {
				setTimeout(() => { this._restore(); }, MINOR_DELAY);
				setTimeout(inter, POLING_INTERVAL);
			});
		} else {
			this._win.addEventListener('load', () => { setTimeout(inter, POLING_INTERVAL); });
		}
		const inter = () => {
			this._dump();
			setTimeout(inter, POLING_INTERVAL);
		};
	}

	_dump() {
		if (this._win.document.fullscreenElement != null) return;

		const w = this._win.outerWidth;
		const h = this._win.outerHeight;
		if (w < WINSTATE_MIN_WIDTH || h < WINSTATE_MIN_HEIGHT) return;

		const x = this._win.screenX;
		const y = this._win.screenY;
		if (this._state.x === x && this._state.y === y && this._state.width === w && this._state.height === h) return;

		this._state.x      = x;
		this._state.y      = y;
		this._state.width  = w;
		this._state.height = h;

		this._config.setItem(this._key, JSON.stringify(this._state));
	}

	_restore() {
		if (this._state.width === undefined) return;
		if (this._state.width !== 0 && this._state.height !== 0) {
			this._win.resizeTo(
				Math.max(WINSTATE_MIN_WIDTH,  this._state.width),
				Math.max(WINSTATE_MIN_HEIGHT, this._state.height)
			);
		}
		const minX = this._win.screen.availLeft;
		const minY = this._win.screen.availTop;
		const maxX = this._win.screen.availLeft + this._win.screen.availWidth;
		const maxY = this._win.screen.availTop + this._win.screen.availHeight;

		const x = Math.max(minX, Math.min(this._state.x, maxX));
		const y = Math.max(minY, Math.min(this._state.y, maxY));
		this._win.moveTo(x, y);
	}

}
