import { splitPath } from 'fs-nw/base';
import './project-dialog.css';

/** Select a project root and a script without changing the current document on cancellation. */
export function showOpenProjectDialog(options) {
	return showProjectDialog(options);
}

export function showSaveProjectDialog({ save, ...options }) {
	return showProjectDialog({ ...options, open: save, saving: true });
}

function showProjectDialog({ res, root = null, open, saving = false, title, suggestedName = 'untitled.js', droppedFile = null }) {
	const labels = {
		...res.projectDialog,
		title: title || (saving ? res.projectDialog.saveTitle : res.projectDialog.openTitle),
		file: saving ? res.projectDialog.destination : res.projectDialog.file,
		open: saving ? res.projectDialog.save : res.projectDialog.open,
		cancel: res.btn.cancel,
	};
	const dialog = document.createElement('dialog');
	dialog.className = 'project-dialog';
	dialog.setAttribute('aria-labelledby', 'project-title');
	dialog.innerHTML = '<h2 id="project-title"></h2>' +
		'<p><button type="button" data-action="root"></button><output data-value="root"></output></p>' +
		'<p><button type="button" data-action="file"></button><output data-value="file"></output></p>' +
		'<p role="alert"></p><footer><button type="button" data-action="cancel"></button>' +
		'<button type="button" data-action="open"></button></footer>';
	const button = action => dialog.querySelector('[data-action="' + action + '"]');
	for (const action of ['root', 'file', 'cancel', 'open']) button(action).textContent = labels[action];
	dialog.querySelector('h2').textContent = labels.title;
	const error = dialog.querySelector('[role="alert"]');
	const supported = typeof window.showDirectoryPicker === 'function' && typeof window[saving ? 'showSaveFilePicker' : 'showOpenFilePicker'] === 'function';
	let filePath = null, busy = false, result = null;
	const update = () => {
		button('root').disabled = busy || !supported;
		button('file').disabled = busy || !supported || !root;
		button('open').disabled = busy || !filePath;
		dialog.querySelector('[data-value="root"]').textContent = root?.name ?? labels.empty;
		dialog.querySelector('[data-value="file"]').textContent = filePath ?? droppedFile?.name ?? labels.empty;
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
		const selected = await window.showDirectoryPicker({ mode: saving ? 'readwrite' : 'read', ...(root ? { startIn: root } : {}) });
		if (!dialog.open) return;
		root = selected;
		filePath = null;
		if (droppedFile) {
			const parts = await root.resolve(droppedFile);
			if (!dialog.open) return;
			if (!parts?.length) throw new Error(labels.outside);
			filePath = parts.join('/');
			splitPath(filePath, false);
		}
	});
	button('file').onclick = () => perform(async () => {
		const options = {
			startIn: root, excludeAcceptAllOption: true,
			types: [{ description: labels.fileType, accept: { 'text/javascript': ['.js'] } }],
		};
		const selected = saving
			? await window.showSaveFilePicker({ ...options, suggestedName })
			: (await window.showOpenFilePicker({ ...options, multiple: false }))[0];
		const parts = await root.resolve(selected);
		if (!dialog.open) return;
		if (!parts?.length) throw new Error(labels.outside);
		if (!selected.name.toLowerCase().endsWith('.js')) throw new Error(labels.script);
		const relative = parts.join('/');
		splitPath(relative, false);
		filePath = relative;
		droppedFile = null;
	});
	button('open').onclick = () => perform(async () => {
		// Keep the modal open if reading or writing fails, so the selection can be corrected.
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
	const previousFocus = document.activeElement;
	return new Promise(resolve => {
		dialog.addEventListener('close', () => {
			dialog.remove();
			setTimeout(() => {
				// Chrome can retain keyboard focus without restoring text input after a modal.
				if (previousFocus?.isConnected) {
					previousFocus.blur();
					previousFocus.focus({ preventScroll: true });
				}
				resolve(result);
			}, 0);
		}, { once: true });
		dialog.showModal();
	});
}
