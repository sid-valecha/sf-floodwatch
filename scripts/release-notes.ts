// Renders CHANGELOG.md into a standalone HTML page (published as the "release notes" artifact).
// Usage: node --experimental-strip-types scripts/release-notes.ts <out.html>
import { readFileSync, writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) throw new Error("usage: release-notes.ts <out.html>");

const md = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])(https:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>')
    .replace(/(^|[\s(])@(\w{2,15})/g, '$1<a href="https://x.com/$2">@$2</a>');

interface Entry { date: string; time: string; title: string; body: string[]; tweet?: string }
const entries: Entry[] = [];
let date = "";
for (const line of md.split("\n")) {
  const d = line.match(/^## (\d{4}-\d{2}-\d{2})/);
  if (d) { date = d[1]; continue; }
  const h = line.match(/^### (\d{1,2}:\d{2}\s?[ap]m):\s*(.+)$/i);
  if (h) { entries.push({ date, time: h[1].trim(), title: h[2].trim(), body: [] }); continue; }
  const e = entries.at(-1);
  if (!e || !line.trim()) continue;
  const t = line.match(/^- \*\*Tweet angle:\*\*\s*(.+)$/);
  if (t) { e.tweet = t[1].trim().replace(/^"|"$/g, ""); continue; }
  e.body.push(line);
}

function list(lines: string[]): string {
  let html = "";
  let open = false;
  let subOpen = false;
  for (const l of lines) {
    const sub = l.match(/^\s{2,}- (.+)$/);
    const top = l.match(/^- (.+)$/);
    if (sub) {
      if (!subOpen) { html = html.replace(/<\/li>$/, ""); html += "<ul>"; subOpen = true; }
      html += `<li>${inline(sub[1])}</li>`;
    } else if (top) {
      if (subOpen) { html += "</ul></li>"; subOpen = false; }
      if (!open) { html += "<ul>"; open = true; }
      html += `<li>${inline(top[1])}</li>`;
    }
  }
  if (subOpen) html += "</ul></li>";
  if (open) html += "</ul>";
  return html;
}

const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const latest = entries[0];
const updated = latest ? `${fmtDate(latest.date)}, ${latest.time} PT` : "";

let lastDate = "";
const body = entries
  .map((e, i) => {
    const day = e.date !== lastDate ? `<h2 class="day">${fmtDate(e.date)}</h2>` : "";
    lastDate = e.date;
    const tweet = e.tweet && !/^\(/.test(e.tweet)
      ? `<div class="tweet"><span class="label">Tweet angle</span><p id="t${i}">${inline(e.tweet)}</p><button type="button" data-copy="t${i}">Copy</button></div>`
      : "";
    return `${day}<article id="r${i}"><header><time datetime="${e.date}">${esc(e.time)}</time><h3>${inline(e.title)}</h3></header>${list(e.body)}${tweet}</article>`;
  })
  .join("\n");

const html = `<title>SF Flood Watch Release Notes</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: one reading column, a tide-gauge timeline down the left edge, newest first. */
:root {
  --bg: #eef2f4; --surface: #ffffff; --fg: #14232b; --muted: #557080; --rule: #c9d6dd;
  --water: #1d6f9e; --tweet-bg: #e3eef5;
  --display: "Archivo", "Helvetica Neue", Arial, sans-serif;
  --body: "Source Serif 4", Georgia, serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0c1519; --surface: #121e24; --fg: #dbe7ec; --muted: #8aa4b1; --rule: #24363f;
  --water: #5cb4e6; --tweet-bg: #13293a; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #0c1519; --surface: #121e24; --fg: #dbe7ec; --muted: #8aa4b1; --rule: #24363f;
  --water: #5cb4e6; --tweet-bg: #13293a; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font-family: var(--body); font-size: 17px; line-height: 1.55;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 32px 64px; }
main { max-width: 680px; margin: 0 auto; }
a { color: var(--water); text-underline-offset: 2px; }
a:focus-visible, button:focus-visible { outline: 2px solid var(--water); outline-offset: 2px; }
.masthead { display: grid; gap: 8px; margin-bottom: 28px; }
.masthead h1 { font-family: var(--display); font-weight: 800; font-size: clamp(28px, 6vw, 40px); line-height: 1.05; margin: 0; letter-spacing: -0.01em; text-wrap: balance; }
.masthead p { margin: 0; color: var(--muted); }
.meta { font-family: var(--mono); font-size: 13px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 6px 16px; }
.meta strong { color: var(--fg); font-weight: 500; }
.day { font-family: var(--mono); font-weight: 500; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin: 32px 0 12px; }
article { position: relative; padding: 0 0 24px 22px; border-left: 2px solid var(--rule); }
article::before { content: ""; position: absolute; left: -7px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: var(--bg); border: 2px solid var(--water); }
article:first-of-type::before { background: var(--water); }
header { display: grid; gap: 2px; margin-bottom: 6px; }
time { font-family: var(--mono); font-size: 13px; color: var(--water); font-variant-numeric: tabular-nums; }
h3 { font-family: var(--display); font-weight: 700; font-size: 20px; line-height: 1.25; margin: 0; text-wrap: balance; }
ul { margin: 6px 0; padding-left: 20px; display: grid; gap: 4px; }
ul ul { margin: 4px 0 2px; }
li { min-width: 0; overflow-wrap: anywhere; }
.tweet { margin-top: 12px; background: var(--tweet-bg); border-radius: 6px; padding: 12px 14px; display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: start; }
.tweet .label { grid-column: 1 / -1; font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
.tweet p { margin: 0; min-width: 0; }
.tweet button { font: 500 13px var(--mono); color: var(--water); background: transparent; border: 1px solid var(--water); border-radius: 4px; padding: 4px 10px; cursor: pointer; }
footer { margin-top: 24px; font-size: 14px; color: var(--muted); }
</style>
<main>
  <div class="masthead">
    <h1>SF Flood Watch release notes</h1>
    <p>Every improvement shipped to <a href="https://sf-floodwatch.vercel.app">sf-floodwatch.vercel.app</a>, newest first. Times are Pacific.</p>
    <div class="meta"><span>Last updated <strong>${esc(updated)}</strong></span><span>${entries.length} releases</span><a href="https://github.com/sid-valecha/sf-floodwatch">Source on GitHub</a></div>
  </div>
${body}
  <footer>Informational map, not an official safety tool. Follow NWS, AlertSF and 511.</footer>
</main>
<script>
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("button[data-copy]");
  if (!b) return;
  const p = document.getElementById(b.dataset.copy);
  try { await navigator.clipboard.writeText(p.textContent); b.textContent = "Copied"; }
  catch { const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "Selected"; }
  setTimeout(() => (b.textContent = "Copy"), 1500);
});
</script>
`;
writeFileSync(out, html);
console.log(`wrote ${out}: ${entries.length} entries, updated ${updated}`);
