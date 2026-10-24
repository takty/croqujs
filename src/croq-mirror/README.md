# croq-mirror

Croqujsから切り出したCodeMirror 5ベースのエディタコンポーネントです。
合意仕様は [spec.md](./spec.md) を参照してください。既存Croqujsへの接続はまだ行っていません。

## サンプル

croqujsリポジトリのルートで実行します。

```sh
node src/croq-mirror/serve.mjs
```

`http://127.0.0.1:4178/` に日本語・英語の2個のエディタを表示します。
ボタン類は利用側のサンプルであり、コンポーネントには含まれません。
`dist/` は生成済みです。そのディレクトリ全体をHTTP／HTTPSで配信すれば、利用側でのビルドは不要です。
Workerとモジュールのため、基本的に利用ページと同一オリジンで配信してください。
CSSを利用側で読み込んでください。CSPを指定する場合はモジュール・Worker・フォント・ライブラリが設定するインラインスタイルを許可する構成が必要です。

```html
<link rel="stylesheet" href="./dist/croq-mirror.css">
<div id="editor" style="height: 480px"></div>
<script type="module">
import { createEditor } from './dist/index.js';
const editor = await createEditor(document.querySelector('#editor'), {
    value: 'function greet() { console.log("Hello"); }',
    language: 'ja',
});
const unsubscribe = editor.on('change', event => {
    if (event.origin === 'edit') console.log('modified', event.version);
});
const snapshot = await editor.analyzeNow();
// snapshot.text と snapshot.fnNames は必ず同じ版を表します。
console.log(snapshot.version, snapshot.success, snapshot.fnNames);
// 終了時: unsubscribe(); editor.destroy();
</script>
```

## 公開API

生成先は現在のdocument内にある、空のコンテナ要素を指定します。
同一コンテナへの二重生成はエラーになります。
初期化失敗時はPromiseをrejectし、生成済みのリソースとDOMを片付けます。

| API | 内容 |
| --- | --- |
| `await createEditor(container, options)` | Workerの準備と、有効な場合は初回解析を完了して返す |
| `getValue()` | 本文取得 |
| `loadDocument(text)` | 本文設定、履歴・カーソル・解析結果・強調のリセット |
| `replaceDocument(text)` | Undo対象として全文を置換 |
| `replaceRange(text, from, to = from)` | Undo対象として範囲を置換 |
| `getSelection()` / `replaceSelection(text)` | 選択テキストの取得／Undo対象の置換 |
| `getSettings()` / `setSettings(patch)` | 設定取得／部分変更 |
| `getState()` | `version`, `readOnly`, `disabled`, `canUndo`, `canRedo` |
| `execute(command)` | 下記コマンドを実行 |
| `setDefinitions(definitions)` | 標準定義を維持し、追加Tern定義の配列を置換。空配列で追加分を削除 |
| `getAnalysis()` | 現在の版の解析済みスナップショット、または `null` |
| `await analyzeNow()` | 呼び出し時点の本文・版に対する解析結果を取得 |
| `on(type, listener)` | イベント購読。戻り値は購読解除関数 |
| `moveTo({line, ch}, {focus = true})` | 移動・スクロール・任意のフォーカス |
| `highlightLine(line)` | 行を強調し、解除用IDを返す |
| `clearHighlight(id)` | 指定した強調を解除 |
| `getFunctionLineNumber(line)` | `[関数番号, 関数内行番号]`。解析未完了時は `[0, line + 1]` |
| `getCodeMirror()` | CodeMirror 5インスタンス。直接操作は将来の互換性対象外 |
| `refresh()` | 非表示から表示した場合などに再描画 |
| `destroy()` | リソース解放・DOM除去。複数回呼び出し可能 |

コマンド: `undo`, `redo`, `selectAll`, `toggleComment`, `format`, `find`, `findNext`, `replace`, `complete`。
`format` は現在行または選択行を整形します。全文整形専用コマンドではありません。

通常の位置APIは **0始まりの行・UTF-16列**を `{line, ch}` で指定し、置換範囲の終端は含みません。
`highlightLine` の行番号も0始まりです。強調は文書変更時に自動解除します。
利用側からの文書APIは読み取り専用・操作無効時も使用できます。これらの状態はユーザー操作を制限します。
`execute` による編集コマンドは読み取り専用時に動作せず、操作無効時は全コマンドと `moveTo` が動作しません。
破棄後の操作はエラーになります。取得済みのCodeMirrorインスタンスも破棄後は使用しないでください。

### 設定

生成時には以下に加えて `value` と `definitions` を指定できます。
生成後の追加定義変更には `setDefinitions` を使用します。

