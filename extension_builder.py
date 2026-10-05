#!/usr/bin/env python3
"""
Single-script Telegram Extension Builder
- Sets up bot token & chat ID in background.js (with hide() encoding)
- Builds zips for Chrome/Brave, Firefox, Safari
"""

import base64
import json
import re
import shutil
import sys
import zipfile
from datetime import datetime
from pathlib import Path
from getpass import getpass


# ═══════════════════════════════════════════════════════
# hide() encoding (matches background.js exactly)
# ═══════════════════════════════════════════════════════
B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

def hide_encode(plaintext: str) -> str:
    xored = bytes(b ^ 0x5a for b in plaintext.encode("utf-8"))
    return base64.b64encode(xored).decode("ascii")

def hide_decode(b64: str) -> str:
    xored = base64.b64decode(b64)
    return bytes(b ^ 0x5a for b in xored).decode("utf-8")


# ═══════════════════════════════════════════════════════
# Browser configurations
# ═══════════════════════════════════════════════════════
BROWSERS = {
    "chrome": {
        "name": "Chrome / Brave / Edge",
        "extra_manifest": {
            # Chromium MV3 requires `service_worker`; it rejects `scripts` and
            # refuses to load the extension. remote.js is pulled in by the
            # importScripts() call in background.js, so it must NOT be listed
            # here or the two would both define the same globals.
            "background": {"service_worker": "background.js"},
        },
        "zip_name": "stop-watch-chrome.zip",
    },
    "firefox": {
        "name": "Firefox",
        "extra_manifest": {
            "background": {
                "scripts": ["background.js", "remote.js"]
            },
            "browser_specific_settings": {
                "gecko": {
                    "id": "stop-watch@telegram.example",
                    "strict_min_version": "109.0"
                }
            },
        },
        "zip_name": "stop-watch-firefox.zip",
    },
    "safari": {
        "name": "Safari (Xcode source)",
        "extra_manifest": {},
        "zip_name": "stop-watch-safari-source.zip",
    },
}

EXTENSION_FILES = [
    "manifest.json", "background.js", "remote.js",
    "popup.js", "popup.html", "icon-128.png"
]

EXCLUDE = {
    "__pycache__", "*.pyc", ".git", ".venv", "venv",
    "*.zip", ".DS_Store", "Thumbs.db",
    "extension_builder.py", "setup_extension.py", "telegram_bot_setup.py",
    "build_extension.py", "config.json", "*.crx", "*.xpi", "*.pem",
}

def should_exclude(path: Path, name: str) -> bool:
    parts = path.parts
    for pat in EXCLUDE:
        if pat.startswith("*."):
            if name.endswith(pat[1:]): return True
        elif pat in parts or name == pat: return True
    return False


# ═══════════════════════════════════════════════════════
# Input helpers
# ═══════════════════════════════════════════════════════
def secure_input(prompt: str) -> str:
    try:
        return getpass(prompt)
    except (EOFError, OSError):
        print(f"{prompt} (visible): ", end="", flush=True)
        return sys.stdin.readline().rstrip("\n")


def prompt_credentials() -> tuple[str, str]:
    print("\n" + "=" * 55)
    print("Telegram Credentials")
    print("=" * 55)
    print("Bot token from @BotFather  |  Chat ID from @userinfobot\n")

    while True:
        token = secure_input("Bot Token (123456789:ABC...): ").strip()
        if not token or ":" not in token:
            print("❌ Invalid format\n")
            continue
        if token == secure_input("Confirm Bot Token: ").strip():
            break
        print("❌ Mismatch\n")

    while True:
        chat = secure_input("Chat ID (numeric, e.g. 987654321): ").strip()
        if not chat or not chat.lstrip("-").isdigit():
            print("❌ Must be numeric\n")
            continue
        if chat == secure_input("Confirm Chat ID: ").strip():
            break
        print("❌ Mismatch\n")

    return token, chat


# ═══════════════════════════════════════════════════════
# Update background.js
# ═══════════════════════════════════════════════════════
def update_background_js(project_root: Path, token: str, chat: str) -> None:
    bg_path = project_root / "background.js"
    content = bg_path.read_text(encoding="utf-8")

    token_enc = hide_encode(token)
    chat_enc = hide_encode(chat)

    new_content = re.sub(
        r'const TOKEN = hide\("[^"]*"\);\s*//.*',
        f'const TOKEN = hide("{token_enc}");  // from @BotFather',
        content
    )
    new_content = re.sub(
        r'const CHAT\s+=\s*hide\("[^"]*"\);\s*//.*',
        f'const CHAT  = hide("{chat_enc}");  // your chat with the bot',
        new_content
    )

    bg_path.write_text(new_content, encoding="utf-8")
    print(f"📝 Updated background.js")
    print(f"   TOKEN: {token_enc[:40]}...")
    print(f"   CHAT:  {chat_enc}")


def show_current_credentials(project_root: Path) -> None:
    bg_path = project_root / "background.js"
    content = bg_path.read_text()
    m_t = re.search(r'const TOKEN = hide\("([^"]+)"\)', content)
    m_c = re.search(r'const CHAT\s+=\s*hide\("([^"]+)"\)', content)
    if m_t:
        print(f"\nCurrent TOKEN: {hide_decode(m_t.group(1))}")
    if m_c:
        print(f"Current CHAT:  {hide_decode(m_c.group(1))}")


