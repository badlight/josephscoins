(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory(require("./coin-utils.js"));
  else root.CoinWorkspace = factory(root.CoinKit);
})(typeof window !== "undefined" ? window : this, function (K) {
  "use strict";
  const FIELDS = ["collection","emperor","denomination","material","mint","officina","emission","class","sub","yearl","yearh","era","weight","diameter","axis","obvL","revL","obvD","revD","exergue","reference","referenceLinks","provenance","provenanceLinks","slug","stock"];
  const LABELS = {collection:"Collection",emperor:"Ruler / authority",denomination:"Denomination",material:"Material",mint:"Mint",officina:"Officina",emission:"Emission",class:"Class",sub:"Sub-collections",yearl:"Year from",yearh:"Year to",era:"Era",weight:"Weight (g)",diameter:"Diameter (mm)",axis:"Axis",obvL:"Obverse legend",revL:"Reverse legend",obvD:"Obverse description",revD:"Reverse description",exergue:"Exergue",reference:"Reference",referenceLinks:"Catalogue links",provenance:"Provenance",provenanceLinks:"Provenance links",slug:"File slug",stock:"Stock",image:"Photograph"};
  const clone = value => structuredClone(value);
  function blank(data) {
    return Object.assign(Object.fromEntries(FIELDS.map(key=>[key,""])),{collection:"roman_imperial",era:"AD",stock:"yes",slug:K.suggest(data,"","")});
  }
  function form(record) {
    const c=record.coin;
    return Object.fromEntries(Object.entries({collection:record.type,emperor:c.emperor,denomination:c.denomination,material:c.material,mint:c.mint,officina:c.officina,emission:c.emission,class:c.class,sub:(c.sub_collection||[]).join(", "),yearl:Math.abs(c.yearl),yearh:Math.abs(c.yearh),era:c.yearl<0?"BC":"AD",weight:c.weight,diameter:c.diameter?parseFloat(c.diameter):"",axis:c.axis,obvL:c.obverse_legend,revL:c.reverse_legend,obvD:c.obverse_desc,revD:c.reverse_desc,exergue:c.exergue,reference:c.reference,referenceLinks:K.linkText(c.reference_links),provenance:c.provenance,provenanceLinks:K.linkText(c.provenance_links),slug:c.file,stock:c.stock}).map(([key,value])=>[key,value==null?"":String(value)]));
  }
  function fromRecord(record, original=record) {
    return {id:record.key,editing:record.key,original:clone(original),seed:clone(record),form:form(record),image:null,assets:[],autoSlug:false,ready:false,updatedAt:Date.now()};
  }
  function fresh(data,id) {
    const values=blank(data);
    return {id,editing:"",original:null,seed:null,form:values,initial:clone(values),image:null,assets:[],autoSlug:true,ready:false,updatedAt:Date.now()};
  }
  function key(draft) {return draft.editing||draft.form.slug.trim();}
  function differences(draft) {
    if(draft.action==="delete")return [{field:"Record",before:"Published",after:"Delete on publication"}];
    const baseline=draft.original?form(draft.original):(draft.initial||Object.fromEntries(FIELDS.map(id=>[id,""]))),result=[];
    for(const id of FIELDS)if(String(baseline[id]||"")!==String(draft.form[id]||""))result.push({field:LABELS[id],before:baseline[id]||"",after:draft.form[id]||""});
    if(draft.image||(draft.assets||[]).length)result.push({field:LABELS.image,before:draft.original?"Existing photograph":"",after:draft.image?draft.image.name||"New photograph":"Saved photograph"});
    return result;
  }
  function changed(draft) {return draft.action==="delete"||differences(draft).length>0;}
  function errors(draft,data,drafts={}) {
    if(draft.action==="delete")return draft.original?[]:["Only published coins can be deleted."];
    const f=draft.form,out=[];
    for(const id of ["collection","emperor","denomination","mint","yearl","yearh","slug"])if(!String(f[id]||"").trim())out.push(LABELS[id]+" is required.");
    if(!Object.hasOwn(K.TYPES,f.collection))out.push("Choose a valid collection.");
    if(!/^[a-z0-9][a-z0-9-]*$/.test(f.slug||""))out.push("File slug needs lowercase letters, numbers, and hyphens.");
    for(const id of ["yearl","yearh"])if(f[id]&&(!Number.isInteger(+f[id])||+f[id]<1||+f[id]>3000))out.push(LABELS[id]+" must be a whole year between 1 and 3000.");
    for(const [id,min,max]of [["weight",.001,5000],["diameter",.1,1000]])if(f[id]&&(!Number.isFinite(+f[id])||+f[id]<min||+f[id]>max))out.push(LABELS[id]+" is outside the allowed range.");
    const limits={emperor:180,denomination:100,mint:120,officina:100,emission:180,class:100,sub:600,axis:40,obvL:600,revL:600,obvD:6000,revD:6000,exergue:600,reference:600,provenance:6000,slug:120};
    for(const [id,max]of Object.entries(limits))if(String(f[id]||"").length>max)out.push(LABELS[id]+" is too long (maximum "+max+").");
    if(draft.editing&&draft.seed&&f.slug!==draft.seed.coin.file)out.push("An existing coin's file slug cannot change.");
    for(const id of ["referenceLinks","provenanceLinks"])try{K.parseLinks(f[id]);}catch(error){out.push(LABELS[id]+": "+error.message);}
    if(!draft.editing&&!draft.image&&!(draft.assets||[]).length)out.push("Choose a photograph for the new coin.");
    if(draft.image&&(!["image/jpeg","image/png","image/webp"].includes(draft.image.type)||draft.image.size>20*1024*1024))out.push("Choose a JPEG, PNG, or WebP photograph up to 20 MB.");
    const id=key(draft);
    if(!draft.original&&K.record(data,id))out.push("That file slug already exists in the published collection.");
    if(Object.values(drafts).some(other=>other.id!==draft.id&&other.action!=="delete"&&key(other)===id))out.push("Another draft uses this file slug.");
    return [...new Set(out)];
  }
  function entry(draft,data,drafts={}) {
    const problems=errors(draft,data,drafts);if(problems.length)throw Error(problems.join(" "));
    if(draft.action==="delete")return {action:"delete",key:draft.editing,original:clone(draft.original),assets:[]};
    const f=draft.form,coin={...(draft.seed?K.clean(draft.seed.coin):{}),emperor:f.emperor.trim(),file:f.slug.trim(),denomination:f.denomination.trim(),mint:f.mint.trim()};
    let years=[+f.yearl,+f.yearh];if(f.era==="BC")years=years.map(y=>-Math.abs(y));coin.yearl=Math.min(...years);coin.yearh=Math.max(...years);
    const optional={material:f.material,officina:f.officina.trim(),emission:f.emission.trim(),class:f.class.trim(),axis:f.axis.trim().toUpperCase(),obverse_legend:f.obvL.trim(),reverse_legend:f.revL.trim(),obverse_desc:f.obvD.trim(),reverse_desc:f.revD.trim(),exergue:f.exergue.trim(),reference:f.reference.trim(),provenance:f.provenance.trim(),stock:f.stock};
    for(const [field,value]of Object.entries(optional)){if(value)coin[field]=value;else delete coin[field];}
    if(f.weight)coin.weight=+f.weight;else delete coin.weight;
    if(f.diameter)coin.diameter=+f.diameter+"mm";else delete coin.diameter;
    const tags=[...new Set(f.sub.split(",").map(s=>s.trim()).filter(Boolean))];if(tags.length)coin.sub_collection=tags;else delete coin.sub_collection;
    for(const [field,id]of [["reference_links","referenceLinks"],["provenance_links","provenanceLinks"]]){const links=K.parseLinks(f[id]);if(links.length)coin[field]=links;else delete coin[field];}
    if((draft.assets||[]).length){coin.image=draft.assets[0].path;coin.image_large=draft.assets[1].path;}
    return {key:key(draft),type:f.collection,coin:K.clean(coin),original:clone(draft.original),assets:draft.assets||[]};
  }
  function touch(draft,patch) {
    if(draft.action==="delete")throw Error("Undo the deletion before editing this coin.");
    Object.assign(draft.form,patch);draft.ready=false;draft.updatedAt=Date.now();return draft;
  }
  function bulk(drafts,ids,patch,tags) {
    const result=clone(drafts),allowed=["emperor","mint","material"];
    for(const id of Object.keys(patch))if(!allowed.includes(id))throw Error("This field cannot be changed in bulk: "+id);
    for(const id of ["emperor","mint"])if(Object.hasOwn(patch,id)&&!patch[id].trim())throw Error(LABELS[id]+" cannot be empty.");
    if(tags&&!['add','remove','replace'].includes(tags.mode))throw Error("Choose a sub-collection action.");
    for(const id of ids){
      const draft=result[id];if(!draft||draft.action==="delete")throw Error("The selection includes an unavailable coin.");
      const updates={...patch};
      if(tags){const values=[...new Set(tags.value.split(",").map(s=>s.trim()).filter(Boolean))],previous=draft.form.sub.split(",").map(s=>s.trim()).filter(Boolean);
        updates.sub=(tags.mode==="replace"?values:tags.mode==="remove"?previous.filter(s=>!values.includes(s)):[...new Set([...previous,...values])]).join(", ");}
      touch(draft,updates);
    }
    return result;
  }
  function list(workspace) {return Object.values(workspace.drafts).filter(changed).sort((a,b)=>b.updatedAt-a.updatedAt);}
  function ready(workspace) {return list(workspace).filter(d=>d.ready&&!errors(d,workspace.baseData,workspace.drafts).length);}
  function changes(workspace) {return ready(workspace).map(d=>entry(d,workspace.baseData,workspace.drafts));}
  function migrate(saved,data) {
    if(saved&&saved.version>=3&&saved.drafts){return {version:3,baseData:K.withoutRecordCodes(data),drafts:clone(saved.drafts),active:saved.active||"",view:saved.view||"catalogue",savedAt:saved.savedAt||0};}
    const workspace={version:3,baseData:K.withoutRecordCodes(data),drafts:{},active:"",view:"catalogue",savedAt:0};
    for(const change of (saved&&saved.changes)||[]){
      let d;
      if(change.action==="delete"){
        d=fromRecord(change.original,change.original);d.action="delete";d.ready=true;
        if(change.previous){const p=change.previous;d.previous=fromRecord(p,p.original);d.previous.assets=p.assets||[];d.previous.ready=true;}
      }else{d=fromRecord(change,change.original);d.assets=change.assets||[];d.ready=true;}
      workspace.drafts[d.id]=d;
    }
    if(saved&&saved.form){
      const id=saved.editing||"new-restored",staged=workspace.drafts[id],seed=staged?staged.seed:(saved.editing&&K.record(data,saved.editing));
      const d=seed?fromRecord(seed,staged?staged.original:saved.original||seed):fresh(data,id);
      d.form={...d.form,...saved.form};d.image=saved.image||null;d.assets=staged?staged.assets:[];d.autoSlug=saved.autoSlug!==false;
      const differs=!staged||K.canonical(d.form)!==K.canonical(staged.form)||!!d.image;
      d.ready=!!staged&&staged.ready&&!differs;
      // Never replace a staged deletion with the old form snapshot.
      if(!staged||staged.action!=="delete")workspace.drafts[id]=d;
      workspace.active=id;
    }
    return workspace;
  }
  function published(workspace,catalogue,ids) {
    const result=clone(workspace);result.baseData=K.withoutRecordCodes(catalogue);
    for(const id of ids)delete result.drafts[id];
    if(!result.drafts[result.active])result.active="";
    return result;
  }
  return {FIELDS,LABELS,blank,form,fromRecord,fresh,key,differences,changed,errors,entry,touch,bulk,list,ready,changes,migrate,published};
});
