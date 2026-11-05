#!/usr/bin/env node
// Hermetic installed-tree check: count physical package copies under an npm
// project's node_modules. It does not resolve or download anything.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const projectDir = resolve(process.argv[2] ?? ".");
const rootNodeModules = join(projectDir, "node_modules");
const exactOne = [
  "@deepseek-ai/dsh-web",
  "@deepseek-ai/dsh-settings",
  "@deepseek-ai/cordis",
];
const required = "@deepseek-ai/cordis-plugin-group";
const wanted = new Set([...exactOne, required]);
const found = new Map([...wanted].map((name) => [name, []]));

assert.ok(existsSync(rootNodeModules), `${projectDir} has no node_modules directory`);

function inspectPackage(name, packageDir) {
  if (wanted.has(name)) {
    const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
    found.get(name).push({ path: packageDir, version: pkg.version });
  }
  const nested = join(packageDir, "node_modules");
  if (existsSync(nested)) visitNodeModules(nested);
}

function visitNodeModules(nodeModulesDir) {
  for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const entryPath = join(nodeModulesDir, entry.name);
    if (entry.name.startsWith("@")) {
      for (const child of readdirSync(entryPath, { withFileTypes: true })) {
        if (child.isDirectory()) inspectPackage(`${entry.name}/${child.name}`, join(entryPath, child.name));
      }
    } else {
      inspectPackage(entry.name, entryPath);
    }
  }
}

visitNodeModules(rootNodeModules);

for (const name of exactOne) {
  assert.equal(
    found.get(name).length,
    1,
    `${name} must have exactly one installed copy; found ${found.get(name).length}: ` +
      found.get(name).map(({ path }) => path).join(", "),
  );
}
assert.ok(found.get(required).length > 0, `${required} must be installed`);

console.log("installed-tree identity OK");
for (const name of [...exactOne, required]) {
  const copies = found.get(name);
  console.log(`${name}: ${copies.length} (${copies.map(({ version }) => version).join(", ")})`);
}
