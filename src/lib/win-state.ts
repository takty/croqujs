/**
 *
 * Window State
 *
 * @author Takuto Yanagida
 * @version 2026-11-12
 */

const MIN_WIDTH  = 480;
const MIN_HEIGHT = 360;

interface State {
	x : number,
	y : number,
	cx: number,
	cy: number,
}

export class WinState {
	_win   : Window;
	_key   : string;
	_config: Storage;
	_state : State;

	constructor(win: Window, key = 'winState', suppressRestore: boolean = false, config: Storage = win.localStorage) {
		this._state  = { x: 0, y: 0, cx: 0, cy: 0 };
		this._win    = win;
		this._key    = key;
		this._config = config;

		this.#initialize(suppressRestore);
	}

	#initialize(suppressRestore: boolean): void {
		const POLING_INTERVAL = 500;
		const MINOR_DELAY     = 0;

		const raw = this._config.getItem(this._key);
		const t   = raw ? JSON.parse(raw) : null;

		if (t && suppressRestore !== true) {
			this._state = { x: t.x, y: t.y, cx: t.cx, cy: t.cy };
			this.#restore();
			this._win.addEventListener('load', (): void => {
				setTimeout((): void => this.#restore(), MINOR_DELAY);
				setTimeout(inter, POLING_INTERVAL);
			});
		} else {
			this._win.addEventListener('load', () => setTimeout(inter, POLING_INTERVAL));
		}
		const inter: (() => void) = (): void => {
			this.#dump();
			setTimeout(inter, POLING_INTERVAL);
		};
	}

	#dump(): void {
		if (this._win.document.fullscreenElement != null) return;

		const cx: number = this._win.outerWidth;
		const cy: number = this._win.outerHeight;
		if (cx < MIN_WIDTH || cy < MIN_HEIGHT) return;

		const x: number = this._win.screenX;
		const y: number = this._win.screenY;
		if (this._state.x === x && this._state.y === y && this._state.cx === cx && this._state.cy === cy) return;

		this._state.x  = x;
		this._state.y  = y;
		this._state.cx = cx;
		this._state.cy = cy;

		this._config.setItem(this._key, JSON.stringify(this._state));
	}

	#restore(): void {
		if (this._state.cx === undefined) return;
		if (this._state.cx !== 0 && this._state.cy !== 0) {
			this._win.resizeTo(
				Math.max(MIN_WIDTH,  this._state.cx),
				Math.max(MIN_HEIGHT, this._state.cy)
			);
		}
		const screen = this._win.screen as Screen & {
			readonly availLeft?: number;
			readonly availTop? : number;
		};
		const minX: number = screen.availLeft ?? 0;
		const minY: number = screen.availTop ?? 0;
		const maxX: number = minX + screen.availWidth;
		const maxY: number = minY + screen.availHeight;

		const x: number = Math.max(minX, Math.min(this._state.x, maxX));
		const y: number = Math.max(minY, Math.min(this._state.y, maxY));
		this._win.moveTo(x, y);
	}

}
