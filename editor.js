(function () {
  "use strict";
  const K = window.CoinKit, D = {}, FIELDS = ["collection","emperor","denomination","material","mint","officina","emission","class","sub","yearl","yearh","era","weight","diameter","axis","obvL","revL","obvD","revD","exergue","reference","referenceLinks","provenance","provenanceLinks","slug","code","stock"];
  const S = { baseData:null, data:null, changes:[], editing:"", original:null, image:null, autoSlug:true, publishing:false };
  let saveTimer, previewURL, previewBlob, saveQueue = Promise.resolve();
  const el = (tag,cls,value) => { const x=document.createElement(tag); if(cls)x.className=cls; if(value!==undefined)x.textContent=value; return x; };
  document.addEventListener("DOMContentLoaded",init);
  async function init() {
    for(const id of [...FIELDS,"coinForm","newCoin","editSelect","reloadCatalogue","jsonFile","loadStatus","formHeading","draftStatus","image","imageHint","slugHint","suggestSlug","stageRecord","clearForm","formStatus","photo","photoImg","photoPlaceholder","previewTitle","previewMeta","previewSlug","previewWeight","previewReference","catalogueCount","batchCount","batchEmpty","batchList","batchStatus","publishSettings","githubToken","publishBatch","downloadBatch","downloadLinks","rulers","denoms","mints","subcollections"]) D[id]=document.getElementById(id);
    D.coinForm.addEventListener("submit",stage);
    D.coinForm.addEventListener("input",event => {
      if (event.target===D.slug) S.autoSlug=false;
      if (["emperor","denomination"].includes(event.target.id) && S.autoSlug && !S.editing) D.slug.value=K.suggest(S.data,D.emperor.value,D.denomination.value);
      preview(); scheduleSave();
    });
    D.coinForm.addEventListener("change",event => { if(event.target!==D.image){preview();scheduleSave();} });
    D.image.addEventListener("change",() => {
      const file=D.image.files[0]||null;
      if(file && file.size>20*1024*1024){status("formStatus","The photograph must be smaller than 20 MB.","bad");D.image.value="";return;}
      S.image=file; preview(); scheduleSave();
    });
    D.newCoin.addEventListener("click",() => { resetForm(); persist().catch(storageError); });
    D.clearForm.addEventListener("click",() => { if(S.editing)loadRecord(S.editing);else resetForm();persist().catch(storageError); });
    D.editSelect.addEventListener("change",() => { if(D.editSelect.value)loadRecord(D.editSelect.value);else resetForm();persist().catch(storageError); });
    D.suggestSlug.addEventListener("click",() => { S.autoSlug=true;D.slug.value=K.suggest(S.data,D.emperor.value,D.denomination.value);preview();scheduleSave(); });
    D.reloadCatalogue.addEventListener("click",reload);
    D.jsonFile.addEventListener("change",async () => {
      const file=D.jsonFile.files[0];if(!file)return;
      try {
        const data=JSON.parse(await file.text());K.validate(data);
        if(S.changes.length)throw Error("Publish or download the pending batch before loading a different catalogue.");
        S.baseData=data;S.data=structuredClone(data);resetForm();refresh();await persist();
        status("loadStatus","Loaded "+K.normalize(data).length+" coins from "+file.name+".","good");
      } catch(error){status("loadStatus",error.message,"bad");}
    });
    D.publishBatch.addEventListener("click",publish);
    D.downloadBatch.addEventListener("click",download);
    window.addEventListener("pagehide",() => { clearTimeout(saveTimer); if(S.data)persist().catch(()=>{}); });
    document.addEventListener("visibilitychange",() => { if(document.visibilityState==="hidden"&&S.data)persist().catch(()=>{}); });
    try {
      const [data,saved]=await Promise.all([fetchCatalogue(),window.CoinDrafts.read().catch(()=>null)]);
      S.baseData=data;S.data=structuredClone(data);
      if(saved && Array.isArray(saved.changes) && saved.changes.length) {
        S.changes=saved.changes;
        try {S.data=K.mergeChanges(data,S.changes);}
        catch(error) {K.validate(saved.baseData);S.baseData=saved.baseData;S.data=S.changes.reduce((d,c)=>K.upsert(d,c),structuredClone(S.baseData));status("batchStatus",error.message,"bad");}
      }
      refresh(); const requested=new URL(location.href).searchParams.get("edit");
      if(requested && K.record(S.data,requested))loadRecord(requested);
      else if(saved && saved.form && Object.values(saved.form).some(value=>value))restoreForm(saved);
      else resetForm();
      status("loadStatus","Loaded "+K.normalize(data).length+" published coins."+(S.changes.length?" Restored "+S.changes.length+" pending change"+(S.changes.length===1?"":"s")+".":""),"good");
      if(saved && saved.form)D.draftStatus.textContent="Saved draft restored.";
      await persist();
    } catch(error){status("loadStatus",error.message,"bad");D.stageRecord.disabled=true;}
  }
  async function fetchCatalogue() {
    const response=await fetch("coins.json?v=20261008",{cache:"no-store"});if(!response.ok)throw Error("Could not load the catalogue. Use Load coins.json or reload.");
    const data=await response.json();K.validate(data);return data;
  }
  async function reload() {
    try {
      const data=await fetchCatalogue(),merged=K.mergeChanges(data,S.changes);
      S.baseData=data;S.data=merged;refresh();await persist();
      status("loadStatus","Latest catalogue loaded; pending changes kept.","good");
    }catch(error){status("loadStatus",error.message,"bad");}
  }
  function status(id,value,kind="") {D[id].textContent=value;D[id].className="status "+kind;}
  function refresh() {
    const coins=K.normalize(S.data), selected=S.editing;
    D.editSelect.replaceChildren(new Option("Choose a coin…",""),...K.sort(coins,"ruler").map(c=>new Option(K.title(c)+" · "+c._key,c._key)));D.editSelect.value=selected;
    for(const [id,values] of [["rulers",coins.map(c=>c.emperor)],["denoms",coins.map(c=>c.denomination)],["mints",coins.map(c=>c.mint)],["subcollections",coins.flatMap(c=>c.sub_collection||[])]]) {
      D[id].replaceChildren(...[...new Set(values.filter(Boolean))].sort().map(value=>Object.assign(document.createElement("option"),{value})));
    }
    D.catalogueCount.textContent=coins.length+" coins";D.batchCount.textContent=S.changes.length;D.batchEmpty.hidden=!!S.changes.length;
    D.batchList.replaceChildren(...S.changes.map(change=>{
      const li=el("li"),label=el("strong","",change.coin.emperor+" · "+change.coin.denomination),meta=el("small","",(change.original?"Edit":"New")+" · "+change.key),actions=el("div","actions");
      const edit=el("button","secondary","Edit"),remove=el("button","secondary","Remove from batch");edit.type=remove.type="button";
      edit.addEventListener("click",()=>{loadRecord(change.key);persist().catch(storageError);D.emperor.focus();});
      remove.addEventListener("click",async ()=>{
        S.changes=S.changes.filter(c=>c.key!==change.key);S.data=S.changes.reduce((d,c)=>K.upsert(d,c),structuredClone(S.baseData));
        if(S.editing===change.key)resetForm();refresh();try{await persist();}catch(error){storageError(error);}
      });
      actions.append(edit,remove);li.append(label,meta,actions);return li;
    }));
    D.publishBatch.disabled=!S.changes.length||S.publishing;D.downloadBatch.disabled=!S.data||S.publishing;D.stageRecord.disabled=!S.data||S.publishing;
    preview();
  }
  function resetForm() {
    D.coinForm.reset();S.editing="";S.original=null;S.image=null;S.autoSlug=true;
    D.slug.readOnly=false;D.image.required=true;D.editSelect.value="";D.formHeading.textContent="New coin";D.stageRecord.textContent="Add to batch";D.suggestSlug.disabled=false;
    D.slug.value=S.data?K.suggest(S.data,"",""):"";D.imageHint.textContent="Choose a JPEG, PNG, or WebP up to 20 MB. A photograph is required for a new coin.";
    status("formStatus","Enter a record to add it to the batch.");preview();
  }
  function loadRecord(key) {
    const record=K.record(S.data,key);if(!record)return;
    D.coinForm.reset();S.editing=key;S.image=null;S.autoSlug=false;
    const staged=S.changes.find(c=>c.key===key);S.original=staged?staged.original:K.record(S.baseData,key);
    const coin=record.coin,values={collection:record.type,emperor:coin.emperor,denomination:coin.denomination,material:coin.material,mint:coin.mint,officina:coin.officina,emission:coin.emission,class:coin.class,sub:(coin.sub_collection||[]).join(", "),
      yearl:Math.abs(coin.yearl),yearh:Math.abs(coin.yearh),era:coin.yearl<0?"BC":"AD",weight:coin.weight,diameter:coin.diameter?parseFloat(coin.diameter):"",axis:coin.axis,obvL:coin.obverse_legend,revL:coin.reverse_legend,obvD:coin.obverse_desc,revD:coin.reverse_desc,exergue:coin.exergue,reference:coin.reference,referenceLinks:K.linkText(coin.reference_links),provenance:coin.provenance,provenanceLinks:K.linkText(coin.provenance_links),slug:coin.file,code:coin.code,stock:coin.stock};
    setFields(values);D.slug.readOnly=true;D.image.required=false;D.suggestSlug.disabled=true;D.editSelect.value=key;
    D.formHeading.textContent="Edit "+coin.emperor;D.stageRecord.textContent="Save changes to batch";D.imageHint.textContent="Keep the existing photograph, or choose a replacement up to 20 MB.";
    status("formStatus","Changes are staged before publishing.");preview();
  }
  function setFields(values) {
    for(const id of FIELDS) {
      const value=values[id]==null?"":String(values[id]);
      if(D[id].tagName==="SELECT"&&value&&!Array.from(D[id].options).some(o=>o.value===value))D[id].append(new Option(value,value));
      D[id].value=value;
    }
  }
  function restoreForm(saved) {
    if(saved.editing && K.record(S.data,saved.editing))loadRecord(saved.editing);else resetForm();
    setFields(saved.form);S.editing=saved.editing||"";S.original=saved.original||null;S.image=saved.image||null;S.autoSlug=saved.autoSlug!==false;
    D.slug.readOnly=!!S.editing;D.suggestSlug.disabled=!!S.editing;D.image.required=!S.editing&&!S.image;preview();
    if(S.image)D.imageHint.textContent="Saved photograph restored: "+(S.image.name||"coin photo")+".";
  }
  function preview() {
    if(!D.previewTitle)return;
    D.previewTitle.textContent=[D.emperor.value,D.denomination.value].filter(Boolean).join(" · ")||"New coin";
    D.previewMeta.textContent=[D.mint.value,K.material(D.material.value)].filter(Boolean).join(" · ");
    D.previewSlug.textContent=D.slug.value||"—";D.previewWeight.textContent=D.weight.value?D.weight.value+" g":"—";D.previewReference.textContent=D.reference.value||"—";
    let source="";
    const staged=S.changes.find(c=>c.key===S.editing), blob=S.image||(staged&&staged.assets&&staged.assets[0]&&staged.assets[0].blob);
    if(blob){if(previewBlob!==blob){if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(blob);previewBlob=blob;}source=previewURL;}
    else {if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;previewBlob=null;}const current=S.editing&&K.record(S.data,S.editing);if(current)source=K.image(current.coin,false);}
    if(source){D.photoImg.hidden=false;D.photoPlaceholder.hidden=true;D.photoImg.src=source;D.photoImg.onload=()=>matchPhotoBackground(D.photoImg);D.photoImg.onerror=()=>{D.photoImg.hidden=true;D.photoPlaceholder.hidden=false;D.photoPlaceholder.textContent="Photograph unavailable";};}
    else{D.photoImg.hidden=true;D.photoPlaceholder.hidden=false;D.photoPlaceholder.textContent="Coin preview";}
  }
  function matchPhotoBackground(image) {
    try {
      const canvas=document.createElement("canvas");canvas.width=canvas.height=32;const context=canvas.getContext("2d",{willReadFrequently:true});context.drawImage(image,0,0,32,32);
      const rgba=context.getImageData(0,0,32,32).data;let total=0,count=0;
      for(let y=0;y<32;y++)for(let x=0;x<32;x++)if((x<5||x>=27)&&(y<5||y>=27)){const i=(y*32+x)*4;if(rgba[i+3]>16){total+=.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2];count++;}}
      const light=count>0&&total/count>145;D.photo.classList.toggle("coin-bg-light",light);D.photo.classList.toggle("coin-bg-dark",!light);
    }catch{}
  }
  function build() {
    if(!S.data)throw Error("Load the catalogue first.");
    D.image.required=!S.editing&&!S.image;
    if(!D.coinForm.reportValidity())throw Error("Complete the required fields.");
    if(!S.editing&&!S.image)throw Error("Choose a photograph for the new coin.");
    const key=S.editing||D.slug.value.trim(),previous=K.record(S.data,key),staged=S.changes.find(c=>c.key===key);
    if(!S.editing&&previous&&!staged)throw Error("That file slug already exists.");
    let lo=Number(D.yearl.value),hi=Number(D.yearh.value);if(D.era.value==="BC"){lo=-Math.abs(lo);hi=-Math.abs(hi);}[lo,hi]=[Math.min(lo,hi),Math.max(lo,hi)];
    const coin={...(previous?previous.coin:{}),emperor:D.emperor.value.trim(),file:D.slug.value.trim(),denomination:D.denomination.value.trim(),mint:D.mint.value.trim(),yearl:lo,yearh:hi};
    const optional={material:D.material.value,officina:D.officina.value.trim(),emission:D.emission.value.trim(),class:D.class.value.trim(),axis:D.axis.value.trim().toUpperCase(),
      obverse_legend:D.obvL.value.trim(),reverse_legend:D.revL.value.trim(),obverse_desc:D.obvD.value.trim(),reverse_desc:D.revD.value.trim(),exergue:D.exergue.value.trim(),reference:D.reference.value.trim(),provenance:D.provenance.value.trim(),code:D.code.value.trim()||"Personal",stock:D.stock.value};
    for(const [field,value]of Object.entries(optional)){if(value)coin[field]=value;else delete coin[field];}
    if(D.weight.value)coin.weight=Number(D.weight.value);else delete coin.weight;
    if(D.diameter.value)coin.diameter=Number(D.diameter.value)+"mm";else delete coin.diameter;
    const subs=[...new Set(D.sub.value.split(",").map(s=>s.trim()).filter(Boolean))];if(subs.length)coin.sub_collection=subs;else delete coin.sub_collection;
    for(const [field,input]of [["reference_links","referenceLinks"],["provenance_links","provenanceLinks"]]){const links=K.parseLinks(D[input].value);if(links.length)coin[field]=links;else delete coin[field];}
    return{key,type:D.collection.value,coin:K.clean(coin),original:staged?staged.original:(S.editing?S.original:null),assets:staged?staged.assets:[]};
  }
  async function assets(file,slug) {
    if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw Error("Choose a JPEG, PNG, or WebP photograph.");
    if(file.size>20*1024*1024)throw Error("The photograph must be smaller than 20 MB.");
    const bitmap=await createImageBitmap(file);
    try {
      const canvas=document.createElement("canvas"),scale=Math.min(1,900/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext("2d");context.fillStyle=D.photo.classList.contains("coin-bg-light")?"#fff":"#000";context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const thumbnail=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error("Could not create the preview photograph.")),"image/jpeg",.88));
      const extension=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg",base="images/"+slug+"/"+slug;
      return[{path:base+" (Small).jpg",blob:thumbnail},{path:base+"."+extension,blob:file}];
    }finally{bitmap.close();}
  }
  async function stage(event) {
    event.preventDefault();if(S.publishing)return;
    try {
      const entry=build();busy(true);clearTimeout(saveTimer);
      if(S.image){entry.assets=await assets(S.image,entry.coin.file);entry.coin.image=entry.assets[0].path;entry.coin.image_large=entry.assets[1].path;}
      const data=K.upsert(S.data,entry);K.validate(data);
      S.data=data;const index=S.changes.findIndex(c=>c.key===entry.key);if(index>=0)S.changes[index]=entry;else S.changes.push(entry);
      await persist();resetForm();refresh();await persist();status("batchStatus","Saved "+S.changes.length+" pending change"+(S.changes.length===1?"":"s")+" in this browser.","good");
    }catch(error){status("formStatus",error.message,"bad");}
    finally{busy(false);refresh();}
  }
  function fields(){return Object.fromEntries(FIELDS.map(id=>[id,D[id].value]));}
  function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist().catch(storageError),350);}
  function persist() {
    if(!S.data)return Promise.resolve();
    const snapshot={version:2,baseData:structuredClone(S.baseData),changes:structuredClone(S.changes),form:fields(),editing:S.editing,original:structuredClone(S.original),image:S.image,autoSlug:S.autoSlug,savedAt:Date.now()};
    saveQueue=saveQueue.catch(()=>{}).then(()=>window.CoinDrafts.save(snapshot));
    return saveQueue.then(()=>{D.draftStatus.textContent="Draft saved "+new Date(snapshot.savedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})+".";});
  }
  function storageError(){D.draftStatus.textContent="Draft could not be saved. Download your batch before closing.";D.draftStatus.setAttribute("role","alert");}
  function busy(value){
    S.publishing=value;
    for(const control of document.querySelectorAll("button,input,select,textarea"))control.disabled=value;
    if(!value){D.suggestSlug.disabled=!!S.editing;D.publishBatch.disabled=!S.changes.length;D.downloadBatch.disabled=!S.data;D.stageRecord.disabled=!S.data;}
  }
  async function publish() {
    if(!S.changes.length||S.publishing)return;
    if(!D.githubToken.value.trim()){D.publishSettings.open=true;D.githubToken.focus();status("batchStatus","Enter a GitHub token for this repository to publish.","bad");return;}
    let token=D.githubToken.value;
    try{
      clearTimeout(saveTimer);await persist();busy(true);
      const result=await window.CoinPublisher.publish({token,changes:structuredClone(S.changes),onProgress:message=>status("batchStatus",message)});
      S.baseData=result.catalogue;S.data=structuredClone(result.catalogue);S.changes=[];resetForm();refresh();
      await persist().catch(storageError);
      status("batchStatus","Committed to GitHub. Checking the live collection…","good");
      const link=el("a","","View commit");link.href=result.url;link.target="_blank";link.rel="noopener noreferrer";D.batchStatus.append(document.createTextNode(" "),link);
      await waitForPages(result);
    }catch(error){status("batchStatus",error.message,"bad");}
    finally{token="";D.githubToken.value="";busy(false);refresh();}
  }
  async function waitForPages(result) {
    for(let attempt=0;attempt<20;attempt++){
      try{
        const response=await fetch("coins.json?published="+result.sha+"&check="+attempt,{cache:"no-store"}),data=await response.json();
        if(K.canonical(data)===K.canonical(result.catalogue)){status("batchStatus","Published. The live collection is up to date.","good");return;}
      }catch{}
      await new Promise(resolve=>setTimeout(resolve,3000));
    }
    status("batchStatus","Saved to GitHub. GitHub Pages is still updating; refresh the gallery shortly.","good");
  }
  function saveDownload(blob,name){
    const url=URL.createObjectURL(blob),link=el("a");link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function download(){
    if(!S.data)return;K.validate(S.data);await persist().catch(storageError);
    saveDownload(new Blob([JSON.stringify(S.data,null,2)+"\n"],{type:"application/json"}),"coins.json");
    D.downloadLinks.replaceChildren();
    for(const change of S.changes)for(const asset of change.assets||[]){
      const url=URL.createObjectURL(asset.blob),a=el("a","","Download "+asset.path.split("/").pop());a.href=url;a.download=asset.path.split("/").pop();a.title="Place in "+asset.path.substring(0,asset.path.lastIndexOf("/")+1);D.downloadLinks.append(a);
      saveDownload(asset.blob,a.download);
    }
    status("batchStatus","Catalogue downloaded. Photograph downloads are also listed below; keep the shown folder structure.");
  }
})();
