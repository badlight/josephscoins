# Historical map sources

`roman-boundaries.topo.json` is a derived extract of **Cliopatria** (Seshat Global History Databank), pinned to upstream commit `5f433377139a6eeaeacbdc894b70f8805b72c8b5`.

Citation: Bennett, J. S., et al. (2025). *Cliopatria — A geospatial database of world-wide political entities from 3400BCE to 2024CE*. Scientific Data 12, 247. https://doi.org/10.1038/s41597-025-04516-9

Source and licence: https://github.com/Seshat-Global-History-Databank/cliopatria/tree/5f433377139a6eeaeacbdc894b70f8805b72c8b5 — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes: Roman, eastern, western, and later imperial territories are dissolved into one **Roman Empire** outline for each dated interval, removing the administrative seam. The Nicaean imperial line is included after 1204; other successor states are excluded. The upstream Nicaean records continue through 1278, including restored imperial territory, and are retained under the unified Roman label.

The earliest Nicaean footprint is dated 1206–1209; it is explicitly used as an approximation for 1204–1205. The source snapshot labelled 1260–1271 is aligned with the recovery of Constantinople in 1261; the preceding outline is retained through 1260. These two adjustments are recorded in the dataset metadata. Historical context: The Metropolitan Museum of Art, [Byzantium (ca. 330–1453)](https://www.metmuseum.org/essays/byzantium-ca-330-1453). Other missing intervals display no outline. No temporal interpolation is used.

Aegean coastal detail uses **Natural Earth 1:10m land**, pinned to `f1890d9f152c896d250a77557a5751a93d494776` (Natural Earth v5.1.2 repository). [Dataset](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/), [public domain terms](https://www.naturalearthdata.com/about/terms-of-use/). It refines geography, not the historical evidence for control. In the region 21–30.5°E / 34.5–41.5°N, modern land is clipped to each dated footprint; newly detailed shoreline pieces are included only within 0.12° of held territory. Inland political frontiers remain in place. Small islands omitted by the coarse full-imperial reference are included only within the convex hull of the dated held-island cluster and within 1° of it before 1204, tightening to 0.6° afterwards. Their control is therefore an explicit cartographic approximation, not a new historical attestation. Major islands present in the original geography are not restored simply by proximity. Modern coastlines also differ from ancient shorelines.

Topology-preserving simplification is 0.003° (previously 0.045°), with geometry cleaned on the exact one-million-step TopoJSON quantization grid before encoding. The result remains a historical reconstruction with geographic and chronological uncertainties.

Rebuild: `npm install`, install `shapely==2.1.2`, then run `python3 scripts/prepare-map-data.py`. Optional `--source-archive PATH --land PATH` reuse the two pinned downloaded inputs.

`mints.json` contains representative ancient city points from **Pleiades: A Gazetteer of Past Places**, retrieved 20 October 2026. Each record credits its place authors and links its source resource. [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Changes: coordinates rounded to six decimals; aliases for this catalogue added. City points do not identify excavated mint buildings or coin findspots. Unrecognised mints are listed separately rather than assigned invented coordinates. Pleiades editors and contributors: https://pleiades.stoa.org/help/how-to-cite-pleiades

Map tiles: © OpenStreetMap contributors — https://www.openstreetmap.org/copyright

Leaflet 1.9.4 and topojson-client 3.1.0 are vendored with their original BSD licences in `vendor/`. topojson-server 3.0.1 is a development dependency used only to rebuild the boundary file.
