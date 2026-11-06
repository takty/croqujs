import { splitPath } from '../../lib/fs-common.js';
import './open-project-dialog.css';

/** Select a project root and a script without changing the current document on cancellation. */
export function showOpenProjectDialog({ root = null, open }) {
	const ja = (document.documentElement.lang || navigator.language).startsWith('ja');
	const labels = ja ? {
		title: 'スクリプトを開く', root: 'ルートディレクトリを選択', file: 'スクリプトファイルを選択',
		empty: '未選択', open: '開く', cancel: 'キャンセル', outside: '選択したルート配下のファイルを選んでください。',
		script: '.jsファイルを選んでください。', unsupported: 'このブラウザではディレクトリ・ファイルの選択を利用できません。',
	} : {
		title: 'Open script', root: 'Choose root directory', file: 'Choose script file',
		empty: 'Not selected', open: 'Open', cancel: 'Cancel', outside: 'Choose a file inside the selected root directory.',
		script: 'Choose a .js file.', unsupported: 'Directory and file pickers are unavailable in this browser.',
	};
	const dialog = document.createElement('dialog');
	dialog.className = 'open-project-dialog';
	dialog.setAttribute('aria-labelledby', 'open-project-title');
	dialog.innerHTML = '<h2 id="open-project-title"></h2>' +
		'<p><button type="button" data-action="root"></button><output data-value="root"></output></p>' +
		'<p><button type="button" data-action="file"></button><output data-value="file"></output></p>' +
		'<p role="alert"></p><footer><button type="button" data-action="cancel"></button>' +
		'<button type="button" data-action="open"></button></footer>';
	const button = action => dialog.querySelector('[data-action="' + action + '"]');
	for (const action of ['root', 'file', 'cancel', 'open']) button(action).textContent = labels[action];
	dialog.querySelector('h2').textContent = labels.title;
	const error = dialog.querySelector('[role="alert"]');
	const supported = typeof window.showDirectoryPicker === 'function' && typeof window.showOpenFilePicker === 'function';
	let filePath = null, busy = false, result = null;
	const update = () => {
		button('root').disabled = busy || !supported;
		button('file').disabled = busy || !supported || !root;
		button('open').disabled = busy || !filePath;
		dialog.querySelector('[data-value="root"]').textContent = root?.name ?? labels.empty;
		dialog.querySelector('[data-value="file"]').textContent = filePath ?? labels.empty;
	};
	const perform = async action => {
		if (busy) return;
		busy = true;
		error.textContent = '';
		update();
		try {
			await action();
		} catch (cause) {
			if (cause.name !== 'AbortError' && dialog.open) error.textContent = cause.message;
		} finally {
			busy = false;
			update();
		}
	};
	button('root').onclick = () => perform(async () => {
		const selected = await window.showDirectoryPicker({ mode: 'read', ...(root ? { startIn: root } : {}) });
		if (!dialog.open) return;
		root = selected;
		filePath = null;
	});
	button('file').onclick = () => perform(async () => {
		const [selected] = await window.showOpenFilePicker({
			startIn: root, multiple: false, excludeAcceptAllOption: true,
			types: [{ description: 'JavaScript', accept: { 'text/javascript': ['.js'] } }],
		});
		const parts = await root.resolve(selected);
		if (!dialog.open) return;
		if (!parts?.length) throw new Error(labels.outside);
		if (!selected.name.toLowerCase().endsWith('.js')) throw new Error(labels.script);
		const relative = parts.join('/');
		splitPath(relative, false);
		filePath = relative;
	});
	button('open').onclick = () => perform(async () => {
		// Keep the modal open if reading fails, so the selection can be corrected.
		button('cancel').disabled = true;
		try {
			result = await open(root, filePath);
			dialog.close();
		} finally {
			button('cancel').disabled = false;
		}
	});
	button('cancel').onclick = () => dialog.close();
	dialog.addEventListener('cancel', event => {
		if (button('cancel').disabled) event.preventDefault();
	});
	if (!supported) error.textContent = labels.unsupported;
	update();
	document.body.appendChild(dialog);
	return new Promise(resolve => {
		dialog.addEventListener('close', () => { dialog.remove(); resolve(result); }, { once: true });
		dialog.showModal();
	});
}
