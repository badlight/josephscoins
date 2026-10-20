# Historical map sources

`roman-boundaries.topo.json` is a derived extract of **Cliopatria** (Seshat Global History Databank), pinned to upstream commit `5f433377139a6eeaeacbdc894b70f8805b72c8b5`.

Citation: Bennett, J. S., et al. (2025). *Cliopatria — A geospatial database of world-wide political entities from 3400BCE to 2024CE*. Scientific Data 12, 247. https://doi.org/10.1038/s41597-025-04516-9

Source and licence: https://github.com/Seshat-Global-History-Databank/cliopatria/tree/5f433377139a6eeaeacbdc894b70f8805b72c8b5 — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Changes: extracted Roman Empire, Western Roman Empire, Eastern Roman Empire and Byzantine Empire features overlapping 1–1453 CE. Applied Shapely topology-preserving simplification (0.045 degrees), rounded to four decimal places and encoded as TopoJSON with 100,000 quantization steps. Original inclusive FromYear / ToYear intervals are retained. No temporal interpolation or invented boundaries. The upstream geometry describes historical reconstructions, not surveyed frontiers; uncertainties and differing historical interpretations remain. Breakaway states and client kingdoms are not added to the shaded imperial territory. A year with no record explicitly displays no boundary.

Rebuild: `npm install`, install `shapely==2.1.2`, then run `python3 scripts/prepare-map-data.py`.

`mints.json` contains representative ancient city points from **Pleiades: A Gazetteer of Past Places**, retrieved 20 October 2026. Each record credits its place authors and links its source resource. [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Changes: coordinates rounded to six decimals; aliases for this catalogue added. City points do not identify excavated mint buildings or coin findspots. Unrecognised mints are listed separately rather than assigned invented coordinates. Pleiades editors and contributors: https://pleiades.stoa.org/help/how-to-cite-pleiades

Map tiles: © OpenStreetMap contributors — https://www.openstreetmap.org/copyright

Leaflet 1.9.4 and topojson-client 3.1.0 are vendored with their original BSD licences in `vendor/`. topojson-server 3.0.1 is a development dependency used only to rebuild the boundary file.
