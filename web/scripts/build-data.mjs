// Build the small data files the app bundles, from the repo's data/ folder.
//   node scripts/build-data.mjs     (runs before `npm run dev` and `npm run build`)
//
// src/data/maritimes.topo.json  land outlines (N.B., N.S., P.E.I., Quebec, Maine) as TopoJSON, so the
//                               map can draw coastlines and province borders separately.
// src/data/replay-towns.json    the 12 replay towns from data/demo/index.json, with their county.
// src/data/places.json          every Maritimes community for the live town search, cities and towns first.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { topology } from "topojson-server";

const data = (path) => JSON.parse(readFileSync(new URL(`../../data/${path}`, import.meta.url), "utf8"));
const out = (name, value) => {
  const url = new URL(`../src/data/${name}`, import.meta.url);
  mkdirSync(new URL(".", url), { recursive: true });
  writeFileSync(url, JSON.stringify(value));
  console.log(`src/data/${name}`);
};

const areas = data("places/areas.geojson");
const land = { type: "FeatureCollection", features: areas.features.filter((f) => f.properties.kind === "land") };
out("maritimes.topo.json", topology({ land }, 1e5));

const communities = data("places/communities.json").places; // [name, lat, lon, type, county, province]
const TYPE_ORDER = ["CITY", "TOWN", "MUN1", "VILG"]; // then unincorporated places (UNP)
const rank = (type) => (TYPE_ORDER.includes(type) ? TYPE_ORDER.indexOf(type) : TYPE_ORDER.length);
out("places.json", [...communities].sort((a, b) => rank(a[3]) - rank(b[3]) || a[0].localeCompare(b[0], "en")));
const index = data("demo/index.json");
out(
  "replay-towns.json",
  index.towns.map((town) => {
    const match = communities.find((c) => c[0] === town.town && c[5] === town.province && c[3] === town.cgndbType);
    return { name: town.town, province: town.province, county: match ? match[4] : "", lat: town.lat, lon: town.lon, replayFile: town.file };
  }),
);
