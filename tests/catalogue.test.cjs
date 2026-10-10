"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const K=require("../coin-utils.js"),P=require("../github-publisher.js");
const data=JSON.parse(fs.readFileSync(path.join(__dirname,"../coins.json"),"utf8"));
function addition(key) { return {key,type:"roman_imperial",coin:{emperor:"Test ruler",file:key,denomination:"Follis",material:"AE",mint:"Rome",yearl:300,yearh:305},original:null,assets:[]}; }
function mockAPI(remote=data,{race=false,denied=false}={}) {
  const calls=[];
  const fetcher=async (url,options)=>{
    assert.ok(url.startsWith("https://api.github.com/repos/badlight/josephscoins/"));
    assert.ok(!url.includes("test-token"));assert.equal(options.headers.Authorization,"Bearer test-token");
    const route=url.split("badlight/josephscoins/")[1],body=options.body&&JSON.parse(options.body);calls.push({route,method:options.method,body});
    let result,status=200;
    if(denied){status=403;result={message:"Denied"};}
    else if(route==="git/ref/heads/master")result={object:{sha:"head"}};
    else if(route==="git/commits/head")result={tree:{sha:"base-tree"}};
    else if(route==="contents/coins.json?ref=head")result={content:Buffer.from(JSON.stringify(remote)).toString("base64")};
    else if(route==="git/blobs")result={sha:"blob-"+calls.length};
    else if(route==="git/trees")result={sha:"new-tree"};
    else if(route==="git/commits")result={sha:"new-commit"};
    else if(route==="git/refs/heads/master"){status=race?422:200;result=race?{message:"Update is not a fast forward"}:{object:{sha:"new-commit"}};}
    else throw Error("Unexpected route "+route);
    return {ok:status<300,status,json:async()=>result};
  };
  return{calls,fetcher};
}
test("the catalogue validates and searches dates, materials, aliases, and classes",()=>{
  assert.equal(K.validate(data),true);const coins=K.normalize(data),find=q=>coins.filter(c=>K.matches(c,{q}));
  assert.ok(find("538").some(c=>c._key==="justiniani8"));assert.ok(find("538 AD").some(c=>c._key==="justiniani8"));
  assert.ok(find("Justinian Nicomedia").length>=2);assert.equal(find("gold").length,3);assert.ok(find("Alexios").length);assert.ok(find("Class A3").length);
  const oldest=K.sort(coins,"oldest");assert.ok(oldest.every((c,i)=>!i||c.yearl>=oldest[i-1].yearl));
  assert.equal(K.materialGroup("OB"),K.materialGroup("AV"));
});
test("a batch keeps both additions and all earlier records without mutating its input",()=>{
  const untouched=K.canonical(data),one=addition("test-batch-one"),two=addition("test-batch-two"),merged=K.mergeChanges(data,[one,two]);
  assert.equal(K.normalize(merged).length,K.normalize(data).length+2);assert.ok(K.record(merged,one.key));assert.ok(K.record(merged,two.key));assert.equal(K.canonical(data),untouched);
  assert.equal(K.suggest(merged,"Test batch","one"),"test-batch-one-2");
});
test("editing preserves record IDs, unknown fields, and position; changing collection moves exactly one coin",()=>{
  const source=structuredClone(data),before=K.record(source,"hadrian");before.coin.custom_note="Keep this field";const prepared=K.upsert(source,before),original=K.record(prepared,"hadrian");
  const edited={...original,original,coin:{...original.coin,weight:3.1}};const merged=K.mergeChanges(prepared,[edited]);
  assert.equal(K.record(merged,"hadrian").coin.custom_note,"Keep this field");assert.equal(K.normalize(merged)[0]._key,K.normalize(prepared)[0]._key);
  const moved=K.upsert(merged,{...edited,type:"roman_provincial"});assert.equal(K.normalize(moved).filter(c=>c._key==="hadrian").length,1);assert.equal(K.record(moved,"hadrian").type,"roman_provincial");
});
test("publishing merges unrelated remote changes and rejects collisions or concurrent edits",()=>{
  const original=K.record(data,"hadrian"),change={...original,original,coin:{...original.coin,weight:3.1}},other=addition("remote-only"),remote=K.upsert(data,other);
  assert.ok(K.record(K.mergeChanges(remote,[change]),other.key));
  const changed=K.upsert(data,{...original,coin:{...original.coin,weight:9}});
  assert.throws(()=>K.mergeChanges(changed,[change]),/Conflict/);assert.throws(()=>K.mergeChanges(remote,[other]),/already exists/);
});
test("invalid links, collection names, duplicate IDs, and unsafe image paths are rejected",()=>{
  assert.equal(K.safeURL("javascript:alert(1)"),null);assert.equal(K.safeURL("https://user:secret@example.com"),null);assert.throws(()=>K.parseLinks("Example | http://example.com"),/https/);
  assert.throws(()=>K.validate([{constructor:[]}]),/collection/);assert.throws(()=>K.validate([...data,{roman_imperial:[{hadrian:K.record(data,"hadrian").coin}]}]),/Duplicate/);
  const invalid=K.upsert(data,{...K.record(data,"hadrian"),coin:{...K.record(data,"hadrian").coin,image:"images/../secret.jpg"}});assert.throws(()=>K.validate(invalid),/image path/);
});
test("GitHub publication is one atomic commit based on the current tree and immutable head",async()=>{
  const one=addition("test-api-one"),two=addition("test-api-two"),bytes=Uint8Array.from({length:70000},(_,i)=>i%256);
  one.assets=[{path:"images/test-api-one/test-api-one.jpg",blob:new Blob([bytes])}];const api=mockAPI();
  const result=await P.publish({token:"test-token",changes:[one,two],fetcher:api.fetcher});
  assert.equal(result.sha,"new-commit");assert.equal(K.normalize(result.catalogue).length,K.normalize(data).length+2);
  const tree=api.calls.find(c=>c.route==="git/trees").body;assert.equal(tree.base_tree,"base-tree");assert.equal(tree.tree.length,2);
  assert.ok(K.record(JSON.parse(tree.tree.find(e=>e.path==="coins.json").content),"test-api-two"));
  assert.deepEqual(api.calls.find(c=>c.route==="git/commits").body.parents,["head"]);assert.equal(api.calls.at(-1).body.force,false);
  assert.deepEqual(Buffer.from(api.calls.find(c=>c.route==="git/blobs").body.content,"base64"),Buffer.from(bytes));
});
test("GitHub conflicts and permission errors keep the batch and never force the ref",async()=>{
  const change=addition("test-api-conflict"),before=K.canonical(change),race=mockAPI(data,{race:true});
  await assert.rejects(P.publish({token:"test-token",changes:[change],fetcher:race.fetcher}),/changed while publishing/);assert.equal(race.calls.at(-1).body.force,false);assert.equal(K.canonical(change),before);
  await assert.rejects(P.publish({token:"test-token",changes:[change],fetcher:mockAPI(data,{denied:true}).fetcher}),/permissions/);
  const original=K.record(data,"hadrian"),edited={...original,original,coin:{...original.coin,weight:8}},remote=K.upsert(data,{...original,coin:{...original.coin,weight:9}}),conflict=mockAPI(remote);
  await assert.rejects(P.publish({token:"test-token",changes:[edited],fetcher:conflict.fetcher}),/Conflict/);assert.ok(conflict.calls.every(c=>c.method==="GET"));
});
test("browser base64 preserves Unicode and image bytes across chunk boundaries",async()=>{
  const sandbox={window:{CoinKit:K},TextDecoder,Uint8Array,atob,btoa,Blob,fetch:()=>{throw Error("Use mock API");}};vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(__dirname,"../github-publisher.js"),"utf8"),sandbox);
  const browser=sandbox.window.CoinPublisher,text="Victory · Αναστάσιος";assert.equal(browser.decode64(Buffer.from(text).toString("base64")),text);
  const entry=addition("test-browser-image"),bytes=Uint8Array.from({length:70000},(_,i)=>i%256);entry.assets=[{path:"images/test-browser-image/photo.jpg",blob:new Blob([bytes])}];const api=mockAPI();
  await browser.publish({token:"test-token",changes:[entry],fetcher:api.fetcher});assert.deepEqual(Buffer.from(api.calls.find(c=>c.route==="git/blobs").body.content,"base64"),Buffer.from(bytes));
});
test("deletion removes exactly one selected coin, keeps all unrelated records, and can empty the collection",()=>{
  const original=K.record(data,"hadrian"),change={action:"delete",key:original.key,original,assets:[]};
  const result=K.mergeChanges(data,[change]);
  assert.equal(K.record(result,original.key),null);assert.equal(K.normalize(result).length,K.normalize(data).length-1);
  assert.deepEqual(K.normalize(result),K.normalize(K.removeRecord(data,original.key)));
  assert.ok(K.record(data,original.key));
  const single=[{roman_imperial:[{hadrian:original.coin}]}],empty=K.mergeChanges(single,[change]);
  assert.equal(K.normalize(empty).length,0);assert.equal(K.validate(empty),true);
});
test("deleting a remotely edited coin stops; unrelated remote additions survive deletion",()=>{
  const original=K.record(data,"hadrian"),change={action:"delete",key:original.key,original,assets:[]};
  const changed=K.upsert(data,{...original,coin:{...original.coin,weight:9}});
  assert.throws(()=>K.mergeChanges(changed,[change]),/Conflict/);
  assert.throws(()=>K.mergeChanges(data,[{...change,original:null}]),/published coins/);
  const remote=K.upsert(data,addition("remote-added-coin"));
  assert.ok(K.record(K.mergeChanges(remote,[change]),"remote-added-coin"));
});
test("retired record codes cannot return through imports, old drafts, edits, or exports",()=>{
  const legacy=structuredClone(data);
  for(const section of legacy)for(const rows of Object.values(section))for(const row of rows)for(const coin of Object.values(row))coin.code="Old code";
  const original=K.record(legacy,"hadrian");original.coin.code="Saved code";
  const change={...original,original,coin:{...original.coin,weight:3.11}};
  const merged=K.mergeChanges(legacy,[change]);
  assert.ok(K.normalize(merged).every(coin=>!("code" in coin)));
  assert.ok(!JSON.stringify(merged).includes('"code":'));
  assert.equal(K.record(merged,"hadrian").coin.weight,3.11);
  assert.equal(K.record(merged,"hadrian").coin.file,original.coin.file);
  assert.equal(K.canonical(K.withoutRecordCodes(legacy)),K.canonical(data));
});
test("a deletion publishes as one catalogue commit without uploading images or replacing other repository files",async()=>{
  const original=K.record(data,"hadrian"),change={action:"delete",key:original.key,original,assets:[]},api=mockAPI();
  const result=await P.publish({token:"test-token",changes:[change],fetcher:api.fetcher});
  assert.equal(K.record(result.catalogue,original.key),null);
  assert.equal(api.calls.some(call=>call.route==="git/blobs"),false);
  const tree=api.calls.find(call=>call.route==="git/trees").body;
  assert.equal(tree.base_tree,"base-tree");assert.deepEqual(tree.tree.map(entry=>entry.path),["coins.json"]);
  assert.equal(K.record(JSON.parse(tree.tree[0].content),original.key),null);
  assert.deepEqual(api.calls.at(-1).body,{sha:"new-commit",force:false});
});

