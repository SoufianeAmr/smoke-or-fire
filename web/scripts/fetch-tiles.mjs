// Fetch the basemap: one PMTiles file for the engine's wind grid, cut from a Protomaps build of OpenStreetMap.
//   node scripts/fetch-tiles.mjs           fetch it unless the right file is already there
//   node scripts/fetch-tiles.mjs --check   only say whether the right file is there (exit 1 if not)
//
// Everything is pinned, so the same bytes come out every time:
//   - the build: src/map/tiles.json ("build"), a day of https://build.protomaps.com. Protomaps keeps the first build of
//     each tile schema version; 20260928 is the first of 4.15.2.
//   - the cut: its box and zooms (src/map/tiles.json), made by go-pmtiles' `extract`, which reads only the byte ranges
//     it needs (about 48 MB of a 138 GB file).
//   - the tool: go-pmtiles TOOL_VERSION, checked against its SHA-256 before it runs.
//   - the result: its size and SHA-256 (src/map/tiles.json). A different file is refused.
// To move to a newer build: change "build", run with --repin, and commit the new size, hash and data time it prints.
//
// The file goes to public/tiles/ and is never committed (.gitignore): the app is deployed from a local build, which
// carries it. Without it the map falls back to the outline map.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { arch, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { gunzipSync, inflateRawSync } from "node:zlib";

const PIN_FILE = new URL("../src/map/tiles.json", import.meta.url);
const pin = JSON.parse(readFileSync(PIN_FILE, "utf8"));
const SOURCE = `https://build.protomaps.com/${pin.build}.pmtiles`;
const OUT_DIR = new URL("../public/tiles/", import.meta.url);
const TARGET = new URL(pin.file, OUT_DIR);

const TOOL_VERSION = "1.31.2";
const RELEASE = `https://github.com/protomaps/go-pmtiles/releases/download/v${TOOL_VERSION}`;
// Release archives of go-pmtiles 1.31.2 and their SHA-256, computed from the downloads on 2026-10-04.
const TOOLS = {
  "win32-x64": ["go-pmtiles_1.31.2_Windows_x86_64.zip", "a658baa4d7e55020aef6ca17bd9ff9faa1582671266b36f58c52db0ac8e785a1"],
  "win32-arm64": ["go-pmtiles_1.31.2_Windows_arm64.zip", "8780a17453c63af757917a694cbbb50b943db89cc3f1b07e6fd62c1ff8e6963b"],
  "darwin-x64": ["go-pmtiles-1.31.2_Darwin_x86_64.zip", "1f0dc02eee6c58312dd6c509faee1b5c32f0596568af1bf51f1b034e7a88a65b"],
  "darwin-arm64": ["go-pmtiles-1.31.2_Darwin_arm64.zip", "40528f7f616fcbf91207cd48c8fc023d213f6d86c0cbf1f748732803d1880f3d"],
  "linux-x64": ["go-pmtiles_1.31.2_Linux_x86_64.tar.gz", "3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f"],
  "linux-arm64": ["go-pmtiles_1.31.2_Linux_arm64.tar.gz", "f8bd47e7ea866863489cad588fbaf2f31f42e5821f7a03f009b3769f05801cb1"],
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fail = (message) => {
  console.error(`fetch-tiles: ${message}`);
  process.exit(1);
};

/** Whether public/tiles/ holds the pinned file: its size, then its hash. */
function inPlace() {
  if (!existsSync(TARGET)) return false;
  const bytes = readFileSync(TARGET);
  return bytes.length === pin.bytes && sha256(bytes) === pin.sha256;
}

/** One file out of a .zip (the central directory at its end says where each entry is). */
function fromZip(zip, name) {
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("not a zip file");
  let at = zip.readUInt32LE(end + 16);
  for (let n = zip.readUInt16LE(end + 10); n > 0; n--) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error("zip directory is damaged");
    const [method, packed, nameLength, extraLength, commentLength, local] = [zip.readUInt16LE(at + 10), zip.readUInt32LE(at + 20), zip.readUInt16LE(at + 28), zip.readUInt16LE(at + 30), zip.readUInt16LE(at + 32), zip.readUInt32LE(at + 42)];
    if (zip.toString("utf8", at + 46, at + 46 + nameLength) === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + packed);
      return method === 0 ? Buffer.from(data) : inflateRawSync(data);
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${name} is not in the zip`);
}

/** One file out of a .tar.gz (512-byte headers, each followed by its file, padded to 512). */
function fromTarGz(archive, name) {
  const tar = gunzipSync(archive);
  for (let at = 0; at + 512 <= tar.length; ) {
    const entry = tar.toString("utf8", at, at + 100).replace(/\0.*$/, "");
    if (!entry) break;
    const size = parseInt(tar.toString("utf8", at + 124, at + 136), 8);
    if (entry.replace(/^\.\//, "") === name) return Buffer.from(tar.subarray(at + 512, at + 512 + size));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${name} is not in the archive`);
}

