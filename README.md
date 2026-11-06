# Croqujs

The Playground for JavaScript

```console
yarn install
yarn dev
```

## Electron build

| Command | Result |
| --- | --- |
| `yarn build:app` | Build the runnable Electron application in `app/` |
| `yarn package:app` | Build `app/`, then create installers and archives in `dist-app/` |
| `yarn dev:app` | Build `app/`, then launch Electron |
| `node build.mjs --dir` | Build `app/`, then create an unpacked application in `dist-app/` |

The existing `start`, `build`, `dev`, and `exec` commands remain available.
`build` still creates distribution packages. Existing `dist/` output
is left untouched, and new packages go to `dist-app/`.

Run commands from the repository root. `build.mjs` clears only the generated
`app/` directory before assembling it, so stale hashed bundles cannot accumulate.
Do not store source or user files in `app/`.

Vite builds the Study and Field HTML entries from `src/`, with relative asset
URLs for Electron's `file:` pages. Bundled JS, CSS, fonts, and the output-pane
worker are emitted under `app/assets/`. `app/.vite/manifest.json` records their
paths. The main process, CommonJS preload, exporters, execution URL providers,
and classic `lib/injection.js` retain their existing paths and formats.
There is no Vite development server or HMR in the Electron launch command yet.

Study statically imports its UI components and their CSS. Vite combines the
Study, component, and SweetAlert2 styles into one stylesheet linked from the
built HTML; components do not insert stylesheet links at runtime. Field keeps
its own stylesheet, and the prebuilt croq-mirror stylesheet remains separate.

Runtime-selected language JSON and icons keep their paths under `study/res/`;
version information is inserted into `resource.json` and `package.json`.
SweetAlert2 is bundled by Vite, while the already-built croq-mirror distribution
is copied intact to preserve its worker and asset URLs. `electron-builder`
continues to create the Electron distribution packages.

Build and renderer validation:

```console
node --test test/build-output.test.mjs
node test/run-study-integration.mjs
node test/run-study-integration.mjs ./main-integration.mjs
node test/run-study-integration.mjs ./run-focus-integration.cjs
```

## Provisional web build

| Command | Result |
| --- | --- |
| `yarn dev:web` | Start Vite's development server and open Study |
| `yarn build:web` | Build the browser application in `dist-web/` |
| `yarn preview:web` | Serve the built `dist-web/` application with Vite |

Use the URL printed by Vite (`/`). This is the Study page itself,
not a redirect. Copy the contents of `dist-web/` into any web-server directory
(for example `hoge/`) and open `hoge/` (or `hoge/index.html`); asset URLs are relative to it. Development serves source files directly and supports Vite's
CSS updates and page reloads. No Electron build or preload is required.
The build clears `dist-web/`, which is ignored by Git. Use HTTP through the dev
or preview server rather than opening the HTML as a local file.

Study imports `#session`, resolved by Vite to `session-client.js` for the app
build and `session-local.js` for `--mode web`. Both expose `Session`, while
retaining the names `SessionClient` and `SessionLocal` respectively.
The web build includes Study and Field. Run opens `field/#<sessionId>` once,
waits for Field to acknowledge readiness, and replaces its iframe on each run.
Stop removes the iframe and releases the execution URL while leaving Field open.
Closing Field manually allows it to be reopened on the next Run. Study assigns
an independent session ID to each page instance. Allow pop-ups for the site;
Field is opened directly from the Run action, before asynchronous generation.

SessionLocal supports New, Open, and Run. Open displays a minimal web dialog:
choose a root directory first, then choose a `.js` file inside it, and confirm
with Open. The buttons invoke browser-native pickers with read access. The
selected root and root-relative script path are shown; files outside the root
are rejected. Changing the root clears the script selection. Cancelling leaves
the current document and execution context unchanged. The root is reused as the
initial selection on the next Open, but is not persisted across page reloads.

Running `test/main.js` uses the chosen root for assets such as `../data.json`.
Switching projects releases the old execution URL before creating a new provider.
New clears the current file path while retaining the root for the next Open.
Dropping, saving, exporting, execution without a window, and closing through the
menu still display an unsupported-operation message. Use browser controls to
close the page. Edits are not saved persistently.

`vite-web-resources.mjs` serves the prebuilt editor and version JSON during
development and emits the editor, licenses, and Study resources during the web
build. It also serves/emits the execution Service Worker at a stable root URL,
its path helper, and the generated classic injection script. The editor's worker
and relative URLs are preserved.

