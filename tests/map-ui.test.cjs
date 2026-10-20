const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),K=require('../coin-utils.js'),E=require('../coin-explore.js');
async function setup(){
 const dom=new JSDOM('<main id="host"></main>',{url:'https://coins.test/',runScripts:'outside-only'}),w=dom.window,drawn=[],events=[];
 w.CoinKit=K;w.CoinExplore=E;w.matchMedia=()=>({matches:true});w.fetch=async name=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,name.split('?')[0])))});
 const map={zoom:4,setView(){return this;},getZoom(){return this.zoom;},flyTo(point,zoom){this.zoom=zoom;events.push({type:'pan',point});return this;},fitBounds(){return this;},invalidateSize(){},remove(){}};
 const layer=()=>({addTo(){return this;},clearLayers(){return this;},on(){return this;}});
 w.L={map:()=>map,layerGroup:layer,tileLayer:layer,divIcon:v=>v,geoJSON:(feature)=>{drawn.push(feature);return layer();},marker:()=>({...layer(),bindTooltip(){return this;},getElement(){return w.document.createElement('button');}})};
 for(const name of ['vendor/topojson/topojson-client.min.js','mint-map.js'])w.eval(fs.readFileSync(path.join(root,name),'utf8'));
 let opened=null;const api=await w.CoinMintMap.create(w.document.getElementById('host'),{coins:K.normalize(require('../coins.json')),onOpen:coin=>{opened=coin;events.push({type:'open',coin,year:w.document.getElementById('mapYear').value});},onState:state=>events.push({type:'state',...state})});
 return {dom,w,drawn,events,api,opened:()=>opened};
}
test('the map has one Roman legend and clicking a coin selects its mint and date before opening',async()=>{
 const {dom,w,events,api,opened}=await setup(),d=w.document;
 assert.equal(d.querySelectorAll('.empire-legend span').length,1);assert.equal(d.querySelector('.empire-legend').textContent,'Roman Empire');assert.equal(d.querySelectorAll('.mint-follow').length,0);assert.ok(!d.body.textContent.includes('Show this date'));
 const choose=d.getElementById('mapCoinSelect');choose.value='hadrian';choose.dispatchEvent(new w.Event('change'));assert.equal(d.getElementById('mapYear').value,String(E.coinYear(K.normalize(require('../coins.json')).find(c=>c._key==='hadrian'))));
 const year=d.getElementById('mapYear');year.value='395';year.dispatchEvent(new w.Event('input'));assert.match(d.querySelector('.border-status').textContent,/^Roman Empire/);assert.ok(!/Eastern|Western|Byzantine/.test(d.querySelector('.border-status').textContent));
 const row=d.querySelector('.mint-coin-open');row.click();const coin=opened(),open=events.findLast(e=>e.type==='open');assert.ok(coin);assert.equal(open.year,String(E.coinYear(coin)));const state=events.findLast(e=>e.type==='state');assert.equal(state.mapCoin,coin._key);assert.equal(state.mint,'Rome');assert.equal(state.year,E.coinYear(coin));
 api.destroy();dom.window.close();
});
test('public entry pages and coin details contain no catalogue or label printing controls',()=>{
 for(const name of ['index.html','coin.html','app.js'])assert.ok(!/printCollection|print\.html|Print coin \/ label|Print catalogue \/ labels/.test(fs.readFileSync(path.join(root,name),'utf8')),name);
 for(const name of ['print.html','print.js','print.css'])assert.equal(fs.existsSync(path.join(root,name)),false,name);
});
