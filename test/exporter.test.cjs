const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Load the built app so missing packaged parser dependencies fail this test.
const Exporter = require('../app/exporter.js');

test('built exporter resolves and parses a local @use library', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'croqujs-exporter-'));
	try {
		fs.writeFileSync(path.join(directory, 'helpers.js'), 'function twice(value) { return value * 2; }');
		const exporter = new Exporter();
		const [success, output] = exporter.exportAsWebPage(
			'// @use helpers as HELPERS\nconsole.log(HELPERS.twice(3));',
			path.join(directory, 'main.js'), directory,
		);
		assert.equal(success, true);
		assert.match(fs.readFileSync(output, 'utf8'), /src="helpers\.lib\.js"/);
		const context = {};
		vm.runInNewContext(fs.readFileSync(path.join(directory, 'helpers.lib.js'), 'utf8'), context);
		assert.equal(context.HELPERS.twice(3), 6);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
