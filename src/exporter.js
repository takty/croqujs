/*
 * Exporter
 * 2016-08-19
 */

'use strict';

const fs = require('fs'), path = require('path');

const HTML_HEAD1 = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>%TITLE%</title>';
const HTML_HEAD2 = '</head><body><script>';
const HTML_FOOT = '</script></body>';
const EXP_LIB_DIR = 'exp_lib';
const EXP_EOL = '\r\n';

class Exporter {

	constructor() {
	}

	readLibrarySources(codeStr, filePath) {
		const bp = (filePath) ? path.dirname(filePath) : null;
		const ps = this._extractImportPaths(codeStr.split('\n'));
		const libs = [];

		for (let i = 0; i < ps.length; i += 1) {
			const p = ps[i];
			if (p.indexOf('http') === 0) {
				libs.push({desc: p});
			} else {
				let cont = null;
				if (bp) cont = this._readFile(path.join(bp, p));
				if (cont === null) cont = this._readFile(path.join(__dirname, EXP_LIB_DIR, p));
				if (cont === null) return p;  // Error
				libs.push({desc: p, source: cont});
			}
		}
		return libs;
	}

	exportAsLibrary(codeText, filePath, nameSpace) {
		const acorn = require('./lib/acorn/acorn.js');
		acorn.walk = require('./lib/acorn/walk.js');

		const fns = [], ast = acorn.parse(codeText, {locations: true});
		const FE = 'FunctionExpression', AFE = 'ArrowFunctionExpression', CE = 'ClassExpression';

		acorn.walk.recursive(ast, {}, {
			ClassDeclaration: (node, state, c) => {
				fns.push(node.id.name);
			},
			VariableDeclaration: (node, state, c) => {  // var f = function () {...};
				node.declarations.forEach((d) => {
					if (d.init !== null && (d.init.type === FE || d.init.type === AFE || d.init.type === CE)) fns.push(d.id.name);
				});
			},
			FunctionDeclaration: (node, state, c) => {  // function f () {...}
				fns.push(node.id.name);
			},
			AssignmentExpression: (node, state, c) => {  // f = function () {...};
				const left = node.left, right = node.right;
				if (left.type === 'Identifier' && (right.type === FE || right.type === AFE || right.type === CE)) fns.push(left.name);
			}
		});
		const fnsStr = fns.map(e => (e + ': ' + e)).join(', ');

		const header = 'var ' + nameSpace + ' = (function () {';
		const footer = ['\treturn {' + fnsStr + '};', '}());'].join(EXP_EOL);
		const srcStr = codeText.split('\n').map(l => ('\t' + l)).join(EXP_EOL);

		fs.writeFileSync(filePath, [header, srcStr, footer].join(EXP_EOL));
	}

	exportAsWebPage(codeText, filePath, dirPath) {
		const lines = codeText.split('\n');
		const res = this._extractImportPaths(lines), libs = [];
		const pushTag = (src) => {libs.push('<script src="' + src + '"></script>');};
		let title = 'Croqujs';

		if (filePath) {
			const bp = path.dirname(filePath);
			res.forEach((p) => {
				if (p.indexOf('http') !== 0) {
					const ret = this._copyFile(path.join(bp, p), path.join(dirPath, p));
					if (!ret) this._copyFile(path.join(__dirname, EXP_LIB_DIR, p), path.join(dirPath, p));
				}
				pushTag(p);
			});
			title = path.basename(filePath, '.js');
			title = title.charAt(0).toUpperCase() + title.slice(1);
		} else {
			res.forEach((p) => {
				if (p.indexOf('http') !== 0) {
					this._copyFile(path.join(__dirname, EXP_LIB_DIR, p), path.join(dirPath, p));
				}
				pushTag(p);
			});
		}
		const head = HTML_HEAD1.replace('%TITLE%', title);
		fs.writeFileSync(path.join(dirPath, 'index.html'), [head, libs.join(''), HTML_HEAD2, lines.join(EXP_EOL), HTML_FOOT].join(EXP_EOL));
	}

	_extractImportPaths(lines) {
		const res = [];

		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i].trim();
			const ss = line.indexOf('//');
			if (ss === -1) continue;
			const is = line.indexOf('@import', ss + 2);
			if (is === -1) continue;
			let tmp = line.substr(is + 7).trim();
			if (tmp[tmp.length - 1] === ';') {
				tmp = tmp.substr(0, tmp.length - 1).trim();
			}
			this._splitSpaceSeparatedLine(tmp).forEach((item) => {
				if (item[0] === "'" && item[item.length - 1] === "'") {
					item = item.substr(1, item.length - 2);
				} else if (item[0] === '"' && item[item.length - 1] === '"') {
					item = item.substr(1, item.length - 2);
				}
				if (item.indexOf('.js') === -1) item += '.js';
				res.push(item);
			});
		}
		return res;
	}

	_splitSpaceSeparatedLine(line) {
		let ret = [], cur = '', inQt = '';
		for (let i = 0; i < line.length; i += 1) {
			const ch = line[i];
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

	_copyFile(from, to) {
		let cont;
		try {
			cont = fs.readFileSync(from, 'utf-8');
		} catch (e) {
			return false;
		}
		try {
			fs.writeFileSync(to, cont);
		} catch (e) {
			if (e.code === 'ENOENT') {
				this._makeParentDir(to);
				try {
					fs.writeFileSync(to, cont);
					return true;
				} catch (e1) {
				}
			}
			return false;
		}
		return true;
	}

	_makeParentDir(dirPath) {
		const nd = path.dirname(dirPath);
		try {
			fs.mkdirSync(nd);
			return true;
		} catch (e) {
			if (e.code === 'ENOENT') {
				this._makeParentDir(nd);
				try {
					fs.mkdirSync(nd);
					return true;
				} catch(e1) {
				}
			}
		}
		return false;
	}

	_readFile(filePath) {
		try {
			return fs.readFileSync(filePath, 'utf-8');
		} catch (e) {
			return null;
		}
	}

}

module.exports = Exporter;
