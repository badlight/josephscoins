(function () {
  "use strict";
  const K=window.CoinKit, M=window.CoinWorkspace, D={};
  const S={W:null,current:null,selected:new Set(),busy:false,revision:0,pending:0,saveFailed:false,discardId:null};
  let saveTimer,saveQueue=Promise.resolve(),previewURL,previewBlob,tableURLs=[];
  const el=(tag,cls,value)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(value!==undefined)node.textContent=value;return node;};
  const button=(text,handler,cls="secondary")=>{const node=el("button",cls,text);node.type="button";node.addEventListener("click",handler);return node;};
  document.addEventListener("DOMContentLoaded",init);
  async function init(){
    for(const node of document.querySelectorAll("[id]"))D[node.id]=node;
    bind();
    try{
      let saved;
      try{saved=await window.CoinDrafts.read();}catch(error){throw Error("Saved drafts could not be read. Reload this page before editing to protect your existing work. "+error.message);}
      let data,offline=false;
      try{data=await fetchCatalogue();}catch(error){if(!saved||!saved.baseData)throw error;K.validate(saved.baseData);data=K.withoutRecordCodes(saved.baseData);offline=true;}
      S.W=M.migrate(saved,data);
      const requested=new URL(location.href).searchParams.get("edit");
      if(requested&&(S.W.drafts[requested]||K.record(data,requested))){ensureDraft(requested);S.W.active=requested;S.W.view="editor";}
      if(!S.W.drafts[S.W.active]||S.W.drafts[S.W.active].action==="delete")createBlank();
      S.current=S.W.drafts[S.W.active];loadCurrent();renderAll();setView(S.W.view||"catalogue",false);
      const restored=M.list(S.W).length;
      status("loadStatus",(offline?"Using your saved catalogue while the live collection is unavailable. ":"Loaded "+K.normalize(data).length+" published coins. ")+(restored?"Restored "+restored+" saved record"+(restored===1?"":"s")+" in your review queue.":""),offline?"":"good");
      await persist();
    }catch(error){status("loadStatus",error.message,"bad");for(const node of document.querySelectorAll("button,input,select,textarea"))node.disabled=true;D.reloadCatalogue.disabled=false;D.reloadCatalogue.onclick=()=>location.reload();}
  }
  function bind(){
    D.coinForm.addEventListener("submit",event=>{event.preventDefault();markReady([S.W.active],"formStatus");});
    D.coinForm.addEventListener("input",event=>{
      if(!S.W||S.busy||event.target===D.image)return;
      const d=S.current,values=fields();
      if(event.target===D.slug)d.autoSlug=false;
      if(["emperor","denomination"].includes(event.target.id)&&d.autoSlug&&!d.editing){values.slug=suggest(values.emperor,values.denomination,d.id);D.slug.value=values.slug;}
      M.touch(d,values);edited();preview();updateCurrentBadge();
    });
    D.coinForm.addEventListener("change",event=>{if(event.target!==D.image&&S.W)flush().catch(storageError);});
    D.image.addEventListener("change",()=>{
      const file=D.image.files[0]||null;if(!file)return;
      if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>20*1024*1024){status("formStatus","Choose a JPEG, PNG, or WebP photograph up to 20 MB.","bad");D.image.value="";return;}
      S.current.image=file;S.current.ready=false;S.current.updatedAt=Date.now();edited();preview();updateCurrentBadge();D.imageHint.textContent="Selected photograph: "+file.name+". Saved with this coin's draft.";flush().catch(storageError);
    });
    D.newCoin.addEventListener("click",()=>{createBlank();openDraft(S.W.active);});
    D.editSelect.addEventListener("change",()=>{if(D.editSelect.value)openDraft(D.editSelect.value);});
    D.clearForm.addEventListener("click",()=>requestDiscard(S.W.active));
    D.suggestSlug.addEventListener("click",()=>{S.current.autoSlug=true;M.touch(S.current,{slug:suggest(D.emperor.value,D.denomination.value,S.current.id)});D.slug.value=S.current.form.slug;edited();preview();});
    D.reloadCatalogue.addEventListener("click",reload);
    D.retrySave.addEventListener("click",()=>flush().catch(storageError));
    D.deleteCoin.addEventListener("click",requestDelete);D.cancelDelete.addEventListener("click",()=>D.deleteDialog.close());D.confirmDelete.addEventListener("click",stageDelete);
    D.cancelDiscard.addEventListener("click",()=>D.discardDialog.close());D.confirmDiscard.addEventListener("click",discard);
    for(const dialog of [D.deleteDialog,D.discardDialog])dialog.addEventListener("cancel",event=>{if(S.busy)event.preventDefault();});
    D.jsonFile.addEventListener("change",importCatalogue);
    for(const view of ["catalogue","editor","review"]){
      D[view+"Tab"].addEventListener("click",()=>setView(view));
      D[view+"Tab"].addEventListener("keydown",event=>{
        const tabs=["catalogue","editor","review"],index=tabs.indexOf(view);let next;
        if(event.key==="ArrowRight")next=tabs[(index+1)%3];else if(event.key==="ArrowLeft")next=tabs[(index+2)%3];else if(event.key==="Home")next=tabs[0];else if(event.key==="End")next=tabs[2];
        if(next){event.preventDefault();setView(next);D[next+"Tab"].focus();}
      });
    }
    D.openReview.addEventListener("click",()=>setView("review"));
    D.tableSearch.addEventListener("input",renderTable);D.tableCollection.addEventListener("change",renderTable);
    D.selectVisible.addEventListener("click",()=>{for(const row of filteredRows())if(row.draft?.action!=="delete")S.selected.add(row.id);renderTable();});
    D.clearSelection.addEventListener("click",()=>{S.selected.clear();renderTable();});
    D.readySelected.addEventListener("click",()=>markReady([...S.selected],"tableStatus"));
    for(const field of ["Ruler","Mint","Material"])D["bulk"+field+"Enabled"].addEventListener("change",()=>{D["bulk"+field].disabled=!D["bulk"+field+"Enabled"].checked;});
    D.bulkTagsMode.addEventListener("change",()=>D.bulkTags.disabled=!D.bulkTagsMode.value);
    D.applyBulk.addEventListener("click",applyBulk);
    D.prepareAll.addEventListener("click",()=>markReady(M.list(S.W).filter(d=>!d.ready).map(d=>d.id),"batchStatus"));
    D.publishBatch.addEventListener("click",publish);D.downloadBatch.addEventListener("click",download);
    window.addEventListener("pagehide",()=>{if(S.W)flush().catch(()=>{});});
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden"&&S.W)flush().catch(storageError);});
  }
  async function fetchCatalogue(){
    const response=await fetch("coins.json?v=20261019",{cache:"no-store"});if(!response.ok)throw Error("Could not load the catalogue. Reload this page or load coins.json.");
    const data=K.withoutRecordCodes(await response.json());K.validate(data);return data;
  }
  async function reload(){
    if(!S.W)return;
    try{await flush();const data=await fetchCatalogue();S.W=M.migrate(S.W,data);if(!S.W.active)createBlank();S.current=S.W.drafts[S.W.active];loadCurrent();renderAll();await persist();status("loadStatus","Latest catalogue loaded. All per-coin drafts have been kept.","good");}
    catch(error){status("loadStatus",error.message,"bad");}
  }
  async function importCatalogue(){
    const file=D.jsonFile.files[0];if(!file||!S.W)return;
    try{
      if(M.list(S.W).length)throw Error("Finish or discard the records in your review queue before loading a different catalogue.");
      const data=K.withoutRecordCodes(JSON.parse(await file.text()));K.validate(data);S.W={version:3,baseData:data,drafts:{},active:"",view:"catalogue"};createBlank();loadCurrent();renderAll();await persist();status("loadStatus","Loaded "+K.normalize(data).length+" coins from "+file.name+".","good");
    }catch(error){status("loadStatus",error.message,"bad");}finally{D.jsonFile.value="";}
  }
  function status(id,value,kind=""){D[id].textContent=value;D[id].className="status "+kind;}
  function fields(){return Object.fromEntries(M.FIELDS.map(id=>[id,D[id].value]));}
  function ensureDraft(id){
    if(S.W.drafts[id])return S.W.drafts[id];const record=K.record(S.W.baseData,id);if(!record)throw Error("This coin is unavailable.");
    return S.W.drafts[id]=M.fromRecord(record);
  }
  function suggest(ruler,denomination,exclude){
    const used=new Set([...K.normalize(S.W.baseData).map(c=>c.file),...Object.values(S.W.drafts).filter(d=>d.id!==exclude).map(d=>d.form?.slug)]),base=K.slugify([ruler,denomination].filter(Boolean).join("-"))||"coin";
    let slug=base,n=2;while(used.has(slug))slug=base+"-"+n++;return slug;
  }
  function createBlank(){
    const id="new-"+crypto.randomUUID(),d=M.fresh(S.W.baseData,id);d.form.slug=suggest("","",id);d.initial={...d.form};S.W.drafts[id]=d;S.W.active=id;S.current=d;return d;
  }
  function openDraft(id){
    if(S.busy)return;
    const draft=ensureDraft(id);if(draft.action==="delete"){setView("review");status("batchStatus","Undo the deletion to edit this coin.");return;}
    S.W.active=id;S.current=draft;loadCurrent();setView("editor");renderChooser();D.formHeading.scrollIntoView({block:"start",behavior:"auto"});
  }
  function setView(view,save=true){
    if(!S.W)return;if(!["catalogue","editor","review"].includes(view))view="catalogue";
    S.W.view=view;
    for(const name of ["catalogue","editor","review"]){D[name+"Panel"].hidden=name!==view;D[name+"Tab"].setAttribute("aria-selected",String(name===view));D[name+"Tab"].tabIndex=name===view?0:-1;}
    if(view==="catalogue")renderTable();if(view==="review")renderReview();if(view==="editor")loadCurrent();
    if(save)flush().catch(storageError);
  }
  function loadCurrent(){
    const d=S.current=S.W.drafts[S.W.active];if(!d)return;
    D.coinForm.reset();
    for(const id of M.FIELDS){const value=d.form[id]||"";if(D[id].tagName==="SELECT"&&value&&![...D[id].options].some(o=>o.value===value))D[id].append(new Option(value,value));D[id].value=value;}
    D.slug.readOnly=!!d.editing;D.suggestSlug.disabled=!!d.editing;D.image.required=false;D.deleteCoin.hidden=!d.editing&&!M.changed(d);D.deleteCoin.disabled=S.busy;
    D.formHeading.textContent=d.editing?"Edit "+(d.form.emperor||"coin"):"New coin";
    D.stageRecord.textContent=d.ready?"Ready for publishing":"Mark ready for publishing";
    D.editSelect.value=d.id;
    D.imageHint.textContent=d.image?"Saved photograph: "+(d.image.name||"coin photo")+".":d.editing?"Keep the existing photograph, or choose a replacement up to 20 MB.":"Choose a JPEG, PNG, or WebP up to 20 MB. A photograph is required for a new coin.";
    status("formStatus",d.ready?"This record is ready. Further edits will return it to draft.":"Changes save automatically in this browser.",d.ready?"good":"");updateCurrentBadge();preview();
  }
  function state(d){
    if(!d||!M.changed(d))return {label:"Published",cls:"published"};
    if(d.action==="delete")return {label:"Ready · delete",cls:"deleting"};
    if(M.errors(d,S.W.baseData,S.W.drafts).length)return {label:"Needs details",cls:"incomplete"};
    return d.ready?{label:"Ready",cls:"ready"}:{label:"Draft",cls:"draft"};
  }
  function badge(d){const info=state(d);return el("span","state-badge "+info.cls,info.label);}
  function updateCurrentBadge(){const info=state(S.current);D.formBadge.textContent=info.label==="Published"&&!S.current.editing?"Draft":info.label;D.formBadge.className="state-badge "+info.cls;D.stageRecord.textContent=S.current.ready?"Ready for publishing":"Mark ready for publishing";}
  function edited(){
    S.revision++;if(!S.saveFailed)D.draftStatus.textContent="Saving drafts…";clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist().catch(storageError),350);updateCounts();
  }
  function flush(){clearTimeout(saveTimer);return persist();}
  function persist(){
    if(!S.W)return Promise.resolve();
    const revision=S.revision,savedAt=Date.now(),snapshot=structuredClone({...S.W,savedAt});S.pending++;
    saveQueue=saveQueue.catch(()=>{}).then(()=>window.CoinDrafts.save(snapshot));
    return saveQueue.then(()=>{S.pending--;if(revision===S.revision&&!S.pending){S.saveFailed=false;D.retrySave.hidden=true;D.draftStatus.setAttribute("role","status");D.draftStatus.textContent="All drafts saved · "+new Date(savedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});}},error=>{S.pending--;throw error;});
  }
  function storageError(error){S.saveFailed=true;D.draftStatus.textContent="Drafts could not be saved. Keep this page open and retry.";D.draftStatus.setAttribute("role","alert");D.retrySave.hidden=false;}
  function rows(){
    if(!S.W)return [];const result=[],seen=new Set();
    for(const coin of K.sort(K.normalize(S.W.baseData),"ruler")){const id=coin._key,d=S.W.drafts[id],record=K.record(S.W.baseData,id);result.push({id,draft:d,record,form:d?.form||M.form(record)});seen.add(id);}
    for(const d of Object.values(S.W.drafts))if(!seen.has(d.id)&&M.changed(d))result.push({id:d.id,draft:d,record:d.seed,form:d.form});
    return result;
  }
  function filteredRows(){
    const q=K.text(D.tableSearch.value).trim().split(/\s+/).filter(Boolean),collection=D.tableCollection.value;
    return rows().filter(row=>(!collection||row.form.collection===collection)&&q.every(part=>K.text(Object.values(row.form).join(" ")+" "+row.id).includes(part)));
  }
  function renderChooser(){
    const all=rows();D.editSelect.replaceChildren(new Option("Choose a coin…",""),...all.filter(r=>r.draft?.action!=="delete").map(r=>new Option((r.form.emperor||"New coin")+" · "+(r.form.denomination||r.form.slug)+" · "+(r.draft&&M.changed(r.draft)?state(r.draft).label:r.id),r.id)));D.editSelect.value=S.W.active;
    for(const [id,values]of [["rulers",all.map(r=>r.form.emperor)],["denoms",all.map(r=>r.form.denomination)],["mints",all.map(r=>r.form.mint)],["subcollections",all.flatMap(r=>r.form.sub.split(",").map(s=>s.trim()))]])D[id].replaceChildren(...[...new Set(values.filter(Boolean))].sort().map(value=>Object.assign(document.createElement("option"),{value})));
  }
  function renderAll(){renderChooser();renderTable();renderReview();updateCounts();}
  function updateCounts(){
    if(!S.W)return;const drafts=M.list(S.W),ready=M.ready(S.W),total=K.normalize(S.W.baseData).length;
    D.tableTotal.textContent=total;D.catalogueCount.textContent=total+" published coins";D.queueTotal.textContent=drafts.length;D.batchCount.textContent=drafts.length;
    D.batchEmpty.hidden=!!drafts.length;D.prepareAll.disabled=S.busy||!drafts.some(d=>!d.ready);
    D.publishBatch.disabled=S.busy||!ready.length;D.publishBatch.textContent="Publish ready records ("+ready.length+")";
    D.downloadBatch.disabled=S.busy||!S.W;
    const incomplete=drafts.filter(d=>M.errors(d,S.W.baseData,S.W.drafts).length).length;
    D.reviewCounts.replaceChildren(el("span","state-badge ready",ready.length+" ready"),el("span","state-badge draft",(drafts.length-ready.length-incomplete)+" drafts"),el("span","state-badge incomplete",incomplete+" need details"));
    D.publishSummary.textContent=ready.length?ready.length+" ready record"+(ready.length===1?"":"s")+" will be published in one commit. "+(drafts.length-ready.length)+" unfinished record"+(drafts.length-ready.length===1?"":"s")+" will stay saved.":"Mark complete records ready to include them in the next publication.";
    updateSelection();
  }
  function updateSelection(){D.selectionCount.textContent=S.selected.size+" selected";D.clearSelection.disabled=S.busy||!S.selected.size;D.readySelected.disabled=S.busy||!S.selected.size;D.applyBulk.disabled=S.busy||!S.selected.size;D.applyBulk.textContent="Apply to "+S.selected.size+" selected coin"+(S.selected.size===1?"":"s");}
  function renderTable(){
    if(!S.W)return;for(const url of tableURLs)URL.revokeObjectURL(url);tableURLs=[];
    const visible=filteredRows();D.tableCount.textContent=visible.length+" of "+rows().length+" records";D.tableEmpty.hidden=!!visible.length;
    D.catalogueRows.replaceChildren(...visible.map(row=>{
      const d=row.draft,tr=el("tr",d&&M.changed(d)?"has-draft":"");tr.dataset.id=row.id;
      const choice=el("input");choice.type="checkbox";choice.checked=S.selected.has(row.id);choice.disabled=d?.action==="delete"||S.busy;choice.setAttribute("aria-label","Select "+(row.form.emperor||"new coin")+" "+row.form.slug);choice.addEventListener("change",()=>{if(choice.checked)S.selected.add(row.id);else S.selected.delete(row.id);updateSelection();});
      const selectCell=el("td","select-cell");selectCell.append(choice);tr.append(selectCell);
      const nameCell=el("td","name-cell"),identity=el("div","coin-identity"),image=el("img","table-photo"),info=el("div");image.alt="";image.loading="lazy";
      const blob=d?.image||d?.assets?.[0]?.blob;
      if(blob){image.src=URL.createObjectURL(blob);tableURLs.push(image.src);}else if(row.record)image.src=K.image(row.record.coin,false);else image.hidden=true;
      image.addEventListener("error",()=>image.hidden=true);
      const ruler=tableInput(row,"emperor","Ruler / authority"),meta=el("small","",K.TYPES[row.form.collection]+" · "+row.form.slug);info.append(ruler,meta);identity.append(image,info);nameCell.append(identity);tr.append(nameCell);
      for(const [field,label]of [["denomination","Denomination"],["mint","Mint"],["material","Material"],["weight","Weight (g)"],["sub","Sub-collections"]]){const cell=el("td",field+"-cell");cell.append(tableInput(row,field,label));tr.append(cell);}
      const actions=el("td","row-actions"),stateHolder=el("div","row-state");stateHolder.append(badge(d));const open=button("Open",()=>openDraft(row.id));open.disabled=S.busy||d?.action==="delete";open.setAttribute("aria-label","Open "+(row.form.emperor||"new coin")+" "+row.form.slug);actions.append(stateHolder,open);tr.append(actions);return tr;
    }));updateSelection();
  }
  function tableInput(row,field,label){
    const input=el(field==="material"?"select":"input");
    if(field==="material")for(const [value,text]of [["","—"],["AE","AE"],["AR","AR"],["BI","BI"],["OB","OB"],["AV","AV"],["AU","AU"],["EL","EL"]])input.append(new Option(text,value));
    else if(field==="weight"){input.type="number";input.min=".001";input.max="5000";input.step="any";}else{input.type="text";input.maxLength={emperor:180,denomination:100,mint:120,sub:600}[field];if(field==="emperor")input.setAttribute("list","rulers");if(field==="mint")input.setAttribute("list","mints");}
    if(field==="material"&&row.form[field]&&![...input.options].some(o=>o.value===row.form[field]))input.append(new Option(row.form[field],row.form[field]));
    input.value=row.form[field]||"";input.disabled=S.busy||row.draft?.action==="delete";input.setAttribute("aria-label",label+" for "+(row.form.slug||row.id));input.dataset.field=field;
    input.addEventListener("input",()=>{
      const draft=ensureDraft(row.id);M.touch(draft,{[field]:input.value});if(S.W.active===row.id)S.current=draft;
      const holder=input.closest("tr").querySelector(".row-state");holder.replaceChildren(badge(draft));input.closest("tr").classList.add("has-draft");edited();
    });
    input.addEventListener("change",()=>flush().catch(storageError));return input;
  }
  async function applyBulk(){
    if(S.busy||!S.selected.size)return;
    try{
      const patch={};for(const [name,field]of [["Ruler","emperor"],["Mint","mint"],["Material","material"]])if(D["bulk"+name+"Enabled"].checked)patch[field]=D["bulk"+name].value.trim();
      const tags=D.bulkTagsMode.value?{mode:D.bulkTagsMode.value,value:D.bulkTags.value}:null;
      if(!Object.keys(patch).length&&!tags)throw Error("Choose at least one field or a sub-collection action.");
      for(const id of S.selected)ensureDraft(id);
      S.W.drafts=M.bulk(S.W.drafts,[...S.selected],patch,tags);S.current=S.W.drafts[S.W.active];S.revision++;await flush().catch(error=>{storageError(error);throw error;});renderAll();
      status("tableStatus","Saved changes for "+S.selected.size+" selected coin"+(S.selected.size===1?"":"s")+". Review them or mark them ready when complete.","good");
    }catch(error){status("tableStatus",error.message,"bad");if(S.saveFailed)storageError(error);}
  }
  function renderReview(){
    if(!S.W)return;
    D.batchList.replaceChildren(...M.list(S.W).map(d=>{
      const item=el("li","card review-item"),head=el("div","review-item-heading"),title=el("div"),name=el("h3","",[d.form.emperor||"New coin",d.form.denomination].filter(Boolean).join(" · "));
      title.append(name,el("small","",K.TYPES[d.form.collection]+" · "+d.form.slug));head.append(title,badge(d));item.append(head);
      const problems=M.errors(d,S.W.baseData,S.W.drafts),diffs=M.differences(d),details=el("details","change-details"),summary=el("summary","",diffs.length+" changed field"+(diffs.length===1?"":"s")+": "+diffs.slice(0,3).map(x=>x.field).join(", ")+(diffs.length>3?"…":""));
      const diffTable=el("table","change-table"),tableHead=el("thead"),tr=el("tr");for(const value of ["Field","Published","Your draft"])tr.append(el("th","",value));tableHead.append(tr);const body=el("tbody");
      for(const diff of diffs){const row=el("tr");for(const value of [diff.field,diff.before||"—",diff.after||"—"])row.append(el("td","",value));body.append(row);}diffTable.append(tableHead,body);details.append(summary,diffTable);item.append(details);
      if(problems.length){const list=el("ul","validation-list");for(const problem of problems)list.append(el("li","",problem));item.append(list);}
      const actions=el("div","actions");
      if(d.action==="delete")actions.append(button("Undo deletion",()=>undoDelete(d.id)));
      else{
        actions.append(button("Open coin",()=>openDraft(d.id)));
        if(d.ready)actions.append(button("Keep as draft",async()=>{d.ready=false;S.revision++;renderAll();await flush().catch(storageError);}));
        else{const mark=button("Mark ready",()=>markReady([d.id],"batchStatus"),"primary");mark.disabled=!!problems.length;actions.append(mark);}
        actions.append(button("Discard draft",()=>requestDiscard(d.id)));
      }
      for(const control of actions.querySelectorAll("button"))if(S.busy)control.disabled=true;item.append(actions);return item;
    }));updateCounts();
  }
  async function markReady(ids,statusId){
    if(S.busy||!S.W)return;let done=0,invalid=0,unchanged=0,firstError="";
    busy(true);
    try{
      for(const id of ids){
        const d=ensureDraft(id);if(!M.changed(d)){unchanged++;continue;}
        const problems=M.errors(d,S.W.baseData,S.W.drafts);if(problems.length){d.ready=false;invalid++;firstError||=problems[0];continue;}
        try{
          if(d.image&&d.action!=="delete")d.assets=await assets(d.image,d.form.slug);
          K.validate(K.applyChange(S.W.baseData,M.entry(d,S.W.baseData,S.W.drafts)));d.ready=true;d.updatedAt=Date.now();done++;
        }catch(error){d.ready=false;invalid++;firstError||=error.message;}
      }
      S.revision++;await flush();
      status(statusId,done+" record"+(done===1?"":"s")+" ready for publishing."+(invalid?" "+invalid+" need attention. "+firstError:"")+(unchanged?" "+unchanged+" unchanged record"+(unchanged===1?"":"s")+" skipped.":""),invalid?"bad":"good");
    }catch(error){storageError(error);status(statusId,"The ready state could not be saved. Keep this page open and retry saving.","bad");}
    finally{busy(false);renderAll();updateCurrentBadge();D.stageRecord.textContent=S.current.ready?"Ready for publishing":"Mark ready for publishing";}
  }
  function requestDiscard(id){
    if(S.busy)return;const d=S.W.drafts[id];if(!d||!M.changed(d)){status("formStatus","There are no local changes to discard.");return;}
    S.discardId=id;D.discardMessage.textContent="Discard the saved edits for "+(d.form.emperor||"this new coin")+"? "+(d.original?"The published coin will be kept.":"This unpublished coin and its draft photograph will be removed.");D.discardDialog.showModal();D.cancelDiscard.focus();
  }
  async function discard(){
    if(S.busy||!S.discardId)return;const id=S.discardId;
    delete S.W.drafts[id];S.selected.delete(id);
    if(S.W.active===id){if(K.record(S.W.baseData,id)){ensureDraft(id);S.current=S.W.drafts[id];}else createBlank();loadCurrent();}
    S.revision++;D.discardDialog.close();renderAll();await flush().catch(storageError);status("batchStatus","Draft discarded.","good");
  }
  function requestDelete(){
    const d=S.current;if(S.busy||!d)return;
    D.deleteName.textContent=[d.form.emperor,d.form.denomination,d.form.slug].filter(Boolean).join(" · ");
    D.deleteMessage.textContent=d.original?"This deletion will be saved as ready in your review queue. Publish to remove the coin from the gallery, or undo the deletion before publishing.":"This unpublished coin will be removed from your saved drafts.";D.confirmDelete.textContent=d.original?"Delete coin":"Remove draft coin";status("deleteStatus","");D.deleteDialog.showModal();D.cancelDelete.focus();
  }
  async function stageDelete(){
    if(S.busy)return;const d=S.current;
    if(d.original){const previous=structuredClone(d);d.action="delete";d.previous=previous;d.ready=true;d.updatedAt=Date.now();}else delete S.W.drafts[d.id];
    S.selected.delete(d.id);createBlank();loadCurrent();S.revision++;D.deleteDialog.close();renderAll();setView("review",false);await flush().catch(storageError);status("batchStatus",d.original?"Deletion saved to your review queue. You can undo it before publishing.":"Unpublished coin removed.","good");
  }
  async function undoDelete(id){
    const d=S.W.drafts[id];if(!d||S.busy)return;S.W.drafts[id]=d.previous||M.fromRecord(d.original);S.revision++;renderAll();await flush().catch(storageError);status("batchStatus","Deletion undone. Previous edits have been restored.","good");
  }
  function busy(value){
    S.busy=value;for(const control of document.querySelectorAll("button,input,select,textarea"))control.disabled=value;
    if(!value){D.suggestSlug.disabled=!!S.current?.editing;for(const field of ["Ruler","Mint","Material"])D["bulk"+field].disabled=!D["bulk"+field+"Enabled"].checked;D.bulkTags.disabled=!D.bulkTagsMode.value;updateCounts();}
  }
  function preview(){
    const d=S.current;if(!d)return;const f=d.form;
    D.previewTitle.textContent=[f.emperor,f.denomination].filter(Boolean).join(" · ")||"New coin";D.previewMeta.textContent=[f.mint,K.material(f.material)].filter(Boolean).join(" · ");D.previewSlug.textContent=f.slug||"—";D.previewWeight.textContent=f.weight?f.weight+" g":"—";D.previewReference.textContent=f.reference||"—";
    const blob=d.image||d.assets?.[0]?.blob;let source="";
    if(blob){if(previewBlob!==blob){if(previewURL)URL.revokeObjectURL(previewURL);previewURL=URL.createObjectURL(blob);previewBlob=blob;}source=previewURL;}
    else{if(previewURL){URL.revokeObjectURL(previewURL);previewURL=null;previewBlob=null;}if(d.seed)source=K.image(d.seed.coin,false);}
    D.photoImg.hidden=!source;D.photoPlaceholder.hidden=!!source;D.photoPlaceholder.textContent="Coin preview";
    if(source){D.photoImg.src=source;D.photoImg.onload=()=>matchPhotoBackground(D.photoImg);D.photoImg.onerror=()=>{D.photoImg.hidden=true;D.photoPlaceholder.hidden=false;D.photoPlaceholder.textContent="Photograph unavailable";};}
  }
  function matchPhotoBackground(image){
    try{const canvas=document.createElement("canvas");canvas.width=canvas.height=32;const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(image,0,0,32,32);const rgba=ctx.getImageData(0,0,32,32).data;let total=0,count=0;
      for(let y=0;y<32;y++)for(let x=0;x<32;x++)if((x<5||x>=27)&&(y<5||y>=27)){const i=(y*32+x)*4;if(rgba[i+3]>16){total+=.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2];count++;}}
      const light=count>0&&total/count>145;D.photo.classList.toggle("coin-bg-light",light);D.photo.classList.toggle("coin-bg-dark",!light);
    }catch{}
  }
  async function assets(file,slug){
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>20*1024*1024)throw Error("Choose a JPEG, PNG, or WebP photograph up to 20 MB.");
    const bitmap=await createImageBitmap(file);
    try{const canvas=document.createElement("canvas"),scale=Math.min(1,900/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext("2d");ctx.fillStyle=D.photo.classList.contains("coin-bg-light")?"#fff":"#000";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const thumb=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error("Could not create the preview photograph.")),"image/jpeg",.88)),extension=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg",base="images/"+slug+"/"+slug;
      return [{path:base+" (Small).jpg",blob:thumb},{path:base+"."+extension,blob:file}];
    }finally{bitmap.close();}
  }
  async function publish(){
    if(S.busy||!M.ready(S.W).length)return;
    if(!D.githubToken.value.trim()){D.publishSettings.open=true;D.githubToken.focus();status("batchStatus","Enter a GitHub token for this repository to publish.","bad");return;}
    let token=D.githubToken.value;
    try{
      busy(true);await flush();const ids=M.ready(S.W).map(d=>d.id),changes=M.changes(S.W);
      const result=await window.CoinPublisher.publish({token,changes:structuredClone(changes),onProgress:message=>status("batchStatus",message)});
      S.W=M.published(S.W,result.catalogue,ids);for(const id of ids)S.selected.delete(id);if(!S.W.active)createBlank();S.current=S.W.drafts[S.W.active];loadCurrent();S.revision++;await persist().catch(storageError);renderAll();
      status("batchStatus","Committed "+ids.length+" ready record"+(ids.length===1?"":"s")+". Unfinished drafts kept. Checking the live collection…","good");
      await waitForPages(result);
    }catch(error){status("batchStatus",error.message,"bad");}
    finally{token="";D.githubToken.value="";busy(false);renderAll();}
  }
  async function waitForPages(result){
    for(let attempt=0;attempt<20;attempt++){
      try{const response=await fetch("coins.json?published="+result.sha+"&check="+attempt,{cache:"no-store"}),data=await response.json();if(K.canonical(data)===K.canonical(result.catalogue)){status("batchStatus","Published. The live collection is up to date; unfinished drafts are still saved.","good");return;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,3000));
    }
    status("batchStatus","Saved to GitHub. GitHub Pages is still updating; refresh the gallery shortly.","good");
  }
  function saveDownload(blob,name){const url=URL.createObjectURL(blob),link=el("a");link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  async function download(){
    if(!S.W)return;
    try{await flush();const changes=M.changes(S.W),data=changes.reduce((value,change)=>K.applyChange(value,change),structuredClone(S.W.baseData));K.validate(data);saveDownload(new Blob([JSON.stringify(data,null,2)+"\n"],{type:"application/json"}),"coins.json");D.downloadLinks.replaceChildren();
      for(const change of changes)for(const asset of change.assets||[]){const url=URL.createObjectURL(asset.blob),a=el("a","","Download "+asset.path.split("/").pop());a.href=url;a.download=asset.path.split("/").pop();a.title="Place in "+asset.path.substring(0,asset.path.lastIndexOf("/")+1);D.downloadLinks.append(a);saveDownload(asset.blob,a.download);}
      status("batchStatus","Downloaded the catalogue with ready records applied. Unfinished drafts remain saved in this browser.","good");
    }catch(error){status("batchStatus",error.message,"bad");}
  }
})();