| 設定 | 初期値 | 内容 |
| --- | --- | --- |
| `language` | `'ja'` | `'ja'` または `'en'` |
| `fontFamily` | 同梱フォントと日本語フォントの組み合わせ | CSSのfont-family値 |
| `fontSize` | `16` | 10～64px |
| `lineHeight` | `165` | 正の数、% |
| `lineWrapping` | `false` | 折り返し |
| `functionLineNumbers` | `false` | 関数別行番号。解析無効時は通常行番号 |
| `rulers` | `true` | インデント位置のガイド |
| `autoIndent` | `true` | 整形時のインデント補正 |
| `autoFormat` | `true` | 行編集・移動に伴う自動整形 |
| `formatting` | `true` | 整形全体の有効化。falseなら明示的な整形も無効 |
| `completion` | `true` | 補完・引数ヒント |
| `diagnostics` | `true` | 静的診断 |
| `analysis` | `true` | 自動構造解析と表示 |
| `analysisDelay` | `600` | 自動解析の待ち時間、0以上のミリ秒 |
| `readOnly` | `false` | 編集禁止、選択・コピー・検索は可能 |
| `disabled` | `false` | ユーザー操作停止。解除時にreadOnly設定を維持 |

未定義の設定名・型・範囲はエラーです。設定の永続化は行いません。
IME変換中は独自の自動整形を停止します。ネイティブIMEでの実操作は別途検証が必要です。
補完の明示的な起動はCtrl-Tab、Ctrl-\\、または `execute('complete')` です。

### イベント

| イベント | データ |
| --- | --- |
| `change` | `{origin: 'load' または 'edit', version, text, source?}` |
| `state` | `getState()` と同じ |
| `settings` | 設定のスナップショット |
| `selection` | `{ranges: [{anchor, head}, ...]}` |
| `analysis` | 下記解析結果 |
| `focus`, `blur` | 空オブジェクト |
| `error` | `{message}`。自動解析の失敗など |

イベントと解析結果はコピーを渡します。購読側の変更は内部状態に反映されません。
明示的な解析要求の失敗はPromiseのrejectで通知します。

### 解析結果

```js
{
  version, text, success,
  fnLocs, fnStarts, ifLocs, forLocs, fnNames,
  varLocs, letLocs, constLocs
}
```

既存解析器の形式を維持しています。**解析結果の範囲だけは行が1始まり、列が0始まりの `{line, column}`**です。
範囲は `[開始, 終端]` で終端を含みません。`ifLocs` は追加要素としてelse節の開始位置を含みます。
`fnStarts` は0始まりの関数番号区切り行です。`fnNames` は既存解析器が収集する関数・クラス等の名前です。
これはモジュールのexport一覧やスコープ解析済みの公開シンボル一覧ではありません。
`forLocs` の対象は既存と同じ `ForStatement` です。

通常のAcorn解析が成功した場合は `success:true`、acorn-looseによる補完的な解析は `false` です。
`success` はJSHintの診断結果とは別です。ASTは公開しません。
解析は既存と同じscriptとして行い、ES Modules形式のソース解析への拡張は今回含めていません。

編集直後は `getAnalysis()` が `null` になります。古い版のWorker応答は表示・更新通知に適用しません。
`analyzeNow()` は呼び出し時の版を返すため、待機中に編集が進んだ場合でも、返る本文と解析結果は一致します。
エクスポート時は、解析後に `getValue()` を取り直すのではなく、戻り値の `text` を使用してください。
自動解析が無効でも明示的な `analyzeNow()` は使用可能ですが、表示・保持結果・更新通知には適用しません。

## ソースとビルド

`lib/` が部品ソース、`styles/` がテーマ、`assets/` が既存Croqujsから引き継いだ資産、`dist/` が配布物です。
`build.mjs` は依存パッケージのブラウザビルドをES Modules内に閉じ込め、windowへグローバルを追加しません。
日本語・英語のJSHintは別の関数として保持します。CodeMirrorのCSSとテーマは部品のルート配下に限定します。
補完・診断のポップアップも部品内に配置します。Ternのツールチップは位置計算を合わせるためビルド時に調整しています。

```sh
node src/croq-mirror/build.mjs
node --test src/croq-mirror/test/analysis.test.mjs
node src/croq-mirror/test/headless.mjs
```

依存パッケージは、このリポジトリにインストール済みのものを使用してビルドできます。
将来ディレクトリを独立させる場合の依存一覧は、このディレクトリの `package.json` に記載しています。
ビルドは本ディレクトリの `dist/` だけを更新します。上位のビルド設定は変更していません。
元コードのライセンスは `LICENSE`、同梱ライブラリのライセンスは `dist/licenses/` にあります。
フォント・カーソルは元リポジトリの資産を引き継いでおり、第三者配布に向けた資産ごとの権利確認は別途必要です。

## 検証範囲

`test/browser.html` はブラウザ単体での契約テストです。結果は `test/chrome-result.json` と `test/edge-result.json` に記録します。
ヘッドレス検証は既定でChromeを使用します。第1引数でEdge等のChromium系ブラウザ実行ファイルを指定できます。
Firefox・Safariへの対応は要件ですが、この環境では未検証です。
実際の日本語IME入力、OSクリップボード、マウスによる行選択、スクリーンリーダー、既存版との外観の厳密比較は未検証です。
既存Croqujsへの接続・Electron上での検証も次の段階です。
