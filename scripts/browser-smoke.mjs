// Drive the real page in a headless Chrome with remote debugging (CDP, default :9333; set CDP_URL): load, wait for the CAD build,
// edit a measurement, flip hands, trigger bad input, run the download, screenshot.
import { writeFileSync } from "node:fs";

const URL_ = process.env.SMOKE_URL ?? "http://127.0.0.1:5173/";
const CDP = process.env.CDP_URL ?? "http://127.0.0.1:9333";
const tab = await (await fetch(`${CDP}/json/new?${URL_}`, { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let n = 0;
const waiting = new Map();
const logs = [];
ws.onmessage = ({ data }) => {
  const m = JSON.parse(data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") logs.push("EXCEPTION " + m.params.exceptionDetails.exception?.description?.split("\n")[0]);
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type))
    logs.push(m.params.type.toUpperCase() + " " + m.params.args.map((a) => a.value ?? a.description).join(" "));
};
const send = (method, params = {}) => new Promise((r) => { const id = ++n; waiting.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(expr, ms = 60000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await ev(expr)) return Date.now() - t; await sleep(250); }
  throw new Error("timeout waiting for: " + expr);
}
const status = () => ev(`document.querySelector('#status').textContent`);
const summaryLine = () => ev(`document.querySelector('#summary p')?.innerText ?? ''`);
const setVal = (name, v) => ev(`(() => { const el = document.querySelector('[name="${name}"]'); el.value = '${v}'; el.dispatchEvent(new Event('input', {bubbles:true})); })()`);
const shot = async (file) => writeFileSync(file, Buffer.from((await send("Page.captureScreenshot", { format: "png" })).result.data, "base64"));

await send("Page.enable"); await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.reload");

const t1 = await waitFor(`document.querySelector('#status')?.textContent.startsWith('Ready')`);
console.log(`1 first build      ${t1} ms -> "${await status()}"`);
console.log(`  summary          ${await summaryLine()}`);
console.log(`  webgl canvas     ${await ev(`(() => { const c = document.querySelector('#viewport canvas'); return c ? c.width + 'x' + c.height : 'none'; })()`)}`);
await shot("shot-1-default.png");

const middleLine = () => ev(`[...document.querySelectorAll('#summary li')].find(l=>l.innerText.toLowerCase().startsWith('middle'))?.innerText`);
const radio = (name, value) => ev(`(() => { const r = document.querySelector('input[name=${name}][value=${value}]'); r.checked = true; r.dispatchEvent(new Event('input', {bubbles:true})); })()`);

const before = await middleLine();
await setVal("middle.length", 88);
await waitFor(`document.querySelector('#summary').innerText.includes('up 28 mm')`);
console.log(`2 middle 80->88    before: "${before}"`);
console.log(`                   after:  "${await middleLine()}"`);

await radio("device", "fds");
await waitFor(`document.querySelector('#summary p')?.innerText.startsWith('Pass-through')`);
console.log(`3 FDS gripper      ${await summaryLine()}`);
console.log(`                   "${await middleLine()}"`);
await shot("shot-2-fds.png");

await radio("side", "left");
await waitFor(`document.querySelector('#summary p')?.innerText.includes('left hand')`);
console.log(`  FDS left hand    ${await summaryLine()}`);
await radio("device", "fdp");
await waitFor(`document.querySelector('#summary p')?.innerText.startsWith('Claw gripper (FDP), left')`);

await setVal("ring.length", 300);
await waitFor(`!document.querySelector('#problems').hidden`);
console.log(`4 bad input        "${await ev(`document.querySelector('#problems').innerText`)}" | download disabled=${await ev(`document.querySelector('#download').disabled`)}`);
await shot("shot-3-error.png");
await setVal("ring.length", 75);
await waitFor(`document.querySelector('#problems').hidden && document.querySelector('#status').textContent.startsWith('Ready')`);

await ev(`(() => { window.__zip = null; const o = URL.createObjectURL; URL.createObjectURL = (b) => { window.__zip = b; return o.call(URL, b); }; HTMLAnchorElement.prototype.click = function () { window.__zipName = this.download; }; })()`);
const gated = await ev(`document.querySelector('#download').disabled`);
await ev(`(() => { const a = document.querySelector('#ack'); a.checked = true; a.dispatchEvent(new Event('change')); })()`);
console.log(`  ack gate         download disabled before tick=${gated}, after=${await ev(`document.querySelector('#download').disabled`)}`);
await ev(`document.querySelector('#download').click()`);
const t5 = await waitFor(`window.__zip !== null`, 90000);
const zipInfo = await ev(`(async () => { const b = new Uint8Array(await window.__zip.arrayBuffer()); const names = []; let i = 0;
  while (i < b.length - 30 && b[i]===0x50 && b[i+1]===0x4b && b[i+2]===3 && b[i+3]===4) {
    const dv = new DataView(b.buffer, i); const csize = dv.getUint32(18, true), nlen = dv.getUint16(26, true), xlen = dv.getUint16(28, true);
    names.push(new TextDecoder().decode(b.slice(i+30, i+30+nlen))); i += 30 + nlen + xlen + csize; }
  return { name: window.__zipName, bytes: b.length, files: names }; })()`);
console.log(`5 download         ${t5} ms -> ${zipInfo.name}, ${(zipInfo.bytes / 1024).toFixed(0)} KB`);
console.log(`                   ${zipInfo.files.join(", ")}`);
console.log(`  status           "${await status()}"`);

console.log(`6 console          ${logs.length ? logs.join(" | ") : "no errors or warnings"}`);
await fetch(`${CDP}/json/close/${tab.id}`);
ws.close();
