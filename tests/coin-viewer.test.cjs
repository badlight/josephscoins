"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), { JSDOM } = require("jsdom");
const root = path.join(__dirname, ".."), K = require("../coin-utils.js");
const flush = () => new Promise(resolve => setImmediate(resolve));

async function setup(t, { share, writeText, page = "coin.html", query = "?id=hadrian" } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, page), "utf8"), {
    url: "https://badlight.github.io/josephscoins/" + page + query, runScripts: "outside-only"
  });
  t.after(() => dom.window.close());
  const w = dom.window, d = w.document;
  await new Promise(resolve => d.addEventListener("DOMContentLoaded", resolve, { once: true }));
  w.CoinKit = K;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, "coins.json"), "utf8")) });
  if (share) Object.defineProperty(w.navigator, "share", { value: share });
  if (writeText) Object.defineProperty(w.navigator, "clipboard", { value: { writeText } });
  let mapCreated = 0;
  w.L = {}; w.topojson = {}; w.CoinExplore = {};
  w.CoinMintMap = { create: async () => { mapCreated++; return { update() {}, resize() {}, pause() {} }; } };
  w.eval(fs.readFileSync(path.join(root, "app.js"), "utf8"));
  d.dispatchEvent(new w.Event("DOMContentLoaded"));
  await flush();
  assert.equal(d.getElementById("errorState").hidden, true);
  return { w, d, mapCreated: () => mapCreated, click: async id => { d.getElementById(id).click(); await flush(); } };
}

test("both entry pages use the combined Gallery/Map control and simplified coin actions", async t => {
  for (const page of ["index.html", "coin.html"]) {
    const { d, click, mapCreated } = await setup(t, { page });
    const group = d.querySelector('[role="group"][aria-label="Collection view"]');
    assert.deepEqual([...group.querySelectorAll("button")].map(b => b.textContent), ["Gallery", "Map"]);
    assert.deepEqual([...d.querySelector(".viewer-actions").children].map(b => b.id), ["coinShare", "dialogClose"]);
    for (const button of d.querySelectorAll(".viewer-actions button")) {
      assert.ok(button.getAttribute("aria-label"));
      assert.equal(button.querySelector("svg").getAttribute("aria-hidden"), "true");
    }
    assert.deepEqual([...d.querySelector(".detail-actions").children].map(b => [b.tagName, b.textContent]), [["BUTTON", "Edit coin"]]);
    assert.ok(!/Copy coin link|Find mint on map/.test(d.getElementById("dialogContent").textContent));
    d.getElementById("coinDialog").close();
    await click("mapView");
    assert.equal(mapCreated(), 1);
    assert.equal(d.getElementById("coinGrid").hidden, true);
    assert.equal(d.getElementById("mapView").getAttribute("aria-pressed"), "true");
    await click("galleryView");
    assert.equal(d.getElementById("coinGrid").hidden, false);
    assert.equal(d.getElementById("mintExplorer").hidden, true);
    assert.equal(d.getElementById("galleryView").getAttribute("aria-pressed"), "true");
  }
});

test("native sharing follows the current coin and leaves filters and map state out of its link", async t => {
  const shared = [], copied = [];
  const { w, d, click } = await setup(t, {
    query: "?id=hadrian&view=map&mapYear=150&mapMint=Rome",
    share: async data => shared.push(data), writeText: async url => copied.push(url)
  });
  await click("coinShare");
  assert.equal(shared[0].url, "https://badlight.github.io/josephscoins/coin.html?id=hadrian");
  assert.match(shared[0].title, /Hadrian/);
  await click("coinNext");
  const next = new URL(w.location.href).searchParams.get("id");
  assert.notEqual(next, "hadrian");
  await click("coinShare");
  assert.equal(shared[1].url, "https://badlight.github.io/josephscoins/coin.html?id=" + next);
  assert.deepEqual(copied, []);
  assert.equal(d.getElementById("shareFeedback").hidden, true);
});

test("cancelling native Share leaves the clipboard alone and allows another share", async t => {
  let calls = 0, copied = 0;
  const { d, click } = await setup(t, {
    share: async () => { calls++; throw { name: "AbortError" }; }, writeText: async () => { copied++; }
  });
  await click("coinShare"); await click("coinShare");
  assert.equal(calls, 2); assert.equal(copied, 0);
  assert.equal(d.getElementById("coinShare").disabled, false);
  assert.equal(d.getElementById("shareFeedback").hidden, true);
  assert.equal(d.getElementById("coinDialog").open, true);
});

test("Share copies the canonical link when native sharing is unavailable or fails", async t => {
  for (const share of [undefined, async () => { throw { name: "NotAllowedError" }; }]) {
    const copied = [], { d, click } = await setup(t, { share, writeText: async url => copied.push(url) });
    await click("coinShare");
    assert.deepEqual(copied, ["https://badlight.github.io/josephscoins/coin.html?id=hadrian"]);
    assert.equal(d.getElementById("shareStatus").textContent, "Link copied");
    assert.equal(d.getElementById("shareLink").hidden, true);
    assert.equal(d.getElementById("coinShare").disabled, false);
    await click("coinNext");
    assert.equal(d.getElementById("shareFeedback").hidden, true);
  }
});

test("a blocked clipboard offers one selectable link without arrow keys changing coins", async t => {
  const { w, d, click } = await setup(t, { writeText: async () => { throw Error("Denied"); } });
  await click("coinShare");
  const input = d.getElementById("shareURL"), before = w.location.href;
  assert.equal(d.getElementById("shareLink").hidden, false);
  assert.equal(input.value, "https://badlight.github.io/josephscoins/coin.html?id=hadrian");
  assert.equal(d.activeElement, input);
  assert.equal(input.selectionStart, 0); assert.equal(input.selectionEnd, input.value.length);
  input.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  assert.equal(w.location.href, before);
  await click("coinShare");
  assert.equal(d.querySelectorAll('[aria-label="Coin link"]').length, 1);
  await click("coinNext");
  assert.equal(d.getElementById("shareFeedback").hidden, true); assert.equal(input.value, "");
  await click("coinShare"); await click("dialogClose");
  assert.equal(d.getElementById("coinDialog").open, false);
  assert.equal(d.getElementById("shareFeedback").hidden, true);
});

test("a pending share cannot show stale feedback or prevent sharing the next coin", async t => {
  const writes = []; let finish;
  const { w, d, click } = await setup(t, { writeText: url => {
    writes.push(url);
    return writes.length === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve();
  } });
  await click("coinShare");
  assert.equal(d.getElementById("coinShare").disabled, true);
  await click("coinShare"); assert.equal(writes.length, 1);
  await click("coinNext");
  assert.equal(d.getElementById("coinShare").disabled, false);
  finish(); await flush();
  assert.equal(d.getElementById("shareFeedback").hidden, true);
  await click("coinShare");
  assert.equal(writes.length, 2);
  assert.equal(new URL(writes[1]).searchParams.get("id"), new URL(w.location.href).searchParams.get("id"));
  assert.equal(d.getElementById("shareStatus").textContent, "Link copied");
});
