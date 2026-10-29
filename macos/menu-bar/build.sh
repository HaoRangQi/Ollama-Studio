#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$ROOT/macos/menu-bar"
BUILD_DIR="$ROOT/build"
APP_NAME="Ollama Studio Menu"
APP="$BUILD_DIR/$APP_NAME.app"
# 版本号唯一来源是 package.json；DMG 名、Info.plist 都从这里取，避免多处漂移。
VERSION="$(node -p "require('$ROOT/package.json').version")"
DMG="$BUILD_DIR/$APP_NAME-$VERSION.dmg"

if pgrep -f "$APP/Contents/MacOS/OllamaStudioMenu" >/dev/null 2>&1; then
    echo "Quit Ollama Studio Menu before rebuilding." >&2
    exit 1
fi

for command in node npm npx swift swiftc iconutil hdiutil codesign; do
    if ! command -v "$command" >/dev/null 2>&1; then
        echo "Missing required command: $command" >&2
        exit 1
    fi
done

cd "$ROOT"
echo "==> Building frontend"
npm run build:web

echo "==> Building self-contained server bundle"
rm -rf "$APP"
mkdir -p \
    "$APP/Contents/MacOS" \
    "$APP/Contents/Resources/server" \
    "$APP/Contents/Resources/runtime"

npx esbuild server.ts \
    --bundle \
    --platform=node \
    --format=esm \
    --outfile="$APP/Contents/Resources/server/server.js" \
    --banner:js='import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' \
    --log-level=warning

cp -R "$ROOT/dist" "$APP/Contents/Resources/server/dist"

# server.js 是 ESM；显式声明模块类型，避免 Node 向上遍历目录寻找 package.json。
# 应用安装到 /Applications 后没有仓库的 package.json，缺少该文件会按 CommonJS 解析而启动失败。
printf '{"type":"module"}\n' > "$APP/Contents/Resources/server/package.json"

echo "==> Copying Node runtime"
NODE_BIN="$(node -p 'process.execPath')"
cp -L "$NODE_BIN" "$APP/Contents/Resources/runtime/node"
chmod +x "$APP/Contents/Resources/runtime/node"

echo "==> Generating icons"
ICON_DIR="$BUILD_DIR/menu-icons"
rm -rf "$ICON_DIR"
mkdir -p "$ICON_DIR"
swift "$SCRIPT_DIR/make-icon.swift" "$ICON_DIR"
cp "$ICON_DIR/menu-iconTemplate.png" "$APP/Contents/Resources/"
cp "$ICON_DIR/menu-iconTemplate@2x.png" "$APP/Contents/Resources/"

ICONSET="$BUILD_DIR/AppIcon.iconset"
rm -rf "$ICONSET"
swift "$SCRIPT_DIR/make-app-icon.swift" "$ICONSET"
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

echo "==> Building menu bar executable"
swiftc \
    -swift-version 5 \
    -O \
    "$SCRIPT_DIR/main.swift" \
    -o "$APP/Contents/MacOS/OllamaStudioMenu" \
    -framework AppKit

# Info.plist 里的版本号由 package.json 注入，源文件不写死版本。
sed -e "s|__APP_VERSION__|$VERSION|g" "$SCRIPT_DIR/Info.plist" > "$APP/Contents/Info.plist"

echo "==> Signing (ad-hoc)"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"

echo "==> Building DMG"
DMG_STAGE="$BUILD_DIR/dmg-stage"
rm -rf "$DMG_STAGE"
mkdir -p "$DMG_STAGE"
cp -R "$APP" "$DMG_STAGE/"
ln -s /Applications "$DMG_STAGE/Applications"
rm -f "$DMG"
diskutil image create from \
    --format UDZO \
    --volumeName "$APP_NAME" \
    "$DMG_STAGE" \
    "$DMG" >/dev/null

echo
echo "App: $APP"
echo "DMG: $DMG"
du -sh "$APP" "$DMG"
