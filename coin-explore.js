(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CoinExplore=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 const key=v=>String(v||'').normalize('NFKC').trim().toLocaleLowerCase().trim();
 function dateRange(c){const low=Number(c.yearl),high=Number(c.yearh);if(!String(c.yearl??'').trim()||!Number.isFinite(low)||!low)return null;return {from:Math.min(low,Number.isFinite(high)&&high?high:low),to:Math.max(low,Number.isFinite(high)&&high?high:low)};}
 function coinYear(c){const r=dateRange(c);return r?Math.floor((r.from+r.to)/2):null;}
 function activeBorders(topology,year){return topology.objects.empires.geometries.filter(g=>g.properties.from<=year&&g.properties.to>=year);}
 function groupMints(coins,places,year){const groups=new Map(),unmapped=[];for(const coin of coins){const range=dateRange(coin);if(year!==undefined&&(!range||year<range.from||year>range.to))continue;const place=places.find(p=>[p.name,...(p.aliases||[])].some(n=>key(n)===key(coin.mint)));if(!place){unmapped.push(coin);continue;}const group=groups.get(place.name)||{place,coins:[]};group.coins.push(coin);groups.set(place.name,group);}return {groups:[...groups.values()].sort((a,b)=>a.place.name.localeCompare(b.place.name)),unmapped};}
 function printSelection(coins,params,matches,sort){const keys=params.get('keys');if(keys!==null){const wanted=new Set(keys.split(',').filter(Boolean));return coins.filter(c=>wanted.has(c._key));}const filters={q:params.get('q')||'',...Object.fromEntries(['collection','ruler','mint','denomination','material','sub'].map(k=>[k,params.get(k)||'']))};return sort(coins.filter(c=>matches(c,filters)),params.get('sort')||'original');}
 return {dateRange,coinYear,activeBorders,groupMints,printSelection};
});
