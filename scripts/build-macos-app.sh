#!/bin/bash

set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <binary-path> <app-zip-path> <version>" >&2
  exit 1
fi

BINARY_PATH_INPUT="$1"
APP_ZIP_PATH_INPUT="$2"
VERSION="$3"

BINARY_PATH="$(cd "$(dirname "${BINARY_PATH_INPUT}")" && pwd)/$(basename "${BINARY_PATH_INPUT}")"
APP_ZIP_PATH="$(cd "$(dirname "${APP_ZIP_PATH_INPUT}")" && pwd)/$(basename "${APP_ZIP_PATH_INPUT}")"

APP_NAME="Lobster Assistant.app"
BUNDLE_ID="com.lobsterassistant.cli"
EXECUTABLE_NAME="Lobster Assistant"
WORK_DIR="$(mktemp -d)"
APP_DIR="${WORK_DIR}/${APP_NAME}"
CONTENTS_DIR="${APP_DIR}/Contents"
MACOS_DIR="${CONTENTS_DIR}/MacOS"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

mkdir -p "${MACOS_DIR}"
cp "${BINARY_PATH}" "${MACOS_DIR}/${EXECUTABLE_NAME}"
chmod +x "${MACOS_DIR}/${EXECUTABLE_NAME}"

cat > "${CONTENTS_DIR}/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleDisplayName</key>
  <string>Lobster Assistant</string>
  <key>CFBundleExecutable</key>
  <string>${EXECUTABLE_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>Lobster Assistant</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundleVersion</key>
  <string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

codesign --force --sign - "${MACOS_DIR}/${EXECUTABLE_NAME}" >/dev/null 2>&1 || true
codesign --force --sign - "${APP_DIR}" >/dev/null 2>&1 || true

mkdir -p "$(dirname "${APP_ZIP_PATH}")"
rm -f "${APP_ZIP_PATH}"
(
  cd "${WORK_DIR}"
  /usr/bin/zip -qry "${APP_ZIP_PATH}" "${APP_NAME}"
)
