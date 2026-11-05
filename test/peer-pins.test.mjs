// Hermetic guard: every @deepseek-ai/* peer must be an exact pin, equal to the
// devDependency the tests run against. No network, reads package.json only.
//
// Why: a peer range that admits two versions lets npm pick the highest it can
// find and install it beside DSH's own copy. A second @deepseek-ai/dsh-web or
// @deepseek-ai/cordis shadows the framework the plugin is loaded into (two
// Context classes, two service registries) and can break plugin loading.
// The first-party DSH plugins pin exactly for the same reason; an exact pin
// gives npm one candidate, so it can only dedupe onto DSH's copy.
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

const peers = Object.entries(pkg.peerDependencies ?? {}).filter(([name]) => name.startsWith(SCOPE));

test("there are @deepseek-ai peers to check", () => {
  assert.ok(peers.length > 0, "no @deepseek-ai/* peerDependencies found");
});

for (const [name, spec] of peers) {
  test(`${name} peer is pinned exactly`, () => {
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
        `the exact version the peer admits, otherwise ${WHY}`,
    );
  });
}
