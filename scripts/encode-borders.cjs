// Run by prepare-map-data.py after the dated GeoJSON has been simplified.
const fs=require('node:fs'),{topology}=require('topojson-server');
const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const result=topology({empires:data},1000000);
for(const key of ['source','license','sourceCommit','doi','coastlineSource','changes'])result[key]=data[key];
fs.writeFileSync(require('node:path').join(__dirname,'../map-data/roman-boundaries.topo.json'),JSON.stringify(result)+'\n');
