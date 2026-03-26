#!/usr/bin/env node
const { execFileSync } = require("child_process");
const path = require("path");

const PLATFORMS = {
  "darwin-arm64": "@harshilthakkar/glyphd-darwin-arm64",
  "darwin-x64": "@harshilthakkar/glyphd-darwin-x64",
  "linux-arm64": "@harshilthakkar/glyphd-linux-arm64",
  "linux-x64": "@harshilthakkar/glyphd-linux-x64",
  "win32-x64": "@harshilthakkar/glyphd-win32-x64",
};

const key = `${process.platform}-${process.arch}`;
const pkg = PLATFORMS[key];

if (!pkg) {
  console.error(`glyphd: unsupported platform ${key}`);
  console.error("Supported: darwin-arm64, darwin-x64, linux-arm64, linux-x64, win32-x64");
  process.exit(1);
}

const ext = process.platform === "win32" ? ".exe" : "";

try {
  const pkgDir = path.dirname(require.resolve(`${pkg}/package.json`));
  const bin = path.join(pkgDir, "bin", `glyphd${ext}`);
  execFileSync(bin, process.argv.slice(2), { stdio: "inherit" });
} catch (e) {
  console.error(`glyphd: failed to find binary for ${key}`);
  console.error(`Expected package: ${pkg}`);
  console.error("Try reinstalling: npm i -g glyphd");
  process.exit(1);
}