/** The pinned go-pmtiles binary for this machine, downloaded once into .cache/ and checked against its hash. */
async function tool() {
  const key = `${platform()}-${arch()}`;
  if (!TOOLS[key]) fail(`no pinned go-pmtiles for ${key}. Add it to TOOLS, or extract by hand: pmtiles extract ${SOURCE} ${fileURLToPath(TARGET)} --bbox=${pin.bbox.join(",")} --maxzoom=${pin.maxzoom}`);
  const [asset, hash] = TOOLS[key];
  const binary = platform() === "win32" ? "pmtiles.exe" : "pmtiles";
  const dir = new URL(`../.cache/go-pmtiles-${TOOL_VERSION}-${key}/`, import.meta.url);
  const path = new URL(binary, dir);
  const marker = new URL("archive.sha256", dir);
  if (existsSync(path) && existsSync(marker) && readFileSync(marker, "utf8") === hash) return fileURLToPath(path);

  console.log(`fetch-tiles: downloading go-pmtiles ${TOOL_VERSION} (${asset})`);
  const response = await fetch(`${RELEASE}/${asset}`);
  if (!response.ok) fail(`${RELEASE}/${asset} answered ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  if (sha256(archive) !== hash) fail(`${asset} is not the pinned file (SHA-256 ${sha256(archive)}, expected ${hash}). Nothing was run.`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, asset.endsWith(".zip") ? fromZip(archive, binary) : fromTarGz(archive, binary));
  chmodSync(path, 0o755);
  writeFileSync(marker, hash);
  return fileURLToPath(path);
}

if (process.argv.includes("--check")) {
  if (inPlace()) console.log(`fetch-tiles: public/tiles/${pin.file} is the pinned file`);
  else fail(`public/tiles/${pin.file} is missing or is not the pinned file: run "npm run tiles"`);
} else if (inPlace() && !process.argv.includes("--repin")) {
  console.log(`fetch-tiles: public/tiles/${pin.file} is already there (${(pin.bytes / 1e6).toFixed(1)} MB, build ${pin.build})`);
} else {
  const pmtiles = await tool();
  mkdirSync(OUT_DIR, { recursive: true });
  const partial = fileURLToPath(new URL(`${pin.file}.partial`, OUT_DIR));
  rmSync(partial, { force: true });
  console.log(`fetch-tiles: cutting ${pin.bbox.join(",")} (zooms 0 to ${pin.maxzoom}) out of ${SOURCE}`);
  // The progress bar only where a person watches it: in a log it is thousands of lines.
  const quiet = process.stdout.isTTY ? [] : ["--quiet"];
  const run = spawnSync(pmtiles, ["extract", SOURCE, partial, `--bbox=${pin.bbox.join(",")}`, `--maxzoom=${pin.maxzoom}`, ...quiet], { stdio: "inherit" });
  if (run.status !== 0) {
    rmSync(partial, { force: true });
    fail(`the extract failed (exit ${run.status}). If ${SOURCE} is gone, pick a build from https://build-metadata.protomaps.dev/builds.json and repin.`);
  }
  const bytes = readFileSync(partial);
  if (process.argv.includes("--repin")) {
    const shown = spawnSync(pmtiles, ["show", partial, "--metadata"], { encoding: "utf8" });
    const metadata = shown.status === 0 ? JSON.parse(shown.stdout) : {};
    const next = { ...pin, file: `maritimes-${pin.build}.pmtiles`, osmDataTime: metadata["planetiler:osm:osmosisreplicationtime"] ?? pin.osmDataTime, schema: metadata.version ?? pin.schema, bytes: bytes.length, sha256: sha256(bytes) };
    writeFileSync(PIN_FILE, JSON.stringify(next, null, 2) + "\n");
    renameSync(partial, new URL(next.file, OUT_DIR));
    console.log(`fetch-tiles: repinned to build ${next.build}: ${next.bytes} bytes, SHA-256 ${next.sha256}. Commit src/map/tiles.json.`);
  } else {
    if (bytes.length !== pin.bytes || sha256(bytes) !== pin.sha256) {
      rmSync(partial, { force: true });
      fail(`the extract is not the pinned file (${bytes.length} bytes, SHA-256 ${sha256(bytes)}; expected ${pin.bytes} bytes, ${pin.sha256}). Nothing was kept.`);
    }
    renameSync(partial, TARGET);
    console.log(`fetch-tiles: public/tiles/${pin.file} written (${(pin.bytes / 1e6).toFixed(1)} MB, SHA-256 checked)`);
  }
}
