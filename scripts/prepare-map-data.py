"""Rebuild Roman borders and detailed Aegean shores (shapely==2.1.2).

python3 scripts/prepare-map-data.py [--source-archive PATH] [--land PATH]
Source downloads are pinned; optional paths reuse those downloaded inputs.
"""
import argparse,io,json,pathlib,subprocess,tempfile,urllib.request,zipfile
from shapely import make_valid,set_precision,union_all
from shapely.affinity import affine_transform
from shapely.geometry import shape,mapping,box,Polygon,MultiPolygon

ROOT=pathlib.Path(__file__).resolve().parents[1]
COMMIT='5f433377139a6eeaeacbdc894b70f8805b72c8b5'
LAND_COMMIT='f1890d9f152c896d250a77557a5751a93d494776'
SOURCE_URL=f'https://raw.githubusercontent.com/Seshat-Global-History-Databank/cliopatria/{COMMIT}/cliopatria.geojson.zip'
LAND_URL=f'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{LAND_COMMIT}/geojson/ne_10m_land.geojson'
AEGEAN=box(21,34.5,30.5,41.5)

def polygonal(geometry):
    geometry=make_valid(geometry)
    if isinstance(geometry,(Polygon,MultiPolygon)):return geometry
    return union_all([p for p in geometry.geoms if isinstance(p,(Polygon,MultiPolygon))])

def parts(geometry):
    return list(geometry.geoms) if isinstance(geometry,MultiPolygon) else [geometry]

def read_source(path,url):
    if path:return pathlib.Path(path).read_bytes()
    with urllib.request.urlopen(url,timeout=90) as response:return response.read()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-archive');parser.add_argument('--land');args=parser.parse_args()
    with zipfile.ZipFile(io.BytesIO(read_source(args.source_archive,SOURCE_URL))) as archive:
        features=json.loads(archive.read(archive.namelist()[0]))['features']
    names={'Roman Empire','Eastern Roman Empire','Western Roman Empire','Byzantine Empire','Nicaean Empire'}
    originals=[f for f in features if f['properties']['Name'] in names and f['properties']['ToYear']>=1 and f['properties']['FromYear']<=1453]
    # A full-imperial snapshot supplies the coarse regional geography separately
    # from later political losses, so new shoreline detail cannot expand borders inland.
    reference=union_all([shape(f['geometry']) for f in originals if f['properties']['Name']=='Roman Empire' and f['properties']['FromYear']<=120<=f['properties']['ToYear']]).intersection(AEGEAN)
    land=json.loads(read_source(args.land,LAND_URL))
    detailed=polygonal(union_all([shape(f['geometry']).intersection(AEGEAN) for f in land['features']])).simplify(.002,preserve_topology=True)
    new_shore=detailed.difference(reference)
    # A lost major island must not reappear simply because it is near a surviving possession.
    omitted=[p for p in parts(detailed) if not p.intersects(reference) and not p.intersects(AEGEAN.boundary)]
    rows=[]
    for feature in originals:
        p=feature['properties'];name=p['Name'];start=max(1,p['FromYear']);end=min(1453,p['ToYear'])
        if name=='Nicaean Empire':
            if start==1206:start=1204
            # Align the coarse restored-capital snapshot with the 1261 recovery.
            if start==1250:end=1260
            elif start==1260:start=1261
        elif name=='Byzantine Empire' and start<1279:end=min(end,1203)
        if start>end:continue
        rows.append({'name':name,'from':start,'to':end,'sourceFrom':p['FromYear'],'sourceTo':p['ToYear'],'geometry':polygonal(shape(feature['geometry']))})
    cuts=sorted({1,1204,1261,1454,*[r['from'] for r in rows],*[r['to']+1 for r in rows]})
    result=[]
    for start,next_start in zip(cuts,cuts[1:]):
        active=[r for r in rows if r['from']<=start<=r['to']]
        if not active:continue
        original=polygonal(union_all([r['geometry'] for r in active],grid_size=.00001))
        regional=original.intersection(AEGEAN);refined=original
        if not regional.is_empty:
            # Restore coastal detail only where the dated footprint reaches the shore.
            refined=original.difference(AEGEAN).union(regional.intersection(detailed)).union(new_shore.intersection(regional.buffer(.12)))
            # Omitted small-island control is an explicit cartographic approximation:
            # require both proximity and membership of the held island cluster.
            # Tighten the neighbourhood after the Fourth Crusade fragmentation.
            distance=1.0 if start<1204 else .6
            cluster=regional.convex_hull
            additions=[p for p in omitted if cluster.covers(p.representative_point()) and regional.distance(p)<=distance]
            if additions:refined=refined.union(union_all(additions))
        geometry=polygonal(refined).simplify(.003,preserve_topology=True)
        properties={'name':'Roman Empire','from':start,'to':next_start-1,'sources':sorted({r['name'] for r in active})}
        if start==1204:properties['note']='For 1204–1205, the earliest available Nicaean outline (1206–1209) is used as an approximation.'
        if start==1260:properties['note']='The pre-restoration outline is retained through 1260; the restored-capital snapshot begins in 1261.'
        result.append({'type':'Feature','properties':properties,'_geometry':geometry})
    # Clean on the encoder's exact integer grid before TopoJSON quantization.
    # This removes sub-grid coastal slivers without creating intersecting rings.
    min_x=min(f['_geometry'].bounds[0] for f in result);min_y=min(f['_geometry'].bounds[1] for f in result)
    max_x=max(f['_geometry'].bounds[2] for f in result);max_y=max(f['_geometry'].bounds[3] for f in result)
    scale_x=(max_x-min_x)/999999;scale_y=(max_y-min_y)/999999
    for feature in result:
        geometry=feature.pop('_geometry')
        grid=affine_transform(geometry,[1/scale_x,0,0,1/scale_y,-min_x/scale_x,-min_y/scale_y])
        clean=polygonal(set_precision(grid,1,mode='valid_output'))
        feature['geometry']=mapping(affine_transform(clean,[scale_x,0,0,scale_y,min_x,min_y]))
    out={'type':'FeatureCollection','source':'Cliopatria / Seshat Global History Databank, Bennett et al. (2025)','license':'CC BY 4.0','sourceCommit':COMMIT,'doi':'https://doi.org/10.1038/s41597-025-04516-9','coastlineSource':{'name':'Natural Earth 1:10m land','license':'Public domain','sourceCommit':LAND_COMMIT,'url':'https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/'},'changes':'Roman territories dissolved into one Roman Empire outline per date interval; the Nicaean imperial lineage is included from 1204. Original Nicaean snapshots continue through 1278 under the unified label. Earliest 1206 outline approximates 1204–1205; the 1260 restored-capital snapshot starts in 1261, with the previous outline retained through 1260. Aegean shores reconciled with Natural Earth 1:10m geography. Omitted small-island control is approximated from the dated held-island cluster and proximity, with a tighter neighbourhood from 1204; other successor states are excluded. Topology-preserving simplification at 0.003 degrees, geometry cleaned on the TopoJSON grid at one million quantization steps. No interpolation across other missing periods.','features':result}
    with tempfile.NamedTemporaryFile(mode='w',suffix='.geojson') as output:
        json.dump(out,output,separators=(',',':'));output.flush()
        subprocess.run(['node',str(ROOT/'scripts/encode-borders.cjs'),output.name],check=True,cwd=ROOT)
    print('Saved',len(result),'unified dated Roman Empire outlines.')

if __name__=='__main__':main()
