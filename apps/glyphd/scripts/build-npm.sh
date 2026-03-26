#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION=$(node -e "process.stdout.write(require(process.argv[1]).version)" "$ROOT/package.json")

echo "Building glyphd v$VERSION"
echo ""

# Step 1: Build the client (Vite)
echo "→ Building client..."
cd "$ROOT"
bun run vite build --config vite.config.ts
echo "  ✓ Client built → dist/client/"
echo ""

# Step 2: Compile binaries for each platform
build_target() {
  local platform="$1"
  local bun_target="$2"
  local ext="$3"
  local out_dir="$ROOT/npm/$platform"

  rm -rf "$out_dir/bin" "$out_dir/dist"
  mkdir -p "$out_dir/bin" "$out_dir/dist"

  echo "→ Compiling for $platform..."
  bun build --compile \
    --target="$bun_target" \
    "$ROOT/src/server/index.ts" \
    --outfile "$out_dir/bin/glyphd${ext}"
  echo "  ✓ Binary → npm/$platform/bin/glyphd${ext}"

  cp -R "$ROOT/dist/client" "$out_dir/dist/"
  echo "  ✓ Assets → npm/$platform/dist/client/"
}

build_target "darwin-arm64" "bun-darwin-arm64" ""
build_target "darwin-x64"   "bun-darwin-x64"   ""
build_target "linux-arm64"  "bun-linux-arm64"   ""
build_target "linux-x64"    "bun-linux-x64"     ""
build_target "win32-x64"    "bun-windows-x64"   ".exe"

echo ""
echo "Build complete! Platform packages ready in npm/"
echo ""
echo "To publish:"
echo "  1. Publish platform packages first:"
for target in darwin-arm64 darwin-x64 linux-arm64 linux-x64 win32-x64; do
  echo "     cd npm/$target && npm publish --access public && cd ../.."
done
echo ""
echo "  2. Then publish main package:"
echo "     npm publish"
