const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test, before } = require('node:test');

// Exercise generation and dependency parsing through the exporter source API.
let NodeExporter, NodeFileSystem;
before(async () => {
	({ NodeExporter } = await import('../src/project/exporter-node.js'));
	({ NodeFileSystem } = await import('fs-nw/node'));
});

test('Node exporter resolves and parses a local @use library', async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'croqujs-exporter-'));
	try {
		fs.writeFileSync(path.join(directory, 'helpers.js'), 'function twice(value) { return value * 2; }');
		const exporter = new NodeExporter(new NodeFileSystem(), path.join(__dirname, '../app/assets/injection.js'));
		const [success, output] = await exporter.exportAsWebPage(
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

test('Node exporter copies nested dependencies and runtime injection', async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'croqujs-exporter-'));
	try {
		fs.mkdirSync(path.join(directory, 'nested'));
		fs.writeFileSync(path.join(directory, 'nested', 'helper.js'), 'const message = "日本語";\n');
		const outputDir = path.join(directory, 'output');
		fs.mkdirSync(outputDir);
		const exporter = new NodeExporter(new NodeFileSystem(), path.join(__dirname, '../app/assets/injection.js'));
		const [success, output] = await exporter.exportAsWebPage(
			'// @need nested/helper.js\nconsole.log(message);',
			path.join(directory, 'main.js'), outputDir, true,
		);
		assert.equal(success, true);
		const html = fs.readFileSync(output, 'utf8');
		assert.match(html, /console\.log\(message\)/);
		const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
		assert.equal(scripts.length, 2);
		assert.equal(scripts[0], 'lib/injection.js');
		for (const script of scripts) assert.equal(fs.existsSync(path.join(outputDir, script)), true);
		assert.equal(fs.readFileSync(path.join(outputDir, scripts[0]), 'utf8'), fs.readFileSync(path.join(__dirname, '../app/assets/injection.js'), 'utf8'));
		assert.equal(fs.readFileSync(path.join(outputDir, scripts[1]), 'utf8'), 'const message = "日本語";\n');
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
