"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const K=require("../coin-utils.js"),M=require("../editor-workspace.js"),data=JSON.parse(fs.readFileSync(path.join(__dirname,"../coins.json"),"utf8"));
const record=id=>K.record(data,id),workspace=()=>M.migrate(null,data);
function edit(w,id,patch){const d=w.drafts[id]||=M.fromRecord(record(id));return M.touch(d,patch);}
test("separate unfinished records survive serialization, switching, and restoration",()=>{
  const w=workspace();edit(w,"hadrian",{mint:"Draft mint A",weight:"3.25"});edit(w,"justiniani8",{mint:"",reference:"Unfinished source"});w.active="justiniani8";
  const restored=M.migrate(structuredClone(w),data);
  assert.equal(restored.drafts.hadrian.form.mint,"Draft mint A");assert.equal(restored.drafts.hadrian.form.weight,"3.25");assert.equal(restored.drafts.justiniani8.form.mint,"");assert.equal(M.list(restored).length,2);assert.equal(M.changes(restored).length,0);
});
test("legacy staged changes, current form, deletion undo, and photograph assets migrate without loss",async()=>{
  const original=record("hadrian"),other=record("justiniani8"),blob=new Blob(["photo bytes"],{type:"image/jpeg"});
  const change={...original,original,coin:{...original.coin,weight:3.25},assets:[{path:"images/hadrian/a.jpg",blob},{path:"images/hadrian/b.jpg",blob}]};
  const old={version:2,baseData:data,changes:[change,{action:"delete",key:other.key,original:other,previous:{...other,original:other,coin:{...other.coin,mint:"Earlier mint"},assets:[]},assets:[]}],form:{...M.form(other),mint:"Unstaged mint"},editing:other.key,original:other,image:null};
  const w=M.migrate(old,data);
  assert.equal(w.drafts.hadrian.ready,true);assert.equal(w.drafts.hadrian.form.weight,"3.25");assert.equal(await w.drafts.hadrian.assets[0].blob.text(),"photo bytes");assert.equal(w.drafts.justiniani8.action,"delete");assert.equal(w.drafts.justiniani8.previous.form.mint,"Earlier mint");
  const withForm=M.migrate({...old,changes:[change],editing:other.key},data);assert.equal(withForm.drafts.justiniani8.form.mint,"Unstaged mint");assert.equal(withForm.drafts.justiniani8.ready,false);assert.equal(withForm.drafts.hadrian.ready,true);
});
test("new drafts preserve photographs and multiple independent new records",async()=>{
  const w=workspace(),photo=new File(["unprocessed photograph"],"coin.jpg",{type:"image/jpeg"});
  const a=M.fresh(data,"new-a"),b=M.fresh(data,"new-b");M.touch(a,{emperor:"Test A",slug:"new-a"});M.touch(b,{emperor:"Test B",slug:"new-b"});a.image=photo;w.drafts[a.id]=a;w.drafts[b.id]=b;
  const restored=M.migrate(structuredClone(w),data);assert.equal(await restored.drafts[a.id].image.text(),"unprocessed photograph");assert.equal(restored.drafts[b.id].form.emperor,"Test B");assert.equal(M.list(restored).length,2);
});
test("bulk updates apply only chosen fields and preserve distinct measurements, legends, unknown metadata, and unselected coins",()=>{
  const w=workspace();for(const id of ["hadrian","justiniani8"]){w.drafts[id]=M.fromRecord(record(id));w.drafts[id].seed.coin.custom_note="Keep "+id;}
  w.drafts.untouched=M.fresh(data,"untouched");const before=structuredClone(w.drafts),result=M.bulk(w.drafts,["hadrian","justiniani8"],{mint:"New shared mint",material:"AE",emperor:"Shared authority"},{mode:"add",value:"Checked, Study"});
  for(const id of ["hadrian","justiniani8"]){const d=result[id],entry=M.entry(d,data,result);assert.equal(d.form.mint,"New shared mint");for(const field of M.FIELDS.filter(f=>!["mint","material","emperor","sub"].includes(f)))assert.equal(d.form[field],before[id].form[field]);assert.equal(entry.coin.custom_note,"Keep "+id);assert.equal(d.ready,false);assert.ok(d.form.sub.includes("Checked"));}
  assert.deepEqual(w.drafts,before);assert.deepEqual(result.untouched,before.untouched);assert.throws(()=>M.bulk(result,["hadrian"],{weight:"1"}),/cannot be changed in bulk/);assert.throws(()=>M.bulk(result,["hadrian"],{mint:""}),/cannot be empty/);
});
test("sub-collection add, remove, and replace have distinct behavior",()=>{
  const w=workspace();edit(w,"hadrian",{sub:"Original, Keep"});let d=M.bulk(w.drafts,["hadrian"],{},{mode:"add",value:"Keep, New"});assert.equal(d.hadrian.form.sub,"Original, Keep, New");d=M.bulk(d,["hadrian"],{},{mode:"remove",value:"Original"});assert.equal(d.hadrian.form.sub,"Keep, New");d=M.bulk(d,["hadrian"],{},{mode:"replace",value:""});assert.equal(d.hadrian.form.sub,"");
});
test("the review queue shows actual changed fields and further editing revokes readiness",()=>{
  const w=workspace(),d=edit(w,"hadrian",{mint:"Changed mint",weight:"3.25"});d.ready=true;assert.equal(M.changes(w).length,1);assert.deepEqual(M.differences(d).map(x=>x.field),["Mint","Weight (g)"]);M.touch(d,{reference:"A source"});assert.equal(d.ready,false);assert.equal(M.changes(w).length,0);
});
test("only ready valid records publish, and unfinished or invalid records survive successful publication",()=>{
  const w=workspace(),one=edit(w,"hadrian",{mint:"Ready mint"}),two=edit(w,"justiniani8",{mint:""});one.ready=true;two.ready=true;
  const pending=M.fresh(data,"new-incomplete");M.touch(pending,{emperor:"Still researching"});w.drafts[pending.id]=pending;w.active=two.id;
  const changes=M.changes(w);assert.deepEqual(changes.map(c=>c.key),[one.id]);const catalogue=K.mergeChanges(data,changes),after=M.published(w,catalogue,M.ready(w).map(d=>d.id));assert.equal(after.drafts.hadrian,undefined);assert.equal(after.drafts.justiniani8.form.mint,"");assert.equal(after.drafts[pending.id].form.emperor,"Still researching");assert.equal(after.active,two.id);assert.equal(K.record(after.baseData,"hadrian").coin.mint,"Ready mint");
});
test("unsafe, missing, and duplicate metadata are held in draft; remote edit conflicts are still protected",()=>{
  const w=workspace(),d=edit(w,"hadrian",{mint:"",weight:"-1",referenceLinks:"javascript:alert(1)"});d.ready=true;assert.ok(M.errors(d,data,w.drafts).length>=3);assert.equal(M.ready(w).length,0);
  M.touch(d,{mint:"Draft mint",weight:"3.25",referenceLinks:"Source | https://example.com"});d.ready=true;const remote=K.upsert(data,{...record("hadrian"),coin:{...record("hadrian").coin,mint:"Remote mint"}});assert.throws(()=>K.mergeChanges(remote,M.changes(w)),/Conflict/);
  const fresh=M.fresh(data,"new-collision");M.touch(fresh,{slug:"hadrian"});assert.ok(M.errors(fresh,data,w.drafts).some(e=>/already exists/.test(e)));
});
test("deletion and unpublished additions share one batch while original records and IDs remain stable",()=>{
  const w=workspace(),d=edit(w,"hadrian",{mint:"Reviewed"}),removed=M.fromRecord(record("justiniani8"));d.ready=true;removed.action="delete";removed.ready=true;w.drafts[removed.id]=removed;
  const result=K.mergeChanges(data,M.changes(w));assert.equal(K.record(result,"justiniani8"),null);assert.equal(K.record(result,"hadrian").coin.file,"hadrian");assert.equal(K.normalize(result).length,K.normalize(data).length-1);
});
test("IndexedDB round-trips many drafts and image blobs, reports transaction failures, and can retry",async()=>{
  const {indexedDB}=require("fake-indexeddb"),window={indexedDB},context=vm.createContext({window});vm.runInContext(fs.readFileSync(path.join(__dirname,"../draft-store.js"),"utf8"),context);
  const w=workspace();edit(w,"hadrian",{mint:"Saved A"});edit(w,"justiniani8",{mint:"Saved B"});w.drafts.hadrian.image=new Blob(["retained photo"],{type:"image/jpeg"});
  await window.CoinDrafts.save(w);const restored=await window.CoinDrafts.read();assert.equal(restored.drafts.hadrian.form.mint,"Saved A");assert.equal(restored.drafts.justiniani8.form.mint,"Saved B");assert.equal(await restored.drafts.hadrian.image.text(),"retained photo");
  const bad={...w,uncloneable:()=>{}};await assert.rejects(window.CoinDrafts.save(bad));await window.CoinDrafts.save(w);assert.equal((await window.CoinDrafts.read()).drafts.hadrian.form.mint,"Saved A");
});

test("reopening refreshes untouched published records while retaining edited records and conflict baselines",()=>{
  const w=workspace();w.drafts.hadrian=M.fromRecord(record("hadrian"));edit(w,"justiniani8",{reference:"My unfinished research"});w.active="hadrian";
  let remote=K.upsert(data,{...record("hadrian"),coin:{...record("hadrian").coin,mint:"Latest published mint"}});remote=K.upsert(remote,{...record("justiniani8"),coin:{...record("justiniani8").coin,mint:"Another remote update"}});
  const resumed=M.migrate(w,remote);assert.equal(resumed.drafts.hadrian.form.mint,"Latest published mint");assert.equal(M.changed(resumed.drafts.hadrian),false);assert.equal(resumed.drafts.justiniani8.form.reference,"My unfinished research");assert.deepEqual(resumed.drafts.justiniani8.original,record("justiniani8"));
  const removed=M.migrate(w,K.removeRecord(data,"hadrian"));assert.equal(removed.drafts.hadrian,undefined);assert.equal(removed.active,"");assert.ok(removed.drafts.justiniani8);
});
