// Keep recovery data separate from the transient communication keys.
export class WebDraft {
	constructor(storage, key, owner) {
		this._storage = storage;
		this._key = key;
		this._owner = owner;
	}

	read() {
		try {
			const draft = JSON.parse(this._storage.getItem(this._key));
			return typeof draft?.text === 'string' ? draft.text : null;
		} catch (error) {
			console.warn('Could not read recovery data', error);
			return null;
		}
	}

	write(text) {
		try {
			this._storage.setItem(this._key, JSON.stringify({ owner: this._owner, text }));
			return true;
		} catch (error) {
			console.warn('Could not save recovery data', error);
			return false;
		}
	}

	clear() {
		try {
			const draft = JSON.parse(this._storage.getItem(this._key));
			if (draft?.owner === this._owner) this._storage.removeItem(this._key);
		} catch (error) {
			console.warn('Could not clear recovery data', error);
		}
	}
}
