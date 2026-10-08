(function () {
  "use strict";
  const K = window.CoinKit, D = {}, FILTERS = ["collection", "ruler", "mint", "denomination", "material", "sub"];
  const S = { coins: [], q: "", collection: "", ruler: "", mint: "", denomination: "", material: "", sub: "", sort: "original", compare: [], coin: "" };
  let openedFromGallery = false, zoom = 1, panX = 0, panY = 0, drag = null, searchTimer, photoFallback = false;
  const el = (tag, className, value) => { const x = document.createElement(tag); if (className) x.className = className; if (value !== undefined) x.textContent = value; return x; };
  document.addEventListener("DOMContentLoaded", init);
  function init() {
    for (const id of ["collectionCount","searchInput","sortFilter","collectionFilter","rulerFilter","mintFilter","denominationFilter","materialFilter","subFilter","clearFilters","filterToggle","filterBadge","filterPanel","resultCount","actionStatus","coinGrid","emptyState","emptyClear","errorState","retryLoad","compareTray","compareCount","compareNames","compareOpen","compareClear","coinDialog","dialogClose","coinPrevious","coinNext","coinPosition","coinViewer","imageViewport","detailPhoto","imageStatus","zoomOut","zoomIn","zoomReset","zoomLevel","fullScreen","imageDownload","dialogContent","compareDialog","compareContent","compareClose"]) D[id] = document.getElementById(id);
    D.searchInput.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { S.q = D.searchInput.value; render(); writeURL(S.coin, "replace"); }, 100); });
    for (const field of FILTERS) D[field + "Filter"].addEventListener("change", () => { S[field] = D[field + "Filter"].value; render(); writeURL(S.coin, "replace"); });
    D.sortFilter.addEventListener("change", () => { S.sort = D.sortFilter.value; render(); writeURL(S.coin, "replace"); });
    D.clearFilters.addEventListener("click", clearFilters); D.emptyClear.addEventListener("click", clearFilters);
    D.filterToggle.addEventListener("click", () => { const expanded = D.filterToggle.getAttribute("aria-expanded") !== "true"; D.filterToggle.setAttribute("aria-expanded", String(expanded)); D.filterPanel.classList.toggle("expanded", expanded); });
    D.retryLoad.addEventListener("click", load);
    D.dialogClose.addEventListener("click", closeRequested);
    D.coinDialog.addEventListener("cancel", event => { event.preventDefault(); if (D.coinDialog.classList.contains("viewer-expanded")) { D.coinDialog.classList.remove("viewer-expanded"); D.fullScreen.textContent = "Fullscreen"; updateZoom(); D.fullScreen.focus(); } else closeRequested(); });
    D.coinDialog.addEventListener("click", event => { if (event.target === D.coinDialog) closeRequested(); });
    D.coinPrevious.addEventListener("click", () => advance(-1)); D.coinNext.addEventListener("click", () => advance(1));
    D.coinDialog.addEventListener("keydown", event => { if (event.key === "ArrowLeft") { event.preventDefault(); advance(-1); } if (event.key === "ArrowRight") { event.preventDefault(); advance(1); } });
    D.zoomIn.addEventListener("click", () => setZoom(zoom * 1.5)); D.zoomOut.addEventListener("click", () => setZoom(zoom / 1.5)); D.zoomReset.addEventListener("click", resetZoom);
    D.detailPhoto.addEventListener("dblclick", () => setZoom(zoom === 1 ? 2 : 1));
    D.imageViewport.addEventListener("wheel", event => { if (event.ctrlKey) { event.preventDefault(); setZoom(zoom * (event.deltaY < 0 ? 1.15 : 0.87)); } }, { passive: false });
    D.imageViewport.addEventListener("pointerdown", event => {
      if (zoom <= 1 || event.button > 0) return;
      event.preventDefault(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY, panX, panY };
      D.imageViewport.setPointerCapture(event.pointerId); D.imageViewport.classList.add("dragging");
    });
    D.imageViewport.addEventListener("pointermove", event => { if (!drag || drag.id !== event.pointerId) return; panX = drag.panX + event.clientX - drag.x; panY = drag.panY + event.clientY - drag.y; updateZoom(); });
    for (const event of ["pointerup","pointercancel","lostpointercapture"]) D.imageViewport.addEventListener(event, () => { drag = null; D.imageViewport.classList.remove("dragging"); });
    D.fullScreen.addEventListener("click", async () => {
      if (D.coinDialog.classList.contains("viewer-expanded")) { D.coinDialog.classList.remove("viewer-expanded"); D.fullScreen.textContent = "Fullscreen"; updateZoom(); return; }
      try { if (document.fullscreenElement) await document.exitFullscreen(); else if (D.coinViewer.requestFullscreen) await D.coinViewer.requestFullscreen(); else throw Error(); }
      catch { D.coinDialog.classList.add("viewer-expanded"); D.fullScreen.textContent = "Exit fullscreen"; updateZoom(); }
    });
    document.addEventListener("fullscreenchange", () => { D.fullScreen.textContent = document.fullscreenElement || D.coinDialog.classList.contains("viewer-expanded") ? "Exit fullscreen" : "Fullscreen"; updateZoom(); });
    window.addEventListener("resize", updateZoom);
    D.compareClear.addEventListener("click", () => { S.compare = []; updateCompare(); writeURL(S.coin, "replace"); });
    D.compareOpen.addEventListener("click", compare);
    D.compareClose.addEventListener("click", () => D.compareDialog.close());
    D.compareDialog.addEventListener("click", event => { if (event.target === D.compareDialog) D.compareDialog.close(); });
    window.addEventListener("popstate", applyURL);
    load();
  }
  async function load() {
    D.errorState.hidden = true; D.collectionCount.textContent = "Loading collection…";
    try {
      const response = await fetch("coins.json?v=20261008", { cache: "no-store" });
      if (!response.ok) throw Error("Catalogue unavailable");
      const data = await response.json(); K.validate(data); S.coins = K.normalize(data);
      D.collectionCount.textContent = S.coins.length + " coins"; applyURL();
    } catch (error) { D.coinGrid.replaceChildren(); D.errorState.hidden = false; D.collectionCount.textContent = "Collection unavailable"; D.resultCount.textContent = ""; console.error(error); }
  }
  function applyURL() {
    const url = new URL(location.href);
    S.q = url.searchParams.get("q") || "";
    for (const field of FILTERS) S[field] = url.searchParams.get(field) || "";
    S.sort = K.SORTS.includes(url.searchParams.get("sort")) ? url.searchParams.get("sort") : "original";
    S.compare = [...new Set((url.searchParams.get("compare") || "").split(","))].filter(key => S.coins.some(c => c._key === key)).slice(0,4);
    S.coin = url.searchParams.get("coin") || url.searchParams.get("id") || "";
    D.searchInput.value = S.q; D.sortFilter.value = S.sort; render();
    const browse = url.searchParams.get("browse");
    if (FILTERS.includes(browse)) { D.filterToggle.setAttribute("aria-expanded", "true"); D.filterPanel.classList.add("expanded"); D[browse + "Filter"].focus(); }
    const coin = S.coins.find(c => c._key === S.coin);
    if (coin) showCoin(coin, false, false);
    else {
      if (S.coin) { D.resultCount.textContent = "That coin was not found. Browse the collection below."; S.coin = ""; }
      closeUI(); openedFromGallery = false;
    }
  }
  function writeURL(key, mode) {
    const url = new URL(key ? "coin.html" : "./", location.href);
    if (S.q.trim()) url.searchParams.set("q", S.q.trim());
    for (const field of FILTERS) if (S[field]) url.searchParams.set(field, S[field]);
    if (S.sort !== "original") url.searchParams.set("sort", S.sort);
    if (S.compare.length) url.searchParams.set("compare", S.compare.join(","));
    if (key) url.searchParams.set("id", key);
    history[mode === "push" ? "pushState" : "replaceState"]({ coinViewer: !!key }, "", url);
  }
  function filtered() { return K.sort(S.coins.filter(c => K.matches(c, S)), S.sort); }
  function updateFilters() {
    const values = {
      collection: Object.entries(K.TYPES).filter(([type]) => S.coins.some(c => c._type === type)).map(([value,label]) => ({value,label})),
      ruler: unique(S.coins.map(c => c.emperor)), mint: unique(S.coins.map(c => c.mint)), denomination: unique(S.coins.map(c => c.denomination)),
      material: unique(S.coins.map(c => K.materialGroup(c.material))), sub: unique(S.coins.flatMap(c => c.sub_collection || []))
    };
    const defaults = {collection:"All collections",ruler:"All rulers",mint:"All mints",denomination:"All denominations",material:"All materials",sub:"All sub-collections"};
    for (const field of FILTERS) {
      const options = [new Option(defaults[field], "")], seen = new Set();
      for (const item of values[field]) {
        const value = typeof item === "object" ? item.value : item, label = typeof item === "object" ? item.label : item;
        const test = {...S, [field]:value}, count = S.coins.filter(c => K.matches(c, test)).length, option = new Option(label + " (" + count + ")", value);
        option.disabled = !count && value !== S[field]; options.push(option); seen.add(value);
      }
      if (S[field] && !seen.has(S[field])) options.push(new Option(S[field] + " (0)", S[field]));
      D[field + "Filter"].replaceChildren(...options); D[field + "Filter"].value = S[field];
    }
    const count = FILTERS.filter(field => S[field]).length;
    D.filterBadge.textContent = count ? "(" + count + ")" : "";
  }
  function unique(values) { return [...new Set(values.filter(K.present))].sort((a,b) => a.localeCompare(b,undefined,{sensitivity:"base",numeric:true})); }
  function render() {
    updateFilters(); const coins = filtered();
    D.coinGrid.replaceChildren(...coins.map(card)); D.emptyState.hidden = !!coins.length; D.errorState.hidden = true;
    D.resultCount.textContent = coins.length + (coins.length === 1 ? " coin" : " coins");
    updateCompare();
  }
  function card(coin) {
    const article = el("article","coin-card"), photo = el("div","coin-photo coin-bg-dark"), button = el("button","coin-open");
    button.type = "button"; button.setAttribute("aria-label","View " + K.title(coin) + ", " + coin.mint + ", " + coin._key);
    const image = el("img"); image.src = K.image(coin,false); image.alt = K.title(coin); image.loading = "lazy"; image.decoding = "async";
    image.addEventListener("load", () => matchBackground(image,photo), {once:true});
    image.addEventListener("error", () => { image.alt = "Photograph unavailable: " + K.title(coin); photo.append(el("span","image-status","Photograph unavailable")); }, {once:true});
    const overlay = el("div","coin-overlay"); overlay.append(el("h2","",coin.emperor),el("p","",[coin.material,coin.denomination].filter(K.present).join(" ")),el("p","",[K.date(coin),coin.mint].filter(K.present).join(" · ")));
    if (coin.reference) overlay.append(el("p","reference",coin.reference));
    button.append(image,el("span","coin-type",coin._typeLabel),overlay); button.addEventListener("click",() => showCoin(coin,true)); photo.append(button);
    const footer = el("div","card-footer"), caption = el("div","card-caption"); caption.append(el("h2","",coin.emperor),el("p","",coin.denomination + " · " + K.date(coin)));
    const label = el("label","compare-toggle"), check = el("input"); check.type = "checkbox"; check.id = "compare-" + coin._key; check.dataset.coin = coin._key;
    check.setAttribute("aria-label","Compare " + K.title(coin) + ", " + coin.mint + ", " + coin._key); check.checked = S.compare.includes(coin._key);
    check.addEventListener("change",() => selectCompare(coin._key,check.checked)); label.append(check,document.createTextNode("Compare")); footer.append(caption,label); article.append(photo,footer); return article;
  }
  function selectCompare(key, checked) {
    if (checked && !S.compare.includes(key)) {
      if (S.compare.length === 4) { announce("You can compare up to four coins."); updateCompare(); return; }
      S.compare.push(key);
    } else if (!checked) S.compare = S.compare.filter(value => value !== key);
    updateCompare(); writeURL(S.coin,"replace");
  }
  function updateCompare() {
    D.compareTray.hidden = !S.compare.length; D.compareCount.textContent = S.compare.length + " selected"; D.compareOpen.disabled = S.compare.length < 2;
    D.compareNames.replaceChildren(...S.compare.map(key => {
      const coin = S.coins.find(c => c._key === key), button = el("button","secondary",coin.emperor + " ×");
      button.type = "button"; button.setAttribute("aria-label","Remove " + K.title(coin) + ", " + key + " from comparison"); button.addEventListener("click",() => selectCompare(key,false)); return button;
    }));
    for (const input of D.coinGrid.querySelectorAll('input[type="checkbox"]')) { input.checked = S.compare.includes(input.dataset.coin); input.disabled = S.compare.length === 4 && !input.checked; }
    const detailButton = document.getElementById("detailCompare");
    if (detailButton) detailButton.textContent = S.compare.includes(S.coin) ? "Remove from comparison" : "Add to comparison";
  }
  function clearFilters() {
    clearTimeout(searchTimer); for (const field of FILTERS) S[field] = ""; S.q = ""; S.sort = "original"; D.searchInput.value = ""; D.sortFilter.value = S.sort;
    render(); writeURL(S.coin,"replace");
  }
  function showCoin(coin, push, write = true) {
    if (push) openedFromGallery = !D.coinDialog.open;
    S.coin = coin._key;
    if (write) writeURL(coin._key,push ? "push" : "replace");
    document.title = K.title(coin) + " · Joseph's Ancient Coins";
    D.dialogContent.replaceChildren(detail(coin)); resetZoom(); photoFallback = false;
    D.coinViewer.classList.remove("coin-bg-light"); D.coinViewer.classList.add("coin-bg-dark"); D.imageStatus.textContent = "Loading full-resolution photograph…";
    D.detailPhoto.onload = () => { matchBackground(D.detailPhoto,D.coinViewer); D.imageStatus.textContent = photoFallback ? "Full photo unavailable; showing preview." : ""; updateZoom(); };
    D.detailPhoto.onerror = () => {
      if (!photoFallback) { photoFallback = true; D.detailPhoto.src = K.image(coin,false); }
      else D.imageStatus.textContent = "Photograph unavailable.";
    };
    D.detailPhoto.alt = K.title(coin); D.detailPhoto.src = K.image(coin,true);
    D.imageDownload.href = K.image(coin,true); D.imageDownload.download = coin.file + "." + (K.image(coin,true).split(".").pop() || "jpg");
    let coins = filtered(); if (!coins.some(c => c._key === coin._key)) coins = K.sort(S.coins,S.sort);
    const index = coins.findIndex(c => c._key === coin._key);
    D.coinPosition.textContent = (index + 1) + " of " + coins.length; D.coinPrevious.disabled = index <= 0; D.coinNext.disabled = index >= coins.length - 1;
    if (!D.coinDialog.open) D.coinDialog.showModal();
    D.coinDialog.scrollTop = 0; D.dialogClose.focus();
    updateCompare();
  }
  function closeUI() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    D.coinDialog.classList.remove("viewer-expanded"); D.fullScreen.textContent = "Fullscreen";
    if (D.coinDialog.open) D.coinDialog.close();
    document.title = "Joseph's Ancient Coins";
  }
  function closeRequested() {
    closeUI(); S.coin = "";
    if (openedFromGallery) { openedFromGallery = false; history.back(); }
    else writeURL("","replace");
  }
  function advance(direction) {
    const coin = S.coins.find(c => c._key === S.coin); if (!coin) return;
    let coins = filtered(); if (!coins.some(c => c._key === coin._key)) coins = K.sort(S.coins,S.sort);
    const next = coins[coins.findIndex(c => c._key === coin._key) + direction]; if (next) showCoin(next,false);
  }
  function detail(coin) {
    const container = el("article"), heading = el("h2","",coin.emperor); heading.id = "coinHeading";
    container.append(heading,el("p","detail-subtitle",[K.material(coin.material),coin.denomination,K.date(coin)].filter(K.present).join(" · ")));
    const actions = el("div","detail-actions"), copy = el("button","secondary","Copy coin link"), compareButton = el("button","secondary","Add to comparison");
    copy.type = compareButton.type = "button"; compareButton.id = "detailCompare";
    copy.addEventListener("click",async () => {
      const url = new URL("coin.html",location.href); url.searchParams.set("id",coin._key);
      try { await navigator.clipboard.writeText(url.href); copy.textContent = "Link copied"; announce("Coin link copied."); }
      catch { const input = el("input"); input.readOnly = true; input.value = url.href; input.setAttribute("aria-label","Coin link"); actions.append(input); input.focus(); input.select(); }
    });
    compareButton.addEventListener("click",() => selectCompare(coin._key,!S.compare.includes(coin._key)));
    const edit = el("a","","Edit record"); edit.href = "add-coin.html?edit=" + encodeURIComponent(coin._key); actions.append(copy,compareButton,edit); container.append(actions);
    const facts = el("dl","detail-facts");
    for (const [name,value] of [["Collection",coin._typeLabel],["Mint",coin.mint],["Officina",coin.officina],["Emission",coin.emission],["Class",coin.class],["Weight",K.present(coin.weight) ? coin.weight + " g" : null],["Diameter",coin.diameter],["Axis",coin.axis],["Reference",coin.reference],["Record",coin._key]]) {
      if (!K.present(value)) continue; const row = el("div"); row.append(el("dt","",name),el("dd","",value)); facts.append(row);
    }
    container.append(facts); section(container,"Obverse",coin.obverse_legend,coin.obverse_desc); section(container,"Reverse",coin.reverse_legend,coin.reverse_desc);
    section(container,"Exergue",coin.exergue); section(container,"Catalogue sources",null,null,coin.reference_links);
    section(container,"Provenance",null,coin.provenance,coin.provenance_links);
    if ((coin.sub_collection || []).length) {
      const group = el("section","detail-section"); group.append(el("h3","","Sub-collections")); const tags = el("div","detail-tags");
      for (const value of coin.sub_collection) { const button = el("button","tag-button secondary",value); button.type = "button"; button.addEventListener("click",() => { S.sub = value; closeUI(); S.coin = ""; openedFromGallery = false; writeURL("","replace"); render(); D.subFilter.focus(); }); tags.append(button); }
      group.append(tags); container.append(group);
    }
    return container;
  }
  function section(parent,heading,legend,description,sources) {
    const refs = K.links(sources); if (!K.present(legend) && !K.present(description) && !refs.length) return;
    const group = el("section","detail-section"); group.append(el("h3","",heading));
    if (K.present(legend)) group.append(el("p","legend",legend)); if (K.present(description)) group.append(el("p","",description));
    if (refs.length) { const list = el("ul","source-links"); for (const source of refs) { const li = el("li"), a = el("a","",source.label); a.href = source.url; a.target = "_blank"; a.rel = "noopener noreferrer"; li.append(a); list.append(li); } group.append(list); }
    parent.append(group);
  }
  function compare() {
    const coins = S.compare.map(key => S.coins.find(c => c._key === key)).filter(Boolean); if (coins.length < 2) return;
    const table = el("table","comparison-table"), caption = el("caption","sr-only","Selected coin comparison"); table.append(caption);
    const head = el("thead"), row = el("tr"), corner = el("th","row-label","Coin"); corner.scope = "col"; row.append(corner);
    for (const coin of coins) {
      const th = el("th","coin-column"); th.scope = "col"; th.append(document.createTextNode(K.title(coin)));
      const image = el("img","compare-photo"); image.src = K.image(coin,false); image.alt = K.title(coin); image.addEventListener("load",() => matchBackground(image,image),{once:true});
      const button = el("button","secondary","View coin"); button.type = "button"; button.setAttribute("aria-label","View " + K.title(coin) + ", " + coin._key); button.addEventListener("click",() => { D.compareDialog.close(); showCoin(coin,true); }); th.append(image,button); row.append(th);
    }
    head.append(row); table.append(head); const body = el("tbody");
    const fields = [["Collection",c=>c._typeLabel],["Material",c=>K.material(c.material)],["Mint",c=>c.mint],["Date",K.date],["Denomination",c=>c.denomination],["Weight",c=>K.present(c.weight)?c.weight+" g":""],["Diameter",c=>c.diameter],["Axis",c=>c.axis],["Officina",c=>c.officina],["Class",c=>c.class],["Reference",c=>c.reference],["Obverse legend",c=>c.obverse_legend],["Reverse legend",c=>c.reverse_legend],["Exergue",c=>c.exergue],["Obverse",c=>c.obverse_desc],["Reverse",c=>c.reverse_desc],["Provenance",c=>c.provenance],["Tags",c=>(c.sub_collection||[]).join(" · ")]];
    for (const [name,value] of fields) { const r = el("tr"), th = el("th","row-label",name); th.scope = "row"; r.append(th); for (const coin of coins) r.append(el("td","",K.present(value(coin))?value(coin):"—")); body.append(r); }
    table.append(body); D.compareContent.replaceChildren(table); D.compareDialog.showModal(); D.compareClose.focus();
  }
  function resetZoom() { zoom = 1; panX = panY = 0; updateZoom(); }
  function setZoom(value) { zoom = Math.max(1,Math.min(6,value)); if (zoom === 1) panX = panY = 0; updateZoom(); }
  function updateZoom() {
    if (!D.detailPhoto) return;
    const box = D.imageViewport.getBoundingClientRect(), ratio = D.detailPhoto.naturalWidth / D.detailPhoto.naturalHeight || 2;
    const width = Math.min(box.width,box.height*ratio), height = width/ratio;
    const maxX = Math.max(0,(width*zoom-box.width)/2), maxY = Math.max(0,(height*zoom-box.height)/2);
    panX = Math.max(-maxX,Math.min(maxX,panX)); panY = Math.max(-maxY,Math.min(maxY,panY));
    D.detailPhoto.style.transform = "translate(" + panX + "px," + panY + "px) scale(" + zoom + ")";
    D.imageViewport.classList.toggle("zoomed",zoom>1); D.zoomLevel.textContent = Math.round(zoom*100)+"%"; D.zoomOut.disabled = zoom <= 1; D.zoomIn.disabled = zoom >= 6;
  }
  function matchBackground(image,target) {
    try {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 32; const context = canvas.getContext("2d",{willReadFrequently:true}); context.drawImage(image,0,0,32,32);
      const data = context.getImageData(0,0,32,32).data; let total=0,count=0;
      for (let y=0;y<32;y++) for (let x=0;x<32;x++) if ((y<5||y>=27)&&(x<5||x>=27)) { const i=(y*32+x)*4; if (data[i+3]>16) {total+=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];count++;} }
      const light = count>0 && total/count>145; target.classList.toggle("coin-bg-light",light); target.classList.toggle("coin-bg-dark",!light);
    } catch { target.classList.add("coin-bg-dark"); }
  }
  function announce(message) { D.actionStatus.textContent = message; }
})();
