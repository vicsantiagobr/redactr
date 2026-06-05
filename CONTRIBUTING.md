# Contributing to Redactr

Thanks for wanting to help! Redactr is intentionally tiny and dependency-free,
and the best contributions keep it that way.

## Getting set up

```bash
git clone https://github.com/vicsantiagobr/redactr.git
cd redactr
npm install        # installs only the dev tooling (TypeScript)
npm run ci         # typecheck + syntax check + tests
```

There is **no build step**. The source in `src/` runs as-is in Node and the
browser.

## Project layout

```
src/          the core library (this is what ships on npm)
  detectors.js  one entry per kind of sensitive data
  redactor.js   redact() / restore() engine
bin/          the CLI
assets/       the web demo (imports straight from ../src)
test/         node:test suites
```

## Adding a detector (the most welcome PR!)

1. Add an entry to the `DETECTORS` array in [`src/detectors.js`](src/detectors.js):

   ```js
   {
     type: "MY_TYPE",          // used in placeholders: [[MY_TYPE_1]]
     label: "Human name",       // shown in the UI / --list
     priority: 50,              // higher wins when matches overlap
     regex: /.../,              // the g and d flags are added for you
     // group: 1,               // optional: redact only this capture group
     // validate: (v) => true,  // optional: drop false positives
   }
   ```

2. Add a test in `test/detectors.test.js` proving it matches the real thing and
   **does not** match look-alikes.
3. Run `npm run ci`. Keep it green.

### Guidelines

- **Precision over recall.** A noisy detector that flags normal prose is worse
  than none. Prefer anchored patterns and add a `validate` function when a
  checksum exists (see Luhn / CPF / CNPJ).
- **No runtime dependencies.** Dev tooling only.
- Keep functions small and documented with JSDoc (we typecheck with `tsc`).

## Reporting issues

Found a leak it missed, or a false positive? Open an issue with a **redacted**
example — never paste real secrets.
