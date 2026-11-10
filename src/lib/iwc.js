/**
 * Inter Window Communication
 *
 * @author Takuto Yanagida
 * @version 2026-11-10
 */

export class Iwc {

	static _windowIds = new WeakMap();

	constructor(address, prefix = '', win = window) {
		this._address = address;
		this._prefix  = prefix;
		this._win     = win;
		this._channel = null;

		if (!Iwc._windowIds.has(win)) {
			Iwc._windowIds.set(win, win.crypto.randomUUID());
		}
		this._source = Iwc._windowIds.get(win);
	}

	send(to, data) {
		const v = JSON.stringify(data);
		if (v === undefined) {
			throw new TypeError('Expected JSON-serializable data');
		}
		const ch = new this._win.BroadcastChannel(this._prefix + to);
		try {
			ch.postMessage({ source: this._source, payload: v });
		} finally {
			ch.close();
		}
	}

	listen(handler) {
		this.dispose();
		this._channel = new this._win.BroadcastChannel(this._prefix + this._address);
		this._channel.onmessage = event => {
			if (event.data.source === this._source) return;
			handler(JSON.parse(event.data.payload));
		};
	}

	dispose() {
		this._channel?.close();
		this._channel = null;
	}

}
