/**
 *
 * Error Translator
 *
 * @author Takuto Yanagida
 * @version 2021-02-25
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
				m = '「' + t + '」が何かが分かりません。<b>間違えて入力していませんか？</b>';
			} else if (m.startsWith('Cannot access \'') && m.endsWith('\' before initialization')) {
				const t = m.replace('Cannot access \'', '').replace('\' before initialization', '');
				m = '値がセットされていないので、変数／定数「' + t + '」は使えません。<b>入力する場所を間違えていませんか？</b>';
			} else if (m === 'Invalid left-hand side in assignment') {
				m = '記号 = の左側や周りが正しくありません。<b>間違えて入力していませんか？</b>';
			}
			return '<span>参照エラー</span>' + m + '<div>' + msg + '</div>';
		}
		if (msg.startsWith('Uncaught RangeError')) {
			let m = msg.substr(msg.indexOf(': ') + 2);
			if (m === 'Maximum call stack size exceeded') {
				m = '関数呼び出しが深くなり過ぎました。<b>再帰呼び出しの部分を間違えていませんか？</b>';
			} else if (m === 'Invalid count value') {
				m = '回数が正しくありません。<b>回数が負になっていたり、無限大になっていたりしませんか？</b>';
			} else if (m === 'Invalid string length') {
				m = '文字列の長さが正しくありません。<b>長さが負になっていたり、とても大きな数になっていたりしませんか？</b>';
			} else if (m === 'Invalid array length') {
				m = '配列の長さが正しくありません。<b>長さが負になっていたり、とても大きな数になっていたりしませんか？</b>';
			} else if (m === 'Invalid array buffer length') {
				m = '配列バッファの長さが正しくありません。<b>サイズが負になっていたり、とても大きな数になっていたりしませんか？</b>';
			} else if (m === 'Array buffer allocation failed') {
				m = '配列バッファを作ることが出来ません。<b>サイズがとても大きな数になっていませんか？</b>';
			} else if (m === 'Invalid time value') {
				m = '日付の書き方が正しくありません。<b>間違えて入力していませんか？</b>';
			} else if (m === 'toString() radix argument must be between 2 and 36') {
				m = 'toString()関数の基数は2～36の範囲でなくてはなりません。<b>間違えて入力していませんか？</b>';
			} else if (m.startsWith('Invalid code point')) {
				m = 'コードポイントが正しくありません。<b>間違えて入力していませんか？</b>';
			} else if (m.endsWith('argument must be between 0 and 100')) {
				m = '精度は0～100の範囲でなくてはなりません。<b>間違えて入力していませんか？</b>';
			}
			return '<span>範囲エラー</span>' + m + '<div>' + msg + '</div>';
		}
		if (msg.startsWith('Uncaught TypeError')) {
			let m = msg.substr(msg.indexOf(': ') + 2);
			if (m.endsWith('is not a function')) {
				const t = m.replace(' is not a function', '');
				m = '「' + t + '」は関数ではないので、呼び出せません。<b>間違えて入力していませんか？</b>';
			} else if (m.endsWith('is not a constructor')) {
				const t = m.replace(' is not a constructor', '');
				m = '「' + t + '」はコンストラクターではないので、「new」を付けて呼び出せません。<b>間違えて入力していませんか？</b>';
			} else if (m.startsWith('Class constructor ') && m.endsWith(" cannot be invoked without 'new'")) {
				const t = m.replace('Class constructor ', '').replace(" cannot be invoked without 'new'", '');
				m = '「' + t + '」はコンストラクターなのに、「new」がありません。<b>「new」を忘れたり、間違えて入力したりしていませんか？</b>';
			} else if (m.endsWith('is not a function or its return value is not iterable')) {
				const t = m.replace(' is not a function or its return value is not iterable', '');
				m = '「' + t + '」は関数ではないか、戻り値が配列のような繰り返せるものではないので、for文では使えません。<b>間違えて入力していませんか？</b>';
			} else if (m.endsWith('is not iterable')) {
				const t = m.replace(' is not iterable', '');
				m = '「' + t + '」は配列のような繰り返せるものではないので、for文では使えません。<b>間違えて入力していませんか？</b>';
			} else if (m.startsWith('Cannot read property ') && (m.endsWith(' of undefined') || m.endsWith(' of null'))) {
				const t = m.replace(/.*'(.*)'.*/, (m, s1) => s1);
				m = '変数が空なので、プロパティ「' + t + '」は使えません。<b>直前を間違えて入力していませんか？</b>';
			} else if (m.startsWith('Cannot set property ') && (m.endsWith(' of undefined') || m.endsWith(' of null'))) {
				const t = m.replace(/.*'(.*)'.*/, (m, s1) => s1);
				m = '変数が空なので、プロパティ「' + t + '」は使えません。<b>直前を間違えて入力していませんか？</b>';
			} else if (m.startsWith('Assignment to constant variable.')) {
				m = '定数なので、値をもう一度セットすることはできません。<b>間違えて入力していませんか？</b>';
			} else if (m.startsWith('Cannot create property \'') && m.includes('\' on ') && m.endsWith('\'')) {
				const m2 = m.replace('Cannot create property \'', '').replace(/'$/, '');
				let type = '', ts;
				if (m2.includes(' on boolean ')) {
					type = 'ブーリアン値';
					ts = m2.split('\' on boolean \'');
				} else if (m2.includes(' on string ')) {
					type = '文字列';
					ts = m2.split('\' on string \'');
				} else if (m2.includes(' on number ')) {
					type = '数値';
					ts = m2.split('\' on number \'');
				}
				m = type + '「' + ts[1] + '」に、プロパティ「' + ts[0] + '」を作ることはできません。<b>間違えて入力していませんか？</b>';
			}
			return '<span>型エラー</span>' + m + '<div>' + msg + '</div>';
		}
		if (msg.startsWith('Uncaught SyntaxError')) {
			let m = msg.substr(msg.indexOf(': ') + 2);
			if (m.startsWith('Unexpected token')) {
				const t = m.replace(/.*'(.*)'.*/, (m, s1) => s1);
				m = 'ここに「' + t + '」があるのはおかしいです。<b>間違えて入力していませんか？</b>';
			} else if (m.startsWith('Unexpected identifier')) {
				m = '<b>間違えて入力していませんか？</b>';
			} else if (m.startsWith('Invalid or unexpected token')) {
				m = '<b>間違えて入力していませんか？</b>';
			} else if (m.startsWith('missing ) after argument list')) {
				m = '関数の引数の最後に閉じカッコ ) がありません。<b>入力するのを間違えたり、忘れたりしていませんか？</b>';
			} else if (m.startsWith('Unexpected token )')) {
				m = 'ここに閉じカッコ ) があるのはおかしいです。<b>) が多かったり、その手前で開きカッコ ( が足りていなかったりしませんか？</b>';
			} else if (m.startsWith('Unexpected token }')) {
				m = 'ここに閉じ中カッコ } があるのはおかしいです。<b>} が多かったり、その手前で開き中カッコ { が足りていなかったりしませんか？</b>';
			} else if (m.startsWith('Unexpected token ]')) {
				m = 'ここに閉じ大カッコ ] があるのはおかしいです。<b>] が多かったり、その手前で開き大カッコ [ が足りていなかったりしませんか？</b>';
			} else if (m.startsWith('Unexpected token ;')) {
				m = 'ここにセミコロン ; があるのはおかしいです。<b>間違えて入力していませんか？</b>';
			} else if (m === 'Unexpected number') {
				m = 'ここに数値があるのはおかしいです。<b>間違えて入力していませんか？</b>';
			} else if (m === 'Unexpected string') {
				m = 'ここに文字列があるのはおかしいです。<b>間違えて入力していませんか？</b>';
			} else if (m === 'Invalid destructuring assignment target') {
				m = 'ここにオブジェクトがあるのはおかしいです。<b>間違えて入力していませんか？</b>';
			} else if (m === 'Invalid left-hand side in assignment') {
				m = '記号 = の左側や周りが正しくありません。<b>間違えて入力していませんか？</b>';
			} else if (m === 'Missing initializer in const declaration') {
				m = '定数なので、値をセットする必要があります。<b>入力するのを忘れていませんか？</b>';
			} else if (m === 'Function statements require a function name') {
				m = '関数を作るには、名前を付ける必要があります。<b>入力するのを忘れていませんか？</b>';
			} else if (m === 'Invalid shorthand property initializer') {
				m = 'オブジェクトの作り方（書き方）が正しくありません。<b>間違えて入力していませんか？</b>';
			} else if (m === 'for-of loop variable declaration may not have an initializer.') {
				m = 'for-of文の変数は初期化できません。<b>間違えて入力していませんか？</b>';
			} else if (m === 'Unexpected strict mode reserved word') {
				m = 'この名前はJavaScript自体で使われているので、使えません。<b>間違えて入力していませんか？</b>';
			} else if (m === 'Octal literals are not allowed in strict mode.') {
				m = '数値の始めに0があるのはおかしいです。<b>間違えて入力していませんか？</b>';
			} else if (m === 'Illegal return statement') {
				m = 'ここにreturn文を置くことはできません。<b>入力する場所を間違えていませんか？</b>';
			} else if (m === 'Unexpected end of input') {
				m = 'プログラムは途中なのに、ファイルが終わってしまいました。<b>中カッコ {} を入力するのを間違えたり、忘れたりしていませんか？</b>';
			} else if (m === 'await is only valid in async function') {
				m = 'awaitを付けた関数呼び出しは、async関数の中でしかできません。<b>functionの前にasyncを付け忘れていませんか？</b>';
			} else if (m.startsWith('Identifier \'') && m.endsWith('\' has already been declared')) {
				const t = m.replace('Identifier \'', '').replace('\' has already been declared', '');
				m = '名前「' + t + '」は既に別の場所で使われているので、同じ名前を付けることは出来ません。<b>間違えて入力していませんか？</b>';
			}
			return '<span>構文エラー</span>' + m + '<div>' + msg + '</div>';
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
