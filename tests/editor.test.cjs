"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),{JSDOM}=require("jsdom");
const K=require("../coin-utils.js"),data=JSON.parse(fs.readFileSync(path.join(__dirname,"../coins.json"),"utf8")),html=fs.readFileSync(path.join(__dirname,"../add-coin.html"),"utf8");
async function until(check){for(let i=0;i<200;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}assert.fail("Timed out waiting for editor state");}
async function editor(saved=null,options={}){
  const dom=new JSDOM(html,{url:"https://badlight.github.io/josephscoins/add-coin.html",runScripts:"outside-only"}),w=dom.window,store={value:saved,writes:0,fail:false,published:null,remote:data};
  w.structuredClone=structuredClone;w.fetch=async()=>({ok:true,json:async()=>structuredClone(store.remote)});
  w.URL.createObjectURL=()=>"blob:test-image";w.URL.revokeObjectURL=()=>{};w.Element.prototype.scrollIntoView=()=>{};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.CoinDrafts={read:async()=>{if(options.readError)throw Error("Read failed");return structuredClone(store.value);},save:async value=>{if(store.fail)throw Error("Storage full");store.value=structuredClone(value);store.writes++;}};
  w.CoinPublisher={publish:async({changes,token})=>{assert.equal(token,"test-token");store.published=structuredClone(changes);store.remote=K.mergeChanges(store.remote,changes);return {catalogue:store.remote,sha:"test-commit",url:"https://github.com/badlight/josephscoins/commit/test"};}};
  for(const name of ["coin-utils.js","editor-workspace.js","editor.js"])vm.runInContext(fs.readFileSync(path.join(__dirname,"..",name),"utf8"),dom.getInternalVMContext());
  await until(()=>w.document.getElementById("loadStatus").textContent!=="Loading catalogue…");
  const get=id=>w.document.getElementById(id),fill=(node,value)=>{node.value=value;node.dispatchEvent(new w.Event("input",{bubbles:true}));node.dispatchEvent(new w.Event("change",{bubbles:true}));},open=id=>{get("editSelect").value=id;get("editSelect").dispatchEvent(new w.Event("change",{bubbles:true}));};
  return {dom,w,store,get,fill,open,close:()=>dom.window.close()};
}
test("the real editor keeps two unstaged forms when switching immediately and restores both after reload",async()=>{
  const e=await editor();try{
    e.open("hadrian");e.fill(e.get("mint"),"Unstaged A");e.open("justiniani8");e.fill(e.get("mint"),"Unstaged B");e.open("hadrian");assert.equal(e.get("mint").value,"Unstaged A");await until(()=>e.store.value?.drafts?.hadrian?.form.mint==="Unstaged A");
    const restored=await editor(e.store.value);try{restored.open("justiniani8");assert.equal(restored.get("mint").value,"Unstaged B");restored.open("hadrian");assert.equal(restored.get("mint").value,"Unstaged A");assert.equal(restored.get("queueTotal").textContent,"2");}finally{restored.close();}
  }finally{e.close();}
});
test("table search, selection, bulk updates, changed-field review, and one ready publication preserve unfinished work",async()=>{
  const e=await editor();try{
    e.fill(e.get("tableSearch"),"Hadrian");assert.equal(e.get("catalogueRows").children.length,1);e.fill(e.get("tableSearch"),"Gold");assert.equal(e.get("catalogueRows").children.length,K.normalize(data).filter(c=>K.materialGroup(c.material)==="Gold").length);e.fill(e.get("tableSearch"),"");
    for(const id of ["hadrian","justiniani8"]){const c=e.w.document.querySelector('tr[data-id="'+id+'"] input[type=checkbox]');c.click();}
    assert.equal(e.get("selectionCount").textContent,"2 selected");e.get("bulkMintEnabled").click();e.fill(e.get("bulkMint"),"Batch mint");e.get("applyBulk").click();await until(()=>e.get("tableStatus").textContent.includes("Saved changes"));
    const drafts=e.store.value.drafts;for(const id of ["hadrian","justiniani8"]){assert.equal(drafts[id].form.mint,"Batch mint");assert.equal(drafts[id].form.weight,String(K.record(data,id).coin.weight||""));assert.equal(drafts[id].form.obvL,K.record(data,id).coin.obverse_legend||"");}
    e.get("reviewTab").click();assert.equal(e.get("batchList").children.length,2);assert.ok(e.get("batchList").textContent.includes("Mint"));assert.ok(e.get("batchList").textContent.includes("Batch mint"));e.get("prepareAll").click();await until(()=>e.get("publishBatch").textContent.includes("(2)"));
    e.open("hadrian");e.fill(e.get("mint"),"");assert.ok(e.get("editSelect").selectedOptions[0].textContent.includes("Needs details"));assert.equal(e.get("editSelect").selectedOptions[0].textContent.includes("Ready"),false);e.get("reviewTab").click();assert.ok(e.get("reviewCounts").textContent.includes("1 need details"));assert.ok(e.get("publishBatch").textContent.includes("(1)"));e.get("githubToken").value="test-token";e.get("publishBatch").click();await until(()=>e.get("batchStatus").textContent.startsWith("Published."));
    assert.equal(e.store.published.length,1);assert.equal(e.store.published[0].key,"justiniani8");assert.equal(e.store.value.drafts.hadrian.form.mint,"");assert.equal(e.store.value.drafts.justiniani8,undefined);assert.equal(e.get("githubToken").value,"");assert.equal(JSON.stringify(e.store.value).includes("test-token"),false);assert.equal(e.get("queueTotal").textContent,"1");
  }finally{e.close();}
});
test("inline fields persist independently and editing a ready record revokes its ready status",async()=>{
  const e=await editor();try{
    const mint=e.w.document.querySelector('tr[data-id="hadrian"] input[data-field="mint"]');e.fill(mint,"Inline mint");e.get("reviewTab").click();e.get("prepareAll").click();await until(()=>e.get("publishBatch").textContent.includes("(1)"));
    e.get("catalogueTab").click();const weight=e.w.document.querySelector('tr[data-id="hadrian"] input[data-field="weight"]');e.fill(weight,"3.8");await until(()=>e.store.value?.drafts.hadrian.form.weight==="3.8");assert.equal(e.store.value.drafts.hadrian.ready,false);e.open("hadrian");assert.equal(e.get("mint").value,"Inline mint");assert.equal(e.get("weight").value,"3.8");
  }finally{e.close();}
});
test("deletion undo restores unfinished edits and discard returns to the published record",async()=>{
  const e=await editor();try{
    e.open("hadrian");e.fill(e.get("mint"),"Kept on undo");e.get("deleteCoin").click();assert.equal(e.get("deleteDialog").open,true);e.get("confirmDelete").click();await until(()=>e.get("batchStatus").textContent.startsWith("Deletion saved"));
    const undo=[...e.get("batchList").querySelectorAll("button")].find(b=>b.textContent==="Undo deletion");undo.click();await until(()=>e.get("batchStatus").textContent.startsWith("Deletion undone"));e.open("hadrian");assert.equal(e.get("mint").value,"Kept on undo");
    e.get("clearForm").click();assert.equal(e.get("discardDialog").open,true);e.get("confirmDiscard").click();await until(()=>e.get("batchStatus").textContent==="Draft discarded.");assert.equal(e.get("mint").value,K.record(data,"hadrian").coin.mint);assert.equal(e.get("queueTotal").textContent,"0");
  }finally{e.close();}
});
test("a storage failure keeps the forms in memory, exposes retry, and successfully saves both on retry",async()=>{
  const e=await editor();try{
    e.store.fail=true;e.open("hadrian");e.fill(e.get("mint"),"Not lost after storage failure");await until(()=>!e.get("retrySave").hidden);e.open("justiniani8");e.fill(e.get("reference"),"Second retained draft");e.open("hadrian");assert.equal(e.get("mint").value,"Not lost after storage failure");
    e.store.fail=false;e.get("retrySave").click();await until(()=>e.get("retrySave").hidden);assert.equal(e.store.value.drafts.hadrian.form.mint,"Not lost after storage failure");assert.equal(e.store.value.drafts.justiniani8.form.reference,"Second retained draft");
  }finally{e.close();}
});
test("an unreadable saved workspace cannot be silently replaced with an empty draft",async()=>{
  const e=await editor(null,{readError:true});try{assert.ok(e.get("loadStatus").textContent.includes("protect your existing work"));assert.equal(e.store.writes,0);assert.equal(e.get("newCoin").disabled,true);}finally{e.close();}
});
test("manager HTML uses unique IDs, linked tabs, and a single review/publish destination",()=>{
  const dom=new JSDOM(html),doc=dom.window.document,ids=[...doc.querySelectorAll("[id]")].map(n=>n.id);assert.equal(new Set(ids).size,ids.length);
  for(const tab of doc.querySelectorAll('[role="tab"]'))assert.ok(doc.getElementById(tab.getAttribute("aria-controls")));assert.equal(doc.querySelectorAll("#publishBatch").length,1);dom.window.close();
});
