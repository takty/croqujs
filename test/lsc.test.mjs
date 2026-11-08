import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Lsc } from '../src/lib/lsc.js';

test('queued notifications retain their own payload after the storage value is overwritten or removed', () => {
	const values = new Map();
	const storage = {
		setItem(key, value) { values.set(key, value); },
		getItem(key) { return values.get(key) ?? null; },
		removeItem(key) { values.delete(key); },
	};
	const window = new EventTarget();
	window.localStorage = storage;
	const received = [];
	const receiver = new Lsc('#study_test', window);
	receiver.listen(message => received.push(message));
	const sender = new Lsc('#injection_test', window);
	const messages = [
		{ message: 'error', params: { msg: 'ReferenceError: dfdsafasdfa is not defined' } },
		{ message: 'output', params: [{ msg: 'hoge', type: 'std', count: 1 }] },
	];
	for (const message of messages) sender.send('#study_test', message);
	for (const newValue of [...messages.map(message => JSON.stringify(message)), null]) {
		window.dispatchEvent(Object.assign(new Event('storage'), {
			key: '#study_test', storageArea: storage, newValue,
		}));
	}
	assert.deepEqual(received, messages);
	assert.equal(storage.getItem('#study_test'), null);
	receiver.dispose();
});
