# Croqujs

The Playground for JavaScript

```console
yarn install
yarn dev
```

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
- `src/exporter.js` keeps the existing `Exporter` name as an alias of `NodeExporter`.

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
page result with runtime injection included. The caller can construct a `Response`
from a selected `files` entry with an appropriate HTML or JavaScript content type.
Pass a readable injection script path to the constructor when it is not available
as `lib/injection.js` in the supplied filesystem. Use the built classic injection
script from `app/lib/injection.js`, not the ES module source. The build copies all
three exporter modules and their parser dependencies into `app/`.

`NodeExporter.exportForExecution(code, sourcePath, directory)` saves runtime
content in the temporary directory owned by `UrlProvider`. SessionServer uses
`exportAsWebPage` and `exportAsLibrary` for explicit user saves; their existing
`[success, path]` results and arguments remain available. Explicit web-page saves
omit runtime injection by default. Template copies continue to preserve existing
raw dependencies. Output write errors reject the save promise; missing inputs
are detected before web-page output is written.

A browser's explicit Save/Export action must separately write the generated
content to a user-selected destination (or offer a download). Returning content
for execution is not a save operation. Production Service Worker routing,
execution-state persistence, and the browser Save UI are not implemented by this
split; the Electron execution URL still uses temporary files.

After `node build.mjs`, run:

```console
node --test test/exporter.test.cjs test/exporter-content.test.mjs test/exporter-worker.test.cjs test/url-provider.test.mjs test/session-server-async.test.cjs
```

The worker test runs a hidden Chromium window through Electron, loads the browser
exporter in a module Service Worker, reads real OPFS files using BrowserFileSystem,
and serves generated runtime and explicit-export responses without writing output
files. The existing `fs-library.test.mjs` and `shared-filesystem.test.mjs` currently
require the missing `test/fs-handles.mjs` fixture and cannot run until it is restored.
