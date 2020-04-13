/**
 *
 * ErrorTranslator
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2020-04-13
 *
 */


'use strict';


class ErrorTranslator {

	constructor(lang) {
		this._lang = lang;
	}

	translate(msg) {
		if (this._lang === 'ja') return this.translateJa(msg);
		if (this._lang === 'en') return this.translateEn(msg);
		return msg;
	}

	translateJa(msg) {
		if (msg.startsWith('Uncaught ReferenceError')) {
			const m = msg.substr(msg.indexOf(': ') + 2);
			const t = m.replace(' is not defined', '');
			return '「' + t + '」は定義されていません。打ち間違えていませんか？<div>（参照エラー）' + msg + '</div>';
		}
		if (msg.startsWith('Uncaught RangeError')) {
			let m = msg.substr(msg.indexOf(': ') + 2);
			if (m.startsWith('Maximum call stack size exceeded')) {
				m = '関数呼び出しが深くなりすぎています。再帰呼び出しの部分を間違えていませんか？';
			}
			return m + '<div>（範囲エラー）' + msg + '</div>';
		}
		if (msg.startsWith('Uncaught SyntaxError')) {
			let m = msg.substr(msg.indexOf(': ') + 2);
			if (m.startsWith('Unexpected token')) {
				const t = m.replace(/.*'(.*)'.*/, (m, s1) => s1);
				m = '「' + t + '」を何かと打ち間違えているか、何かが抜けていませんか？';
			} else if (m.startsWith('Unexpected identifier')) {
				m = '打ち間違えているか、何かが抜けていませんか？';
			} else if (m.startsWith('Unexpected string')) {
				m = '打ち間違えているか、何かが抜けていませんか？';
			} else if (m.startsWith('Invalid or unexpected token')) {
				m = '打ち間違えているか、何かが抜けていませんか？';
			} else if (m.startsWith('missing ) after argument list')) {
				m = '引数の最後の閉じカッコ ) が抜けていませんか？';
			} else if (m.startsWith('Unexpected token )')) {
				m = '閉じカッコ ）が多いか、直前に何かが抜けていませんか？';
			} else if (m.startsWith('Unexpected token }')) {
				m = '閉じ中カッコ } が多いか、それより上の方で { が抜けていませんか？';
			} else if (m.startsWith('Unexpected token ]')) {
				m = '閉じ大カッコ ] が多いか、何かが抜けていませんか？';
			} else if (m.startsWith('Unexpected token ;')) {
				m = '何かとセミコロン ; を間違えていませんか？';
			} else if (m === 'Unexpected number') {
				m = '数字がここにあるのはおかしいです。直前を打ち間違えていませんか？';
			} else if (m === 'Illegal return statement') {
				m = 'return文がここにあるのはおかしいです。';
			} else if (m === 'Missing initializer in const declaration') {
				m = '定数の宣言に値がありません。';
			} else if (m.startsWith('Identifier \'') && m.endsWith('\' has already been declared')) {
				const t = m.replace('Identifier \'', '').replace('\' has already been declared', '');
				m = 'すでに付けられている名前「' + t + '」をもう一度使おうとしています。';
			}
			return m + '<div>（文法エラー）' + msg + '</div>';
		}
		if (msg.startsWith('Uncaught TypeError')) {
			let m = msg.substr(msg.indexOf(': ') + 2);
			if (m.endsWith('is not a function')) {
				const t = m.replace(' is not a function', '');
				m = '関数ではない「' + t + '」を呼び出そうとしています。打ち間違えていませんか？';
			} else if (m.endsWith('is not a constructor')) {
				const t = m.replace(' is not a constructor', '');
				m = 'コンストラクタではない「' + t + '」を、「new」を付けて呼び出そうとしています。打ち間違えていませんか？';
			} else if (m.startsWith('Cannot read property ') && (m.endsWith(' of undefined') || m.endsWith(' of null'))) {
				const t = m.replace(/.*'(.*)'.*/, (m, s1) => s1);
				m = '何もセットされていない変数の、プロパティ「' + t + '」を使おうとしています。直前を打ち間違えていませんか？';
			} else if (m.startsWith('Cannot set property ') && (m.endsWith(' of undefined') || m.endsWith(' of null'))) {
				const t = m.replace(/.*'(.*)'.*/, (m, s1) => s1);
				m = '何もセットされていない変数の、プロパティ「' + t + '」にセットしようとしています。直前を打ち間違えていませんか？';
			} else if (m.startsWith('Assignment to constant variable.')) {
				m = '定数に値をもう一度セットしようとしています。一度セットされた定数を変えることはできません。';
			}
			return m + '<div>（型エラー）' + msg + '</div>';
		}
		if (msg.startsWith('Uncaught Error')) {
			let m = 'エラー: ' + msg.substr(msg.indexOf(': ') + 2);
			return m + '<div>（エラー）' + msg + '</div>';
		}
		return msg.replace('Uncaught ', '') + '<div>（エラー）' + msg + '</div>';
	}

	translateEn(msg) {
		return msg.replace('Uncaught ', '');
	}

}
