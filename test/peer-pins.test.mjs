// Hermetic guard: both framework peers must be declared, use the required pin
// form (exact for dsh-web, first-party-compatible ~X.Y.Z for cordis), and equal
// the devDependency the tests run against. No network, reads package.json only.
//
// Why: an overly broad peer range lets npm install another framework copy beside
// DSH's own. A second @deepseek-ai/dsh-web or @deepseek-ai/cordis shadows the
// framework the plugin is loaded into (two Context classes, two service
// registries) and can break plugin loading. The installed-tree verification
// separately measures whether the allowed cordis patch range dedupes in practice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const SCOPE = "@deepseek-ai/";
const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
// cordis follows the first-party plugins' "~X.Y.Z" (patch-only) pin.
const TILDE_ALLOWED = new Set(["@deepseek-ai/cordis"]);

const WHY =
  "a range lets npm install a second copy of dsh-web/cordis beside DSH's own, " +
  "which shadows the framework and can break plugin loading";

const peerDependencies = pkg.peerDependencies ?? {};
const peers = Object.entries(peerDependencies).filter(([name]) => name.startsWith(SCOPE));

test("the framework peers are declared", () => {
  for (const name of ["@deepseek-ai/dsh-web", "@deepseek-ai/cordis"]) {
    assert.ok(peerDependencies[name], `${name} must be declared as a peerDependency`);
  }
});

for (const [name, spec] of peers) {
  test(`${name} peer uses the required pin form`, () => {
    const bare = TILDE_ALLOWED.has(name) && spec.startsWith("~") ? spec.slice(1) : spec;
    assert.match(
      bare,
      EXACT,
      `${name} peer "${spec}" is a range, not an exact pin${TILDE_ALLOWED.has(name) ? " (or ~X.Y.Z)" : ""}: ${WHY}`,
    );
  });

  test(`${name} peer equals its devDependency`, () => {
    const dev = pkg.devDependencies?.[name];
    assert.equal(
      dev,
      spec,
      `${name} peer "${spec}" differs from devDependencies "${dev}": the tests must run against ` +
        `the same pin form the peer declares, otherwise ${WHY}`,
    );
  });
}
