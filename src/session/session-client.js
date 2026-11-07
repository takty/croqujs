/**
 * Session Client - sends requests to SessionServer over Electron IPC
 *
 * @author Takuto Yanagida
 * @version 2026-11-03
 */

export class SessionClient {

	#id = null;

	constructor(id) {
		this.#id = id;
	}

	addWindowCloseListener(fn) {
		window.ipc.on('windowClose', fn);
	}

	getPathForFile(file) {
		return window.ipc.getPathForFile(file);
	}

	// -------------------------------------------------------------------------

	onStudyToggleDevTools() {
		this.#send('onStudyToggleDevTools');
	}

	onStudyModified() {
		this.#send('onStudyModified');
	}

	onStudyErrorOccurred(params) {
		this.#send('onStudyErrorOccurred', params);
	}

	onStudyToggleDevToolsField() {
		this.#send('onStudyToggleDevToolsField');
	}

	onStudyTitleChanged(title) {
		this.#send('onStudyTitleChanged', title);
	}

	onStudyProgramClosed() {
		this.#send('onStudyProgramClosed');
	}

	// -------------------------------------------------------------------------

	doReady() {
		return this.#invoke('doReady');
	}

	doUnmaximize() {
		return this.#invoke('doUnmaximize');
	}

	//

	doNew() {
		return this.#invoke('doNew');
	}

	doOpen(dirPath = '') {
		return this.#invoke('doOpen', dirPath);
	}

	doClose(text) {
		return this.#invoke('doClose', text);
	}

	doFileDropped(path) {
		return this.#invoke('doFileDropped', path);
	}

	//

	doSave(text, dialogTitle) {
		return this.#invoke('doSave', text, dialogTitle);
	}

	doSaveAs(text, dialogTitle) {
		return this.#invoke('doSaveAs', text, dialogTitle);
	}

	doSaveCopy(text, dialogTitle) {
		return this.#invoke('doSaveCopy', text, dialogTitle);
	}

	doExportAsWebPage(text) {
		return this.#invoke('doExportAsWebPage', text);
	}

	doExportAsLibrary(text, libName, isUseDecIncluded, jsonCodeStructure) {
		return this.#invoke('doExportAsLibrary', text, libName, isUseDecIncluded, jsonCodeStructure);
	}

	doRun(text) {
		return this.#invoke('doRun', text);
	}

	doRunWithoutWindow(text) {
		return this.#invoke('doRunWithoutWindow', text);
	}

	// -------------------------------------------------------------------------

	#send(msg, ...args) {
		window.ipc.send(`notifyServer_${this.#id}`, msg, ...args);
	}

	#invoke(msg, ...args) {
		return window.ipc.invoke(`callServer_${this.#id}`, msg, ...args);
	}

}

export { SessionClient as Session };
