import { build } from 'vite';
import { fileURLToPath } from 'node:url';

export async function buildBrowserModules() {
	const input = {};
	for (const name of ['project/exporter-browser', 'execution/url-provider-browser']) {
		input[name] = fileURLToPath(new URL('../src/' + name + '.js', import.meta.url));
	}
	input['fs-nw/web'] = fileURLToPath(import.meta.resolve('fs-nw/web'));
	input['url-provider-worker'] = fileURLToPath(new URL('../src/execution/url-provider-worker.js', import.meta.url));
	const result = await build({
		configFile: false,
		publicDir: false,
		logLevel: 'silent',
		build: {
			write: false,
			rolldownOptions: {
				input,
				preserveEntrySignatures: 'strict',
				output: { format: 'es', entryFileNames: '[name].js' },
			},
		},
	});
	return new Map(result.output.map(file => [file.fileName, file.type === 'chunk' ? file.code : file.source]));
}
