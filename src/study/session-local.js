/**
 * Session Local - provisional browser-only session
 *
 * @author Takuto Yanagida
 * @version 2026-11-06
 */

export class SessionLocal {

	addWindowCloseListener() {
		// Study handles unsaved changes through beforeunload in the browser.
	}

	getPathForFile() { return null; }

	onStudyToggleDevTools() {}
	onStudyModified() {}
	onStudyErrorOccurred() {}
	onStudyToggleDevToolsField() {}
	onStudyProgramClosed() {}

	onStudyTitleChanged(title) {
		document.title = title;
	}

	doReady() {
		return this.doNew();
	}

	doNew() {
		return ['init', [null, '', '', '', false, [], '']];
	}

	doUnmaximize() { return ['nop']; }

	// File access and execution will be connected to the browser adapters later.
	doOpen() { return this.#unsupported(); }
	doClose() { return this.#unsupported(); }
	doFileDropped() { return this.#unsupported(); }
	doSave() { return this.#unsupported(); }
	doSaveAs() { return this.#unsupported(); }
	doSaveCopy() { return this.#unsupported(); }
	doExportAsWebPage() { return this.#unsupported(); }
	doExportAsLibrary() { return this.#unsupported(); }
	doRun() { return this.#unsupported(); }
	doRunWithoutWindow() { return this.#unsupported(); }

	#unsupported() {
		const message = navigator.language.startsWith('ja')
			? 'Web版ではこの操作はまだ利用できません。'
			: 'This operation is not yet available in the web version.';
		return ['alert_error', '\n' + message];
	}
}

export { SessionLocal as Session };
