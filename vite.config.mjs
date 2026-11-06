import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { webResources } from './vite-web-resources.mjs';

const root = fileURLToPath(new URL('./src/', import.meta.url));

export default defineConfig(({ mode }) => {
	const web = mode === 'web';
	return {
		root,
		base: './',
		publicDir: false,
		cacheDir: fileURLToPath(new URL('./node_modules/.vite/', import.meta.url)),
		resolve: {
			alias: { '#session': path.join(root, 'study', web ? 'session-local.js' : 'session-client.js') },
		},
		server: { open: web ? '/index.html' : '/study/study.html' },
		preview: { open: web ? '/index.html' : '/study/study.html' },
		plugins: [{
			name: 'croqujs-editor-stylesheet',
			transformIndexHtml: {
				order: 'post',
				handler(_html, context) {
					if (!context.filename.endsWith(web ? 'index.html' : 'study.html')) return;
					// Keep the editor's prebuilt bundle and its relative worker/assets together.
					return [{ tag: 'link', attrs: { rel: 'stylesheet', href: (web ? './' : '../') + 'lib/croq-mirror/dist/croq-mirror.min.css' }, injectTo: 'head' }];
				},
			},
		}, ...(web ? [webResources()] : [])],
		build: {
			outDir: fileURLToPath(new URL(web ? './dist-web/' : './app/', import.meta.url)),
			// build.mjs cleans once, then installs the main process and runtime files.
			emptyOutDir: web,
			assetsInlineLimit: 0,
			target: 'esnext',
			sourcemap: true,
			manifest: true,
			rolldownOptions: {
				input: web ? { index: path.join(root, 'index.html') } : {
					study: path.join(root, 'study/study.html'),
					field: path.join(root, 'field/field.html'),
					// Preserve the existing module entry used by integration tools.
					'study/study': path.join(root, 'study/study.js'),
				},
				preserveEntrySignatures: 'strict',
				output: {
					entryFileNames: chunk => chunk.name === 'study/study' ? '[name].js' : 'assets/[name]-[hash].js',
				},
			},
		},
	};
});