# ═══════════════════════════════════════════════════════
# Build zips
# ═══════════════════════════════════════════════════════
def build_browsers(project_root: Path, targets: list, custom_names: dict) -> list:
    base_manifest = json.loads((project_root / "manifest.json").read_text())

    # Clean & create build dir
    build_root = project_root / "build"
    if build_root.exists():
        shutil.rmtree(build_root)

    outputs = []

    for key in targets:
        if key not in BROWSERS:
            print(f"❌ Unknown: {key}")
            continue

        browser = BROWSERS[key]
        print(f"\n{'='*50}")
        print(f"Building: {browser['name']}")
        print(f"{'='*50}")

        # Generate manifest
        manifest = json.loads(json.dumps(base_manifest))
        manifest.update(browser.get("extra_manifest", {}))

        # Copy files
        build_dir = build_root / key
        build_dir.mkdir(parents=True, exist_ok=True)
        for fname in EXTENSION_FILES:
            src = project_root / fname
            if src.exists():
                dst = build_dir / fname
                if fname == "manifest.json":
                    dst.write_text(json.dumps(manifest, indent=2))
                else:
                    shutil.copy2(src, dst)

        # Safari extra: Xcode structure
        if key == "safari":
            safari_dir = build_dir / "StopWatch.safariextension"
            safari_dir.mkdir(exist_ok=True)
            for fname in EXTENSION_FILES:
                src = project_root / fname
                if src.exists():
                    if fname == "manifest.json":
                        (safari_dir / "manifest.json.ref").write_text(json.dumps(manifest, indent=2))
                    else:
                        shutil.copy2(src, safari_dir / fname)
            # Info.plist
            info_plist = f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>CFBundleDisplayName</key><string>{manifest.get("name")}</string>
    <key>CFBundleIdentifier</key><string>com.example.stopwatch</string>
    <key>CFBundleVersion</key><string>{manifest.get("version")}</string>
    <key>CFBundleShortVersionString</key><string>{manifest.get("version")}</string>
    <key>NSExtension</key><dict>
        <key>NSExtensionPointIdentifier</key><string>com.apple.Safari.content-blocker</string>
        <key>NSExtensionPrincipalClass</key><string>StopWatchExtensionHandler</string>
    </dict>
    <key>SFSafariToolbarItem</key><dict>
        <key>Label</key><string>{manifest.get("name")}</string>
        <key>Image</key><string>icon-128.png</string>
    </dict>
</dict></plist>'''
            (safari_dir / "Info.plist").write_text(info_plist)
            # Swift stub
            (safari_dir / "StopWatchExtensionHandler.swift").write_text(
                'import SafariServices\n\nclass StopWatchExtensionHandler: NSObject, NSExtensionRequestHandling {\n    func beginRequest(with context: NSExtensionContext) {\n        let response = NSExtensionItem()\n        context.completeRequest(returningItems: [response], completionHandler: nil)\n    }\n}\n'
            )
            print(f"📁 Safari source: {safari_dir}")

        # Create zip
        zip_name = custom_names.get(key, browser["zip_name"])
        if not zip_name.endswith(".zip"):
            zip_name += ".zip"
        zip_path = project_root / zip_name

        print(f"📦 Creating {zip_name}")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in build_dir.rglob("*"):
                if f.is_file() and not should_exclude(f, f.name):
                    arc = f.relative_to(build_dir)
                    zf.write(f, arc)
                    print(f"   + {arc}")

        mb = zip_path.stat().st_size / 1024 / 1024
        print(f"✅ {browser['name']}: {zip_path.name} ({mb:.2f} MB)")
        outputs.append((browser['name'], zip_path))

    return outputs


# ═══════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════
def main():
    project_root = Path(__file__).parent.resolve()
    print("🤖 Telegram Extension Builder")
    print(f"📂 {project_root}")

    # Parse CLI args
    cli_args = sys.argv[1:]
    targets_arg = None
    custom_names = {}
    update_creds = False

    for arg in cli_args:
        if arg == "--update-creds":
            update_creds = True
        elif "=" in arg:
            k, v = arg.split("=", 1)
            if k in BROWSERS:
                custom_names[k] = v if v.endswith(".zip") else v + ".zip"
        elif targets_arg is None:
            targets_arg = arg

    # 1. Credentials
    show_current_credentials(project_root)
    if not update_creds and len(sys.argv) <= 1:
        update_creds = input("\nUpdate credentials? (y/N): ").strip().lower() == "y"

    if update_creds:
        token, chat = prompt_credentials()
        update_background_js(project_root, token, chat)

    # 2. Select targets
    print("\nTargets: chrome, firefox, safari, all")
    if targets_arg:
        targets = [t.strip() for t in targets_arg.split(",")]
    else:
        choice = input("Build for [chrome,firefox]: ").strip().lower()
        targets = list(BROWSERS.keys()) if choice in ("all", "") else [t.strip() for t in choice.split(",")]

    if not custom_names and sys.stdin.isatty():
        for k in targets:
            if k != "safari":
                name = input(f"  Zip name for {BROWSERS[k]['name']} (Enter=default): ").strip()
                if name:
                    custom_names[k] = name if name.endswith(".zip") else name + ".zip"

    # 4. Build
    outputs = build_browsers(project_root, targets, custom_names)

    # 5. Summary
    print(f"\n{'='*50}")
    print("DONE")
    print(f"{'='*50}")
    for name, path in outputs:
        print(f"✅ {name}: {path.name}")
    if "safari" in targets:
        print("\n📱 Safari: Open build/safari/StopWatch.safariextension/ in Xcode")


if __name__ == "__main__":
    main()