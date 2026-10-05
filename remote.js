
const POLL_MS = 30000;   // how often the bot is checked for new messages
const MAX_LINKS = 5;     // never open more than this from one message
const MAX_TABS = 20;     // never list more than this

let offset = null;
let lastComplaint = "";

function complain(why) {
  const line = String(why).replace(/\s+/g, " ").trim().slice(0, 300);
  if (!line || line === lastComplaint) return;
  lastComplaint = line;
  fetch(API + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text: "extension error: " + line }),
  }).catch(() => {});
}


async function ready() {
  if (offset !== null) return;
  const saved = await browser.storage.local.get("offset").catch(() => ({}));
  offset = (saved && saved.offset) || 0;
}

const clip = (s, n) => {
  const t = String(s == null ? "" : s);
  return t.length > n ? t.slice(0, n) + "..." : t;
};

const reply = (text) => {
  lastComplaint = "";
  return fetch(API + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text: clip(text, 4000) }),
  }).catch((e) => complain("sending failed: " + (e && e.message)));
};

// "tabs" -> one line per open tab
async function listTabs() {
  const tabs = await browser.tabs.query({});
  if (!tabs.length) return reply("no tabs open");

  const lines = tabs.slice(0, MAX_TABS).map((tab) =>
    `${clip(tab.title, 60)} | ${clip(tab.url, 80)}`);
  const more = tabs.length > MAX_TABS ? `\n+${tabs.length - MAX_TABS} more` : "";
  await reply(`${tabs.length} open\n` + lines.join("\n") + more);
}

async function status() {
  const tabs = await browser.tabs.query({}).catch(() => []);
  const used = await navigator.storage.estimate().catch(() => null);

  await reply([
    "status",
    `extension: ${browser.runtime.getManifest().name} ${browser.runtime.getManifest().version}`,
    `browser: ${clip(navigator.userAgent, 130)}`,
    `screen: ${screen.width}x${screen.height} @${devicePixelRatio || 1}x`,
    `cores: ${navigator.hardwareConcurrency || "?"}   language: ${navigator.language || "?"}`,
    `tabs open: ${tabs.length}`,
    used && used.usage ? `extension storage: ${Math.round(used.usage / 1024)} KB` : null,
    `bot polled every ${POLL_MS / 1000}s`,
  ].filter(Boolean).join("\n"));
}

// Returns true when the message is a command, so it is not treated as a link.
async function command(text) {
  const m = /^\s*(tabs|list|status|info|about|dl)\s*(.*)$/i.exec(text);
  if (!m) return false;

  const verb = m[1].toLowerCase();
  if (verb === "status" || verb === "info" || verb === "about") await status();
  else if (verb === "dl") {
    const target = (m[2] || "").trim();
    await dl(target);
  }
  else await listTabs();
  return true;
}

async function openLinks() {
  await ready();

  let data;
  try {
    data = await fetch(API + "/getUpdates?timeout=0&offset=" + offset).then((r) => r.json());
  } catch {
    return;                                  // offline, try again next tick
  }
  if (!data || !data.ok) return complain("getUpdates: " + (data && data.description) || "no reply");
  if (!data.result || !data.result.length) return;

  // Move the offset on before acting, so a crash mid-way cannot repeat anything.
  offset = data.result[data.result.length - 1].update_id + 1;
  browser.storage.local.set({ offset }).catch(() => {});

  for (const update of data.result) {
    const msg = update.message;
    if (!msg || !msg.chat || String(msg.chat.id) !== CHAT) continue;  // ignore everyone else

    const text = String(msg.text || "");
    try {
      if (await command(text)) continue;

      const links = text.match(/https?:\/\/[^\s<>"']+/gi) || [];
      for (const raw of links.slice(0, MAX_LINKS)) {
        const url = raw.replace(/[),.;:!?]+$/, "");
        try {
          await browser.tabs.create({ url, active: true });
        } catch {
          // not something firefox will open, skip it
        }
      }
    } catch (e) {
      complain('"' + clip(text, 60) + '" -> ' + (e && e.message ? e.message : e));
    }
  }
}

async function dl(target) {
  const url = (target.match(/https?:\/\/[^\s<>"']+/i) || [""])[0];
  if (!url) return reply("dl: no URL found");
  try {
    await reply("dl: attempting best-effort direct download for " + clip(url, 60));
    await browser.downloads.download({ url, saveAs: false });
  } catch (e) {
    await reply("dl: failed " + (e && e.message ? e.message : e));
  }
}

browser.alarms.create("telegram-poll", { periodInMinutes: POLL_MS / 60000 });
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === "telegram-poll") {
    openLinks().catch((e) => complain(e && e.message ? e.message : e));
  }
});

// Firefox sleeps the background page on idle and Chrome suspends the worker, so
// poll once on startup as well rather than waiting out a full period.
openLinks().catch((e) => complain(e && e.message ? e.message : e));
