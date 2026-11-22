# Contributing

TaoNoise is small on purpose: plain ES modules, no framework, no runtime dependencies. Add a sound, fix a sound, or improve the page.

1. `npm test` runs the unit tests (pure code: noise generators, mix codec, timer math). No install step.
2. `npm run build` writes `dist/` (one inlined `index.html`, service worker, manifest, icons) and prints the gzip size. Keep the first load under 60 KB gzip.
3. `npm run e2e` needs `playwright-core` and Chrome (`PW_FROM=<dir containing node_modules/playwright-core> CHROME=/path/to/chrome`). It renders every sound offline and checks loudness, clipping and spectral shape, then drives the built app.

## Adding a sound

1. Add a row to `js/catalog.js` (id, name, group, character label, defaults) and a scenery mapping in `VIZ`.
2. Write the recipe in `js/sounds.js` (`R.<id> = c => { ... }`). Use only synthesis: noise buffers, filters, oscillators, scheduled events. No audio files.
3. Add its expected spectral shape to `test/expect.json`, then run `npm run calibrate` so its loudness matches the rest, and `npm run e2e`.

Keep the privacy promise: nothing leaves the browser, no third-party scripts or fonts. Commit messages in plain imperative sentences.
