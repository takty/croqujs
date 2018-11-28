/**
 *
 * Exporter
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-11-28
 *
 */


'use strict';

const FS   = require('fs');
const PATH = require('path');

global.acorn      = require('./renderer_study/lib/acorn/acorn.js');
global.acorn.walk = require('./renderer_study/lib/acorn/walk.js');
const analyze     = require('./renderer_study/analyzer.js');

const HTML_HEAD1  = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>%TITLE%</title>';
const HTML_HEAD2  = '</head><body><script>';
const HTML_FOOT   = '</script></body>';
const EXP_LIB_DIR = 'exp_lib';
const INJECTION   = 'injection.js';
const EXP_EOL     = '\r\n';


class Exporter {

	constructor() {
		this._userCodeOffset = 0;
	}

	checkLibraryReadable(codeStr, filePath) {
		const bp = (filePath) ? PATH.dirname(filePath) : null;
		const decs = this._extractUseDeclarations(codeStr.split('\n'));

		for (let dec of decs) {
			const p = Array.isArray(dec) ? dec[0] : dec;
			if (p.indexOf('http') === 0) {
				libs.push({ desc: p });
			} else {
				let cont = null;
				if (bp) cont = this._readFile(PATH.join(bp, p));
				if (cont === null) cont = this._readFile(PATH.join(__dirname, EXP_LIB_DIR, p));
				if (cont === null) return p;  // Error
			}
		}
		return true;
	}

	exportAsLibrary(codeText, filePath, nameSpace, codeStructure) {
		const fns = codeStructure.fnNames;
		const fnsStr = fns.map(e => (e + ': ' + e)).join(', ');

		const header = 'var ' + nameSpace + ' = (function () {';
		const footer = ['\treturn {' + fnsStr + '};', '}());'].join(EXP_EOL);
		const srcStr = codeText.split('\n').map(l => ('\t' + l)).join(EXP_EOL);

		FS.writeFileSync(filePath, [header, srcStr, footer].join(EXP_EOL));
		return FS.existsSync(filePath);
	}

	exportAsWebPage(codeText, filePath, dirPath, injection = false) {
		const lines = codeText.split('\n');
		const decs = this._extractUseDeclarations(lines), libs = [];
		const pushTag = (src) => { libs.push('<script src="' + src + '"></script>'); };
		let title = 'Croqujs';

		if (injection) {
			this._copyFile(PATH.join(__dirname, INJECTION), PATH.join(dirPath, INJECTION));
			pushTag(INJECTION);
		}
		if (filePath) {
			const bp = PATH.dirname(filePath);
			for (let dec of decs) {
				if (Array.isArray(dec)) {
					const p = dec[0];
					if (p.startsWith('http')) return [false, p];
					const res = this._createLibraryImmediately(PATH.join(bp, p), dec[1], PATH.join(dirPath, p));
					if (!res) return [false, p];
					pushTag(p);
				} else {
					const p = dec;
					if (!p.startsWith('http')) {
						let res = this._copyFile(PATH.join(bp, p), PATH.join(dirPath, p));
						if (!res) res = this._copyFile(PATH.join(__dirname, EXP_LIB_DIR, p), PATH.join(dirPath, p));
						if (!res) return [false, p];
					}
					pushTag(p);
				}
			}
			title = PATH.basename(filePath, '.js');
			title = title.charAt(0).toUpperCase() + title.slice(1);
		} else {
			for (let dec of decs) {
				const p = Array.isArray(dec) ? dec[0] : dec;
				if (!p.startsWith('http')) {
					const res = this._copyFile(PATH.join(__dirname, EXP_LIB_DIR, p), PATH.join(dirPath, p));
					if (!res) return [false, p];
				}
				pushTag(p);
			}
		}
		const head = HTML_HEAD1.replace('%TITLE%', title);
		const expPath = PATH.join(dirPath, 'index.html');
		const libTagStr = libs.join('');
		this._userCodeOffset = HTML_HEAD1.length + libTagStr.length + HTML_HEAD2.length;

		FS.writeFileSync(expPath, [head, libTagStr, HTML_HEAD2, lines.join(EXP_EOL), HTML_FOOT].join(''));
		return [true, expPath];
	}


	// -------------------------------------------------------------------------


