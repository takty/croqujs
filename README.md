# Croqujs

The Playground for JavaScript

```console
yarn install
yarn dev
```

The editor is provided by `github:takty/croq-mirror#main`. `yarn.lock` pins the
resolved commit. No sibling checkout or local editor build is required.

The build copies the committed editor bundles from the dependency's `docs/`
directory into `app/croq-mirror/dist/`, including its worker, styles, fonts,
cursors, source maps, and licenses. It excludes the example page and its scripts.

After building, run `node test/run-study-integration.mjs` to check the Electron
integration, and `node --test test/exporter.test.cjs` to check library exports.
