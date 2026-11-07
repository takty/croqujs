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
			alias: {
				'./lib/jssha/sha256.mjs': fileURLToPath(import.meta.resolve('jssha/sha256')),
				'./acorn/acorn.mjs': fileURLToPath(import.meta.resolve('acorn')),
				'./acorn/walk.mjs': fileURLToPath(import.meta.resolve('acorn-walk')),
				'#session': path.join(root, 'study', web ? 'session-local.js' : 'session-client.js'),
			},
		},
		server: { open: web ? '/' : '/study/study.html' },
		preview: { open: web ? '/' : '/study/study.html' },
		plugins: [{
			name: 'croqujs-editor-stylesheet',
			transformIndexHtml: {
				order: 'post',
				handler(_html, context) {
					if (path.resolve(context.filename) !== path.join(root, web ? 'index.html' : 'study/study.html')) return;
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
				input: web ? { index: path.join(root, 'index.html'), field: path.join(root, 'field/index.html') } : {
					study: path.join(root, 'study/study.html'),
					field: path.join(root, 'field/index.html'),
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