After `yarn build:web`, run `node --test test/web-integration.test.cjs` to check
initialization, editing, execution output, Field reuse, Stop, reopening, New,
project selection, cancellation, outside-root rejection, and project switching
through both Vite servers and a subdirectory deployment
in an isolated Chromium renderer without Electron IPC or a preload. Picker
buttons use substituted picker functions in this test, with real OPFS directory
and file handles; native OS picker interactions are not automated.

The editor is provided by `github:takty/croq-mirror#main`. `yarn.lock` pins the
resolved commit. No sibling checkout or local editor build is required.

The build copies the committed editor bundles from the dependency's `docs/`
directory into `app/lib/croq-mirror/dist/`, including its worker, styles, fonts,
cursors, source maps, and licenses. It excludes the example page and its scripts.

After building, run `node test/run-study-integration.mjs` to check the Electron
integration, and `node --test test/exporter.test.cjs` to check library exports.

Local file and path operations use `NodeFileSystem` in
`src/lib/fs-node.js`. The main process and SessionServer create instances;
Backup and Exporter receive a filesystem instance from their callers.
File operations are asynchronous. File dialogs remain in SessionServer;
backup naming and generated content remain in their callers.
After building, run `node --test test/backup.test.mjs test/fs-library.test.mjs test/shared-filesystem.test.mjs test/exporter.test.cjs`
to check file operations, backups, and exports.

## Export generation and saving

- `src/exporter-core.js` (`ExporterCore`) reads dependencies, analyzes and wraps
  libraries, loads editor definitions, and generates HTML without writing files.
- `src/exporter-node.js` (`NodeExporter`) saves generated content and copies
  template libraries through the supplied filesystem.
- `src/exporter-browser.js` (`BrowserExporter`) returns generated content for a
  browser or Service Worker without Node or DOM dependencies.

`createWebPage(code, sourcePath, injection = false)` returns
`[true, { files, entryPath, userCodeOffset }]`, where `files` is a
`Map<string, string>` of relative output paths to text, `entryPath` is
`index.html`, and `userCodeOffset` is the character offset into that HTML.
Generated dependency paths use `/`, including on Windows. Missing input returns
`[false, missingPath]`; filesystem and parser errors otherwise follow the existing
read/analysis APIs. Each successful result retains its own offset.
`createLibrary(code, sourcePath, namespace, structure, includeUse = false)` returns
`[true, libraryText]` or `[false, missingPath]`. Its path supplies the base directory
for included libraries; neither method saves anything.

For execution, `BrowserExporter.exportForExecution(code, sourcePath)` returns the
page result with runtime injection referenced in the HTML. Only generated HTML
and transformed `@use` libraries are included in `files`. The additional `sources`
Map associates static output paths with filesystem paths, including `@need`,
`@import`, and the injection script; `sourceDirectory` is the source file's parent
directory (or the filesystem root for an untitled program). Static file metadata
is checked without preloading its bytes. Explicit `createWebPage` exports and
NodeExporter continue to collect the content needed for saving.
Pass a readable injection script path to the constructor when it is not available
as `lib/injection.js` in the supplied filesystem. Use the built classic injection
script from `app/lib/injection.js`, not the ES module source. The build copies all
three exporter modules and their parser dependencies into `app/`.

`NodeExporter.exportForExecution(code, sourcePath, directory)` saves runtime
content in the temporary directory owned by `NodeUrlProvider`. SessionServer uses
`exportAsWebPage` and `exportAsLibrary` for explicit user saves; their existing
`[success, path]` results and arguments remain available. Explicit web-page saves
omit runtime injection by default. Template copies continue to preserve existing
raw dependencies. Output write errors reject the save promise; missing inputs
are detected before web-page output is written.

A browser's explicit Save/Export action must separately write the generated
content to a user-selected destination (or offer a download). Returning content
for execution is not a save operation. The browser Save UI is not implemented;
the Electron execution URL still uses temporary files.

## Execution URL providers

`NodeUrlProvider` in `src/url-provider-node.js` is used by SessionServer with
NodeExporter. It keeps the existing temporary-file creation, URL generation, and
cleanup behavior. Each provider defines and exports its own `LibraryError` class.

`BrowserUrlProvider` in `src/url-provider-browser.js` uses BrowserExporter and
registers the module Service Worker `url-provider-worker.js`. It sends generated
content through a MessageChannel and returns a URL only after the worker has
stored the generated files in Cache Storage and the source mapping in IndexedDB.
No generated files are saved through the supplied filesystem. The worker also
contains the IndexedDB mapping storage and file-response handling.

