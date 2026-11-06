import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('./src/', import.meta.url));

export default defineConfig({
	root,
	base: './',
	publicDir: false,
	plugins: [{
		name: 'croqujs-editor-stylesheet',
		transformIndexHtml: {
			order: 'post',
			handler(_html, context) {
				if (!context.filename.endsWith('study.html')) return;
				// Keep the editor's prebuilt bundle and its relative worker/assets together.
				return [{ tag: 'link', attrs: { rel: 'stylesheet', href: '../lib/croq-mirror/dist/croq-mirror.min.css' }, injectTo: 'head' }];
			},
		},
	}],
	build: {
		outDir: fileURLToPath(new URL('./app/', import.meta.url)),
		// build.mjs cleans once, then installs the main process and runtime files.
		emptyOutDir: false,
		assetsInlineLimit: 0,
		target: 'esnext',
		sourcemap: true,
		manifest: true,
		rolldownOptions: {
			input: {
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
});
