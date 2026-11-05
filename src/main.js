/**
 * Main (JS)
 *
 * @author Takuto Yanagida
 * @version 2026-11-03
 */

import { app } from 'electron';
import { NodeFileSystem } from './lib/fs-node.js';
import PROC from 'node:process';
import { SessionServer } from './session-server.js';

const FS = new NodeFileSystem();

class Main {

	constructor() {
		this._gs      = [];
		this._gId     = 0;
		this._isReady = false;
		this._macPath = null;

		if (!app.requestSingleInstanceLock()) app.quit();

		app.on('activate', () => {  // for Mac
			if (this._gs.length === 0) this._createWindow();
		});
		app.on('will-finish-launching', () => {  // for Mac
			app.on('open-file', async (e, p) => {
				e.preventDefault();
				if (this._isReady) this._createWindow(await this._checkArgPath(p));
				else this._macPath = p;
			});
		});
		app.on('ready', async () => {
			const initialPath = this._macPath;
			this._macPath = null;
			this._isReady = true;
			const path = initialPath ? await this._checkArgPath(initialPath) : await this._getArgPath();
			this._createWindow(path);
		});
		app.on('second-instance', async (e, argv, workDir) => {
			this._createWindow(await this._getArgPath(argv));
		});
		app.on('window-all-closed', () => {
			app.quit();
		});
	}

	async _getArgPath(argv = PROC.argv) {
		if (argv.length === 1) return null;
		return this._checkArgPath(argv[argv.length - 1]);
	}

	async _checkArgPath(path) {
		try {
			if (!(await FS.exists(path))) return null;
			if (await FS.isDirectory(path)) return null;
		} catch (e) {
			console.error(e);
			return null;
		}
		return path;
	}

	_createWindow(path = null) {
		this._gId += 1;
		const g = new SessionServer(this._gId, path);
		g._studyWin.on('closed', () => { this._gs.splice(this._gs.indexOf(g), 1); });
		this._gs.push(g);
	}

}

new Main();
