import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { Iwc } from '../src/lib/iwc.js';

function context() {
	return { BroadcastChannel, crypto: { randomUUID }, get localStorage() { throw new Error('Storage must not be used'); } };
}

function receiver(t, address, prefix = '', win = context()) {
	const iwc = new Iwc(address, prefix, win);
	t.after(() => iwc.dispose());
	return iwc;
}

function collect(iwc, count) {
	return new Promise((resolve, reject) => {
		const messages = [];
		const timeout = setTimeout(() => reject(new Error('Messages did not arrive')), 2000);
		iwc.listen(message => {
			messages.push(message);
			if (messages.length === count) {
				clearTimeout(timeout);
				resolve(messages);
			}
		});
	});
}

test('retains independent error/output payloads and identical consecutive messages', async t => {
	const address = randomUUID();
	const target = receiver(t, address);
	const sender = receiver(t, randomUUID());
	const error = { message: 'error', params: { msg: 'ReferenceError: dfdsafasdfa is not defined' } };
	const output = { message: 'output', params: [{ msg: 'hoge', type: 'std', count: 1 }] };
	const received = collect(target, 3);
	sender.send(address, error);
	sender.send(address, output);
	sender.send(address, output);
	output.params[0].msg = 'changed after send';
	assert.deepEqual(await received, [error, ...Array.from({ length: 2 }, () => ({ message: 'output', params: [{ msg: 'hoge', type: 'std', count: 1 }] }))]);
});

test('suppresses all receivers in the sending window and isolates addresses', async t => {
	const address = randomUUID();
	const win = context();
	const sender = receiver(t, address, '', win);
	const sameWindow = receiver(t, address, '', win);
	const peer = receiver(t, address);
	const otherAddress = receiver(t, randomUUID());
	const otherMessages = [];
	otherAddress.listen(message => otherMessages.push(message));
	const local = collect(sameWindow, 1);
	const remote = collect(peer, 1);
	sender.send(address, 'self');
	assert.deepEqual(await remote, ['self']);
	peer.send(address, 'remote');
	assert.deepEqual(await local, ['remote']);
	assert.deepEqual(otherMessages, []);
});

test('listen replaces its handler; dispose is repeatable and permits reuse and sending', async t => {
	const address = randomUUID();
	const target = receiver(t, address);
	const sender = receiver(t, randomUUID());
	const oldMessages = [];
	target.listen(message => oldMessages.push(message));
	sender.send(address, 'queued before replacement');
	const received = collect(target, 1);
	sender.send(address, 'new handler');
	assert.deepEqual(await received, ['new handler']);
	assert.deepEqual(oldMessages, []);
	target.dispose();
	target.dispose();
	sender.send(address, 'no listener');
	const reused = collect(target, 1);
	sender.send(address, 'listening again');
	assert.deepEqual(await reused, ['listening again']);
	const reply = collect(sender, 1);
	target.dispose();
	target.send(sender._address, 'send after dispose');
	assert.deepEqual(await reply, ['send after dispose']);
});

test('preserves JSON conversion and rejects unsupported root values before sending', async t => {
	const address = randomUUID();
	const sender = receiver(t, randomUUID());
	const target = receiver(t, address);
	const received = collect(target, 1);
	sender.send(address, { keep: 1, omitted: undefined, values: [undefined, NaN] });
	assert.deepEqual(await received, [{ keep: 1, values: [null, null] }]);
	assert.throws(() => sender.send(address, undefined), TypeError);
	assert.throws(() => sender.send(address, () => {}), TypeError);
	assert.throws(() => sender.send(address, 1n), TypeError);
	const circular = {}; circular.self = circular;
	assert.throws(() => sender.send(address, circular), TypeError);
});

test('constructor prefix isolates applications sharing the same address', async t => {
	const address = randomUUID();
	const first = receiver(t, address, 'first:');
	const second = receiver(t, address, 'second:');
	const firstSender = receiver(t, 'sender', 'first:');
	const secondSender = receiver(t, 'sender', 'second:');
	const firstMessages = collect(first, 1);
	const secondMessages = collect(second, 1);
	firstSender.send(address, 'first message');
	secondSender.send(address, 'second message');
	assert.deepEqual(await firstMessages, ['first message']);
	assert.deepEqual(await secondMessages, ['second message']);
});
