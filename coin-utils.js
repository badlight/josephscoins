(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CoinKit = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  const TYPES = { roman_imperial: "Roman Imperial", roman_provincial: "Roman Provincial", byzantine: "Byzantine" };
  const MATERIALS = { AE: "Bronze / copper alloy", AR: "Silver", BI: "Billon", OB: "Gold", AV: "Gold", AU: "Gold", EL: "Electrum" };
  const ALIASES = {
    "Alexius": "Alexios", "Komnenos": "Comnenus", "Ducas": "Doukas",
    "London": "Londinium", "Treveri": "Trier", "Arelate": "Arles",
    "Cyzicus": "Kyzikos", "Constantinople": "Constantinopolis Istanbul",
    "Thessaloniki": "Thessalonica", "Nicomedia": "Izmit", "Heraclea": "Herakleia"
  };
  const SORTS = ["original", "oldest", "newest", "ruler", "mint", "denomination"];
  const clone = value => structuredClone(value);
  const present = value => value !== null && value !== undefined && value !== "" && value !== "-";
  function text(value) { return String(value == null ? "" : value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[–—]/g, "-"); }
  function normalize(data) {
    const coins = [];
    for (const section of Array.isArray(data) ? data : []) {
      for (const [type, records] of Object.entries(section || {})) {
        for (const wrapper of Array.isArray(records) ? records : []) {
          for (const [key, coin] of Object.entries(wrapper || {})) {
            if (coin && typeof coin === "object" && coin.file) coins.push({ ...clean(coin), _key: key, _type: type, _typeLabel: TYPES[type] || type, _order: coins.length });
          }
        }
      }
    }
    return coins;
  }
  function material(value) { return MATERIALS[String(value || "").toUpperCase()] || value || ""; }
  function materialGroup(value) { const code = String(value || "").toUpperCase(); return ["OB", "AV", "AU"].includes(code) ? "Gold" : material(code); }
  function year(value) { return value < 0 ? Math.abs(value) + " BC" : value + " AD"; }
  function date(coin) {
    const lo = coin.yearl == null || coin.yearl === "" ? null : Number(coin.yearl);
    const hi = coin.yearh == null || coin.yearh === "" ? null : Number(coin.yearh);
    if (!Number.isFinite(lo) && !Number.isFinite(hi)) return "";
    if (!Number.isFinite(lo)) return year(hi);
    if (!Number.isFinite(hi) || lo === hi) return year(lo);
    if (lo < 0 && hi < 0) return Math.abs(lo) + "–" + Math.abs(hi) + " BC";
    if (lo >= 0 && hi >= 0) return lo + "–" + hi + " AD";
    return year(lo) + "–" + year(hi);
  }
  function image(coin, large) {
    if (large) return coin.image_large || "images/" + encodeURIComponent(coin.file) + "/" + encodeURIComponent(coin.file) + ".jpg";
    return coin.image || "images/" + encodeURIComponent(coin.file) + "/" + encodeURIComponent(coin.file) + "%20(Small).jpg";
  }
  function title(coin) { return [coin.emperor || "Unattributed", coin.denomination, date(coin)].filter(present).join(" · "); }
  function searchText(coin) {
    const values = [coin._key, coin.file, coin.emperor, coin.material, material(coin.material), coin.denomination, coin.mint, coin.officina, coin.emission, coin.reference,
      coin.obverse_legend, coin.reverse_legend, coin.exergue, coin.obverse_desc, coin.reverse_desc, coin.provenance, coin._typeLabel, coin.class,
      coin.yearl, coin.yearh, date(coin), coin.class ? "Class " + coin.class : "", coin.weight, coin.diameter, ...(coin.sub_collection || [])];
    let s = values.filter(present).join(" ");
    for (const [name, alias] of Object.entries(ALIASES)) if (text(s).includes(text(name))) s += " " + alias;
    return text(s);
  }
  function matches(coin, state, except) {
    for (const [field, property] of [["collection", "_type"], ["ruler", "emperor"], ["mint", "mint"], ["denomination", "denomination"]]) {
      if (field !== except && state[field] && coin[property] !== state[field]) return false;
    }
    if (except !== "material" && state.material && materialGroup(coin.material) !== state.material) return false;
    if (except !== "sub" && state.sub && !(coin.sub_collection || []).includes(state.sub)) return false;
    const tokens = text(state.q || "").trim().split(/\s+/).filter(Boolean), haystack = searchText(coin);
    return tokens.every(token => {
      if (haystack.includes(token)) return true;
      if (/^-?\d{1,4}$/.test(token)) return Number(token) >= Number(coin.yearl) && Number(token) <= Number(coin.yearh);
      const range = token.match(/^(\d{1,4})-(\d{1,4})$/);
      return range ? Number(coin.yearl) <= Number(range[2]) && Number(coin.yearh) >= Number(range[1]) : false;
    });
  }
  function sort(coins, order) {
    const out = [...coins], cmp = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base", numeric: true });
    return out.sort((a, b) => {
      let result = 0;
      if (order === "oldest") result = Number(a.yearl) - Number(b.yearl) || Number(a.yearh) - Number(b.yearh);
      else if (order === "newest") result = Number(b.yearh) - Number(a.yearh) || Number(b.yearl) - Number(a.yearl);
      else if (order === "ruler") result = cmp(a.emperor, b.emperor);
      else if (order === "mint") result = cmp(a.mint, b.mint);
      else if (order === "denomination") result = cmp(a.denomination, b.denomination);
      return result || (a._order || 0) - (b._order || 0) || cmp(a._key, b._key);
    });
  }
  function safeURL(value) {
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
  }
  function links(value) {
    return (Array.isArray(value) ? value : []).map(item => typeof item === "string" ? { label: new URL(safeURL(item) || "https://invalid.local").hostname, url: safeURL(item) } : { label: String(item.label || "Source"), url: safeURL(item.url) }).filter(item => item.url);
  }
  function parseLinks(value) {
    return String(value || "").split("\n").map(line => line.trim()).filter(Boolean).map(line => {
      const split = line.indexOf("|"), label = split < 0 ? "" : line.slice(0, split).trim(), raw = split < 0 ? line : line.slice(split + 1).trim(), url = safeURL(raw);
      if (!url) throw Error("Source links must use a valid https:// address.");
      return { label: label || new URL(url).hostname, url };
    });
  }
  function linkText(value) { return links(value).map(item => item.label + " | " + item.url).join("\n"); }
  function clean(coin) { return Object.fromEntries(Object.entries(coin).filter(([key]) => !key.startsWith("_") && key !== "code")); }
  function withoutRecordCodes(data) {
    const result = clone(data);
    for (const section of result || []) for (const rows of Object.values(section || {})) for (const row of Array.isArray(rows) ? rows : []) {
      for (const coin of Object.values(row || {})) if (coin && typeof coin === "object") delete coin.code;
    }
    return result;
  }
  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
    return JSON.stringify(value);
  }
  function record(data, key) {
    for (const section of data || []) for (const [type, rows] of Object.entries(section || {})) for (const row of Array.isArray(rows) ? rows : []) {
      if (Object.prototype.hasOwnProperty.call(row, key)) return { key, type, coin: clean(clone(row[key])) };
    }
    return null;
  }
  function upsert(data, entry) {
    const result = withoutRecordCodes(data);
    let replaced = false;
    for (const section of result) for (const [type, rows] of Object.entries(section)) {
      for (let index = rows.length - 1; index >= 0; index--) {
        if (!Object.prototype.hasOwnProperty.call(rows[index], entry.key)) continue;
        if (type === entry.type) { rows[index][entry.key] = clean(entry.coin); replaced = true; }
        else { delete rows[index][entry.key]; if (!Object.keys(rows[index]).length) rows.splice(index, 1); }
      }
    }
    if (!replaced) {
      let section = result.find(section => Array.isArray(section[entry.type]));
      if (!section) { section = { [entry.type]: [] }; result.push(section); }
      section[entry.type].push({ [entry.key]: clean(entry.coin) });
    }
    return result;
  }
  function removeRecord(data, key) {
    const result = withoutRecordCodes(data);
    for (const section of result) for (const rows of Object.values(section)) {
      for (let index = rows.length - 1; index >= 0; index--) {
        delete rows[index][key];
        if (!Object.keys(rows[index]).length) rows.splice(index, 1);
      }
    }
    return result;
  }
  function applyChange(data, change) { return change.action === "delete" ? removeRecord(data, change.key) : upsert(data, change); }
  function mergeChanges(remote, changes) {
    let result = withoutRecordCodes(remote);
    for (const change of changes) {
      const current = record(result, change.key);
      if (change.action === "delete" && !change.original) throw Error("Only published coins can be deleted. Remove an unpublished coin from the batch instead.");
      if (change.original) {
        const original = { ...change.original, coin: clean(change.original.coin) };
        if (!current || canonical(current) !== canonical(original)) throw Error("Conflict: " + change.key + " changed on GitHub. Your staged changes are saved; review the latest record before publishing.");
      } else if (current) throw Error("Conflict: " + change.key + " already exists on GitHub. Choose a different file slug.");
      result = applyChange(result, change);
    }
    validate(result);
    return result;
  }
  function validate(data) {
    if (!Array.isArray(data) || !data.length) throw Error("The catalogue must be a non-empty JSON array.");
    const ids = new Set(), files = new Set();
    for (const section of data) for (const [type, rows] of Object.entries(section || {})) {
      if (!Object.prototype.hasOwnProperty.call(TYPES, type) || !Array.isArray(rows)) throw Error("Invalid collection section.");
      for (const row of rows) for (const [key, coin] of Object.entries(row || {})) {
        if (!coin || typeof coin !== "object" || !/^[a-z0-9][a-z0-9-]*$/.test(key) || !/^[a-z0-9][a-z0-9-]*$/.test(coin.file || "")) throw Error("Invalid record ID or image-folder name.");
        if (ids.has(key) || files.has(coin.file)) throw Error("Duplicate record ID or image-folder name: " + key);
        ids.add(key); files.add(coin.file);
        for (const field of ["emperor", "denomination", "mint"]) if (!String(coin[field] || "").trim()) throw Error(key + " needs a " + field + ".");
        if (!Number.isInteger(coin.yearl) || !Number.isInteger(coin.yearh) || coin.yearl === 0 || coin.yearh === 0 || coin.yearl > coin.yearh) throw Error(key + " has an invalid date range.");
        if (present(coin.weight) && (!Number.isFinite(Number(coin.weight)) || Number(coin.weight) <= 0)) throw Error(key + " has an invalid weight.");
        if (coin.sub_collection && !Array.isArray(coin.sub_collection)) throw Error(key + " has invalid collection tags.");
        for (const name of ["reference_links", "provenance_links"]) if (coin[name] && links(coin[name]).length !== coin[name].length) throw Error(key + " has an invalid source link.");
        for (const name of ["image", "image_large"]) {
          if (coin[name] && (!String(coin[name]).startsWith("images/") || String(coin[name]).includes("..") || String(coin[name]).includes("\\"))) throw Error(key + " has an invalid image path.");
        }
      }
    }
    return true;
  }
  function slugify(value) { return text(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function suggest(data, ruler, denomination) {
    const base = slugify([ruler, denomination].filter(Boolean).join("-")) || "coin", used = new Set(normalize(data).flatMap(c => [c._key, c.file]));
    let slug = base, count = 2;
    while (used.has(slug)) slug = base + "-" + count++;
    return slug;
  }
  return { TYPES, MATERIALS, SORTS, present, text, normalize, material, materialGroup, date, image, title, matches, sort, safeURL, links, parseLinks, linkText, clean, withoutRecordCodes, canonical, record, upsert, removeRecord, applyChange, mergeChanges, validate, slugify, suggest };
});

