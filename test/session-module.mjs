import { build } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

let modulePromise;

export function loadSessionModule() {
	return modulePromise ??= (async () => {
		const output = new URL(`./.profiles/session-${process.pid}.mjs`, import.meta.url);
		const result = await build({
			configFile: false,
			publicDir: false,
			logLevel: 'silent',
			define: { 'import.meta.url': JSON.stringify(new URL('../app/session/session-server.js', import.meta.url).href) },
			ssr: { noExternal: true, external: ['electron'] },
			build: {
				ssr: fileURLToPath(new URL('../src/session/session-server.js', import.meta.url)),
				write: false,
				rolldownOptions: { external: ['electron', /^node:/], output: { format: 'es' } },
			},
		});
		await mkdir(new URL('./.profiles/', import.meta.url), { recursive: true });
		await writeFile(output, result.output.find(file => file.type === 'chunk').code);
		return import(output.href);
	})();
}