For any other request, the worker reads the file at request time from the supplied
BrowserFileSystem root handle. Explicit `sources` mappings take precedence over
the default project-root-relative lookup. There is no file-list enumeration:
files created after execution starts can also be read. Ordinary JS, images, audio,
JSON, and other project assets are never added to Cache Storage. Each response
uses a fresh File snapshot and `Cache-Control: no-store`, so subsequent requests
see saved changes or deletions. Common content types, HEAD, and single byte-range
requests for media are supported. Unknown file types use application/octet-stream
unless the File supplies a MIME type.

```js
import { BrowserExporter } from './exporter-browser.js';
import { BrowserUrlProvider } from './url-provider-browser.js';

// files is a BrowserFileSystem containing the source files and built injection script.
const exporter = new BrowserExporter(files, 'lib/injection.js');
const provider = new BrowserUrlProvider(sessionId, exporter);
const url = await provider.createUrl(editorText, sourcePath);
executionFrame.src = url;

// When the execution session ends:
await provider.dispose();
```

The optional third constructor argument specifies the worker script URL (relative
to the provider module, or absolute). Its sibling `__croqujs_run__/` directory is
reserved as the worker scope. URLs have the form
`__croqujs_run__/<unique-run-id>/<source-directory>/#<session-id>,<code-offset>`.
The run directory corresponds to the project root: running `test/main.js`
produces `test/index.html` internally, served by the trailing-slash URL `test/`.
Thus `./data.json` refers to `test/data.json` and `../images/a.png` refers to the
project's `images/a.png`. Explicit `index.html` requests also work. Generated
files take precedence over source files at the same URL.
The worker controls execution pages, not the host editor. Use the returned URL
for an iframe or window navigation; a fetch from an uncontrolled host page does
not use this worker. The scope must not overlap a more specific worker intended
to control these execution pages.

Serve the built modules with JavaScript content types over HTTPS or localhost;
`file:` URLs are not supported. See the
[ServiceWorkerContainer.register documentation](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)
for the registration and scope requirements. The build copies the provider and
worker files into `app/` automatically. This adds a usable browser provider; it
does not switch Electron's SessionServer to a browser runtime.

Await each operation on a provider before starting another. A successful
replacement invalidates its previous URL; a failed generation or registration
keeps that URL. Different providers use separate run IDs, even for the same
session ID. `dispose()` removes that provider's cache and source mapping and is repeatable;
it leaves the shared worker registration in place. Missing or disposed generated
resources return 404, and only GET/HEAD are supported. The same applies to static
files after disposal: they cannot be reached through an expired execution URL.
Invalid encoded paths are rejected, and source lookups stay within the supplied
root. Paths use the filesystem adapter's portable relative-path convention;
parent navigation out of the execution URL directory is not mapped to source files.
Permission-denied reads return 403; requesting renewed permission belongs to the
host UI, not the worker.

Cache Storage preserves generated content across worker stop/start cycles. This
is execution storage, not an explicit user export or a guarantee against browser
storage eviction. The caller must dispose sessions: after an abrupt host closure,
cached runs and source mappings may remain. Directory handles and path mappings
are retained in IndexedDB across worker restarts; static file contents are not.
The BrowserFileSystem `getDirectoryHandle()` method exposes the root handle for
this purpose. See the [File System API documentation](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
for handle serialization. Automatic cleanup of abandoned sessions and restoration
of the host's provider objects after reload are not implemented.

After `node build.mjs`, run:

```console
node --test test/exporter.test.cjs test/exporter-content.test.mjs test/exporter-worker.test.cjs test/url-provider.test.mjs test/session-server-async.test.cjs
node --test test/url-provider-browser-errors.test.mjs test/url-provider-browser.test.cjs
```

The worker test runs a hidden Chromium window through Electron, loads the browser
exporter in a module Service Worker, reads real OPFS files using BrowserFileSystem,
and serves generated runtime and explicit-export responses without writing output
files. The existing `fs-library.test.mjs` and `shared-filesystem.test.mjs` currently
require the missing `test/fs-handles.mjs` fixture and cannot run until it is restored.
The browser URL test opens the returned URLs in hidden Chromium windows, executes
their generated scripts, stops the Service Worker and reloads, then verifies URL
replacement, independent sessions, failed registration, and disposal. It also
checks real OPFS data and images, changes/additions/deletions during execution,
byte-range responses, source mappings after worker restart, and the absence of
static files from Cache Storage. Native picker permission renewal is not covered.
