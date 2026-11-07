/** Build the exported test renderer while keeping the production HTML styles. */
exports.withStudyInstance = async html => {
	const { build } = await import('vite');
	const { pathToFileURL } = require('node:url');
	const path = require('node:path');
	const directory = path.join(__dirname, '.profiles', 'renderer-' + process.pid);
	const { default: configure } = await import('../vite.config.mjs');
	const config = configure({ mode: 'app', command: 'build' });
	config.build.outDir = directory;
	config.build.emptyOutDir = true;
	config.build.manifest = false;
	config.build.rolldownOptions.input = { main: path.join(__dirname, '../src/study/main.js') };
	config.build.rolldownOptions.output.entryFileNames = 'main.js';
	await build({ ...config, configFile: false, mode: 'app', logLevel: 'silent' });
	const bootstrap = /<script\b(?=[^>]*type="module")[^>]*>[\s\S]*?<\/script>/g;
	if ([...html.matchAll(bootstrap)].length !== 1) throw new Error('Expected one Vite renderer bootstrap');
	return html.replace(bootstrap, `<script type="module">
		import { Study } from '${pathToFileURL(path.join(directory, 'main.js')).href}';
		window.addEventListener('DOMContentLoaded', () => { window.study = new Study(); });
	</script>`);
};
