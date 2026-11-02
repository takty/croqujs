/**
 * Node.js implementation of local file and path operations.
 * Sync operations throw the original filesystem error unless documented otherwise.
 * Text is UTF-8. Callers own naming, line endings and application state.
 */

import * as FS from 'node:fs';
import * as PATH from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import process from 'node:process';

export const joinPath           = (...parts) => PATH.join(...parts);
export const baseName           = (path, suffix) => PATH.basename(path, suffix);
export const dirName            = path => PATH.dirname(path);
export const extension          = path => PATH.extname(path);
export const pathSeparator      = PATH.sep;
export const moduleDirectory    = url => PATH.dirname(fileURLToPath(url));
export const toFileURL          = path => pathToFileURL(path).href;
export const temporaryDirectory = () => tmpdir();

// Preserve the URL spelling used by the existing program runner.
export const executionFileURL = path => 'file:///' + path.replace(/\\/g, '/');

export const exists          = path => FS.existsSync(path);
export const isDirectory     = path => FS.statSync(path).isDirectory();
export const isFile          = path => FS.statSync(path).isFile();
// Preserve the existing owner-write-bit check, rather than changing permissions policy.
export const isWritable      = path => (FS.statSync(path).mode & 0x0080) !== 0;
export const listDirectory   = path => FS.readdirSync(path);
export const createDirectory = path => FS.mkdirSync(path);
export const readText        = path => FS.readFileSync(path, 'utf-8');
export const writeText       = (path, text) => FS.writeFileSync(path, text);

// Preserve the open-file operation's existing undefined result on read failure.
export function readTextAsync(path) {
	return new Promise(resolve => {
		FS.readFile(path, 'utf-8', (_error, contents) => resolve(contents));
	});
}

export function writeTextAsync(path, text) {
	return new Promise((resolve, reject) => {
		FS.writeFile(path, text, error => error ? reject(error) : resolve());
	});
}

export function readTextOrNull(path) {
	try {
		return readText(path);
	} catch {
		return null;
	}
}

export function hideDirectory(path) {
	if (process.platform === 'win32') {
		spawn('attrib', ['+H', path], { windowsHide: true });
	}
}

export function copyTextFile(from, to) {
	let cont;
	try {
		cont = FS.readFileSync(from, 'utf-8');
	} catch (e) {
		console.error(e);
		return false;
	}
	try {
		FS.writeFileSync(to, cont);
	} catch (e) {
		if (e.code === 'ENOENT') {
			makeParentDirectory(to);
			try {
				FS.writeFileSync(to, cont);
				return true;
			} catch (e1) {
				console.error(e1);
				return false;
			}
		}
		console.error(e);
		return false;
	}
	return true;
}

function makeParentDirectory(dirPath) {
	const nd = PATH.dirname(dirPath);
	try {
		FS.mkdirSync(nd);
	} catch (e) {
		if (e.code === 'ENOENT') {
			makeParentDirectory(nd);
			try {
				FS.mkdirSync(nd);
				return true;
			} catch(e1) {
				console.error(e1);
				return false;
			}
		}
		console.error(e);
		return false;
	}
	return true;
}

export function removeDirectoryTree(dirPath) {
	if (!FS.existsSync(dirPath)) return;
	for (let fp of FS.readdirSync(dirPath)) {
		fp = PATH.join(dirPath, fp);
		if (FS.lstatSync(fp).isDirectory()) {
			removeDirectoryTree(fp);
		} else {
			FS.unlinkSync(fp);
		}
	}
	FS.rmdirSync(dirPath);
}
