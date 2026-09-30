/**
 * startx's own prettier config — do not delete.
 *
 * `.prettierrc.mjs` is a *template* file: its `requirePragma` override is what hands JS/TS to
 * biome inside a generated "prettier + biome" workspace. This repo is also the template source,
 * so prettier would otherwise resolve that override here too and silently skip every JS/TS file
 * in `format` / `format:check`. Prettier resolves `.prettierrc.js` ahead of `.prettierrc.mjs`,
 * so this shadows it for startx only; `FileCheck` tags it `never`, so it is never copied into a
 * generated workspace.
 */
module.exports = require("./.prettierrc.cjs");
