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

Local file and path operations are implemented in `src/fs-node.js`. The main
process, Twin, Backup, and Exporter use this module instead of Node's filesystem
and path APIs directly. File dialogs remain in Twin; backup naming and generated
content remain in their callers. The adapter preserves synchronous operations,
UTF-8 text, and existing error behavior (including `ENOENT`/`EPERM` codes used by
callers). A backend with only asynchronous APIs will also require adapting those
callers. Run `node --test test/fs-node.test.mjs test/exporter.test.cjs` to check
file operations, backups, and exports.
