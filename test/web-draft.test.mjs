import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebDraft } from '../src/study/web-draft.js';

test('recovery survives a new instance, including empty text, until explicitly cleared', () => {
	const values = new Map();
	const storage = {
		getItem: key => values.get(key) ?? null,
		setItem: (key, value) => values.set(key, value),
		removeItem: key => values.delete(key),
	};
	const first = new WebDraft(storage, '$draft', 'first');
	assert.equal(first.read(), null);
	first.write('日本語\nconsole.log("draft");');
	const reopened = new WebDraft(storage, '$draft', 'reopened');
	assert.equal(reopened.read(), '日本語\nconsole.log("draft");');
	reopened.write('');
	first.clear();
	assert.equal(reopened.read(), ''); // Another window cannot clear this owner's draft.
	reopened.clear();
	assert.equal(reopened.read(), null);
});
