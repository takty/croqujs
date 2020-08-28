/**
 *
 * ErrorTranslator
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2020-08-28
 *
 */


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
			let m = msg.substr(msg.indexOf(': ') + 2);
			if (m.endsWith(' is not defined')) {
				const t = m.replace(' is not defined', '');
				m = '「' + t + '」が何か分かりません。打ち間違えていませんか？';
			} else if (m.startsWith('Cannot access \'') && m.endsWith('\' before initialization')) {
				const t = m.replace('Cannot access \'', '').replace('\' before initialization', '');
				m = '変数か定数「' + t + '」に値を一度もセットしていないのに、使おうとしています。打つ場所を間違えていませんか？';
			} else if (m === 'invalid assignment left-hand side') {
				m = '「=」の左側が正しくありません。打ち間違えていませんか？';
			}
			return '<span>参照エラー</span>' + m + '<div>' + msg + '</div>';
		}
		if (msg.startsWith('Uncaught RangeError')) {
			let m = msg.substr(msg.indexOf(': ') + 2);
			if (m === 'Maximum call stack size exceeded') {
				m = '関数呼び出しが深くなりすぎました。再帰呼び出しの部分を間違えていませんか？';
			} else if (m === 'Invalid count value') {
				m = '回数が正しくありません。';
			} else if (m === 'Invalid string length') {
				m = '文字列の長さが正しくありません。長すぎませんか？';
			} else if (m === 'Invalid array length') {
				m = '配列の長さが正しくありません。長すぎませんか？';
			} else if (m === 'Array buffer allocation failed') {
				m = '配列バッファを作ることが出来ません。サイズが大きすぎませんか？';
			}
			return '<span>範囲エラー</span>' + m + '<div>' + msg + '</div>';
		}
		if (msg.startsWith('Uncaught SyntaxError')) {
			let m = msg.substr(msg.indexOf(': ') + 2);
			if (m.startsWith('Unexpected token')) {
				const t = m.replace(/.*'(.*)'.*/, (m, s1) => s1);
				m = '「' + t + '」を何かと打ち間違えているか、近くの何かが抜けていませんか？';
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
				m = '数字がここにあるのは正しくありません。直前を打ち間違えていませんか？';
			} else if (m === 'Illegal return statement') {
				m = 'return文がここにあるのは正しくありません。';

			} else if (m === 'Missing initializer in const declaration') {
				m = '定数を作ろうとしているのに、何も値をセットしていません。';
			} else if (m === 'Function statements require a function name') {
				m = '関数を作ろうとしているのに、名前を付けていません。';
			} else if (m.startsWith('Identifier \'') && m.endsWith('\' has already been declared')) {
				const t = m.replace('Identifier \'', '').replace('\' has already been declared', '');
				m = '名前「' + t + '」はすでに付けられているのに、もう一度使おうとしています。';
			}
			return '<span>構文エラー</span>' + m + '<div>' + msg + '</div>';
		}
		if (msg.startsWith('Uncaught TypeError')) {
			let m = msg.substr(msg.indexOf(': ') + 2);
			if (m.endsWith('is not a function')) {
				const t = m.replace(' is not a function', '');
				m = '「' + t + '」は関数ではないのに、呼び出そうとしています。打ち間違えていませんか？';
			} else if (m.endsWith('is not a constructor')) {
				const t = m.replace(' is not a constructor', '');
				m = '「' + t + '」はコンストラクタではないのに、「new」を付けて呼び出そうとしています。打ち間違えていませんか？';
			} else if (m.startsWith('Cannot read property ') && (m.endsWith(' of undefined') || m.endsWith(' of null'))) {
				const t = m.replace(/.*'(.*)'.*/, (m, s1) => s1);
				m = '変数に何もセットされていないのに、プロパティ「' + t + '」を使おうとしています。直前を打ち間違えていませんか？';
			} else if (m.startsWith('Cannot set property ') && (m.endsWith(' of undefined') || m.endsWith(' of null'))) {
				const t = m.replace(/.*'(.*)'.*/, (m, s1) => s1);
				m = '変数に何もセットされていないのに、プロパティ「' + t + '」を使おうとしています。直前を打ち間違えていませんか？';
			} else if (m.startsWith('Assignment to constant variable.')) {
				m = '定数なのに、値をもう一度セットしようとしています。';
			}
			return '<span>型エラー</span>' + m + '<div>' + msg + '</div>';
		}
		if (msg.startsWith('Uncaught Error')) {
			const m = msg.substr(msg.indexOf(': ') + 2);
			return '<span>エラー</span>' + m + '<div>' + msg + '</div>';
		}
		return '<span>エラー</span>' + msg.replace('Uncaught ', '') + '<div>' + msg + '</div>';
	}

	translateEn(msg) {
		if (msg.startsWith('Uncaught ReferenceError')) {
			const m = msg.substr(msg.indexOf(': ') + 2);
			return '<span>ReferenceError</span>' + m;
		}
		if (msg.startsWith('Uncaught RangeError')) {
			const m = msg.substr(msg.indexOf(': ') + 2);
			return '<span>RangeError</span>' + m;
		}
		if (msg.startsWith('Uncaught SyntaxError')) {
			const m = msg.substr(msg.indexOf(': ') + 2);
			return '<span>SyntaxError</span>' + m;
		}
		if (msg.startsWith('Uncaught TypeError')) {
			const m = msg.substr(msg.indexOf(': ') + 2);
			return '<span>TypeError</span>' + m;
		}
		if (msg.startsWith('Uncaught Error')) {
			const m = msg.substr(msg.indexOf(': ') + 2);
			return '<span>Error</span>' + m;
		}
		return '<span>Error</span>' + msg.replace('Uncaught ', '');
	}

}