	_extractUseDeclarations(lines) {
		const USE = '@use', NEED = '@need', IMPORT = '@import', AS = 'as', EXT = '.js';
		const res = [];

		for (let line of lines) {
			const ret = this._isSpecialComment(line);
			if (ret === false) continue;
			const [type, params] = ret;
			const items = this._splitSpaceSeparatedLine(params).map(this._unwrapQuote);

			if (type === NEED || type === IMPORT) {
				for (let item of items) {
					if (item.indexOf(EXT) === -1) item += EXT;
					res.push(item);
				}
			} else if (type === USE) {
				let last = null;
				for (let i = 0; i < items.length; i += 1) {
					let item = items[i];
					if (item === AS) {
						if (last !== null && i + 1 < items.length) {
							last[1] = items[i + 1];
							i += 1;
						}
					} else {
						if (!item.endsWith(EXT)) item += EXT;
						last = [item, ''];
						res.push(last);
					}
				}
				for (let r of res) {
					if (r[1] === '') r[1] = this._pathToLibName(r[0]);
				}
			}
		}
		return res;
	}

	_isSpecialComment(line) {
		const COMMENT = '//', SP_CHAR = '@';

		line = line.trim();
		if (!line.startsWith(COMMENT)) return false;
		line = line.substr(COMMENT.length).trim();

		if (line[0] !== SP_CHAR) return false;
		const pos = line.search(/\s/);
		if (pos === -1) return false;

		const type = line.substr(0, pos);
		line = line.substr(pos).trim();
		if (line[line.length - 1] === ';') {
			line = line.substr(0, line.length - 1).trim();
		}
		return [type, line];
	}

	_splitSpaceSeparatedLine(line) {
		let ret = [], cur = '', inQt = '';
		for (let ch of line) {
			if (inQt === '') {
				if (ch === '"' || ch === "'") {
					inQt = ch;
				} else if (ch === ' ') {
					if (cur.length > 0) {
						ret.push(cur);
						cur = '';
					}
				} else {
					cur = cur + ch;
				}
			} else if (inQt === '"' || inQt === "'") {
				if (ch === inQt) {
					inQt = '';
				} else {
					cur = cur + ch;
				}
			}
		}
		if (inQt === '' && cur.length > 0) ret.push(cur);
		return ret;
	}

	_unwrapQuote(str) {
		if (str[0] === "'" && str[str.length - 1] === "'") {
			return str.substr(1, str.length - 2);
		}
		if (str[0] === '"' && str[str.length - 1] === '"') {
			return str.substr(1, str.length - 2);
		}
		return str;
	}

	_pathToLibName(path) {
		path = path.replace('/', '\\');
		let val = path;
		const ps = path.split('\\');
		for (let i = ps.length - 1; 0 <= i; i -= 1) {
			const pst = ps[i].trim();
			if (pst === '') continue;
			const pos = pst.indexOf('.');
			val = pst.substr(0, pos).toUpperCase();
		}
		return val.replace(/[ -+\\.]/, '_');
	}


	// -------------------------------------------------------------------------


	_createLibraryImmediately(origPath, nameSpace, destPath) {
		const cont = this._readFile(origPath);
		if (cont === null) return false;

		const cs = analyze(cont);
		return this.exportAsLibrary(cont, destPath, nameSpace, cs);
	}


	// -------------------------------------------------------------------------


	_copyFile(from, to) {
		let cont;
		try {
			cont = FS.readFileSync(from, 'utf-8');
		} catch (e) {
			return false;
		}
		try {
			FS.writeFileSync(to, cont);
		} catch (e) {
			if (e.code === 'ENOENT') {
				this._makeParentDir(to);
				try {
					FS.writeFileSync(to, cont);
					return true;
				} catch (e1) {}
			}
			return false;
		}
		return true;
	}

	_makeParentDir(dirPath) {
		const nd = PATH.dirname(dirPath);
		try {
			FS.mkdirSync(nd);
			return true;
		} catch (e) {
			if (e.code === 'ENOENT') {
				this._makeParentDir(nd);
				try {
					FS.mkdirSync(nd);
					return true;
				} catch(e1) {}
			}
		}
		return false;
	}

	_readFile(filePath) {
		try {
			return FS.readFileSync(filePath, 'utf-8');
		} catch (e) {
			return null;
		}
	}

}

module.exports = Exporter;
