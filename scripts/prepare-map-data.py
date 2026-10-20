"""Rebuild the licensed map layers. Requires shapely==2.1.2.

npm install
python3 -m pip install shapely==2.1.2
python3 scripts/prepare-map-data.py
The upstream commit is pinned. Geometry is never interpolated between years.
"""
import io,json,pathlib,urllib.request,zipfile,tempfile,subprocess
from shapely.geometry import shape,mapping
ROOT=pathlib.Path(__file__).resolve().parents[1]
COMMIT='5f433377139a6eeaeacbdc894b70f8805b72c8b5'
URL=f'https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/{COMMIT}/cliopatria.geojson.zip'
with urllib.request.urlopen(URL,timeout=90) as r:archive=zipfile.ZipFile(io.BytesIO(r.read()))
features=json.loads(archive.read(archive.namelist()[0]))['features']
names={'Roman Empire','Eastern Roman Empire','Western Roman Empire','Byzantine Empire'}
result=[]
def rounded(c):return [round(v,4) if isinstance(v,(int,float)) else rounded(v) for v in c]
for f in features:
 p=f['properties']
 if p['Name'] not in names or p['ToYear']<1 or p['FromYear']>1453:continue
 g=mapping(shape(f['geometry']).simplify(.045,preserve_topology=True))
 result.append({'type':'Feature','properties':{'name':p['Name'],'from':p['FromYear'],'to':p['ToYear']},'geometry':{'type':g['type'],'coordinates':rounded(g['coordinates'])}})
out={'type':'FeatureCollection','source':'Cliopatria / Seshat Global History Databank, Bennett et al. (2025)','license':'CC BY 4.0','sourceCommit':COMMIT,'doi':'https://doi.org/10.1038/s41597-025-04516-9','changes':'Roman, Eastern Roman, Western Roman and Byzantine polities extracted; topology-preserving simplification at 0.045 degrees, rounded to four decimals. Dated intervals retained; no interpolated borders.','features':result}
with tempfile.NamedTemporaryFile(mode='w',suffix='.geojson') as tmp:
 json.dump(out,tmp,separators=(',',':'));tmp.flush()
 subprocess.run(['node',str(ROOT/'scripts/encode-borders.cjs'),tmp.name],check=True,cwd=ROOT)
print('Saved',len(result),'dated boundary features.')
