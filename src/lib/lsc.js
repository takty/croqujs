/**
 * Local Storage Communication
 *
 * @author Takuto Yanagida
 * @version 2026-11-02
 */

export class Lsc {

	constructor(address, win = window) {
		this._address  = address;
		this._win      = win;
		this._listener = null;
	}

	send(to, data) {
		const v = JSON.stringify(data);
		if (v === undefined) {
			throw new TypeError('Expected JSON-serializable data');
		}
		this._win.localStorage.setItem(to, v);
	}

	// Calling listen again replaces the previous handler.
	listen(handler) {
		this.dispose();
		const ls = this._win.localStorage;

		this._listener = event => {
			if (event.storageArea !== ls || event.key !== this._address) {
				return;
			}
			const v = ls.getItem(this._address);
			if (v === null) {
				return;
			}
			ls.removeItem(this._address);
			handler(JSON.parse(v));
		};
		this._win.addEventListener('storage', this._listener);
	}

	dispose() {
		if (this._listener === null) {
			return;
		}
		this._win.removeEventListener('storage', this._listener);
		this._listener = null;
	}

}
