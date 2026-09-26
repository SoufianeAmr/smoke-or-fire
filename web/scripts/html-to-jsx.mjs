// Convert one design/screens/*.html file to JSX, keeping every style, attribute and SVG path.
//
//   node scripts/html-to-jsx.mjs ../design/screens/02-q1-flames.html > out.jsx
//
// <sc-if value="{{x}}">…</sc-if> becomes {x && (<>…</>)}; "{{x}}" attribute values become {x};
// sc-camel-* attributes are the camelCase ones (sc-camel-view-box → viewBox, sc-camel-on-click → onClick).
// The output is a starting point: screens are then wired to strings, state and data by hand.
import { readFileSync } from "node:fs";
import { parseDocument } from "htmlparser2";

const file = process.argv[2];
const html = readFileSync(file, "utf8");
const doc = parseDocument(html, { decodeEntities: false, lowerCaseAttributeNames: false });

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const RENAME = { class: "className", for: "htmlFor", tabindex: "tabIndex", autocomplete: "autoComplete", readonly: "readOnly" };

function styleObject(css) {
  const parts = css.split(";").map((p) => p.trim()).filter(Boolean).map((decl) => {
    const i = decl.indexOf(":");
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    const key = prop.startsWith("--") ? JSON.stringify(prop) : camel(prop);
    return `${key}: ${JSON.stringify(value)}`;
  });
  return `{{ ${parts.join(", ")} }}`;
}

function attr(name, value) {
  if (name === "hint-placeholder-val" || name === "xmlns") return null;
  if (name.startsWith("sc-camel-")) name = camel(name.slice("sc-camel-".length));
  else if (RENAME[name]) name = RENAME[name];
  else if (!name.startsWith("aria-") && !name.startsWith("data-") && name.includes("-")) name = camel(name);
  const binding = /^\{\{\s*(\w+)\s*\}\}$/.exec(value ?? "");
  if (binding) return `${name}={${binding[1]}}`;
  if (name === "style") return `style=${styleObject(value)}`;
  if (value === "" || value === undefined) return name;
  return `${name}=${JSON.stringify(value.replace(/&amp;/g, "&").replace(/&quot;/g, '"'))}`;
}

function text(t) {
  if (!t.trim()) return "";
  return t.replace(/\{/g, "{'{'}").replace(/\}/g, "{'}'}").replace(/\s*\n\s*/g, " ");
}

function emit(node, depth) {
  const pad = "  ".repeat(depth);
  if (node.type === "text") {
    const t = text(node.data);
    return t ? pad + t : "";
  }
  if (node.type === "comment" || node.type === "directive") return "";
  if (node.type !== "tag" && node.type !== "script" && node.type !== "style") return "";
  if (node.name === "helmet" || node.name === "script" || node.name === "style") return "";
  const children = node.children.map((c) => emit(c, depth + 1)).filter(Boolean);
  if (node.name === "sc-if") {
    const cond = /\{\{\s*(\w+)\s*\}\}/.exec(node.attribs.value)[1];
    return `${pad}{${cond} && (\n${pad}  <>\n${children.join("\n")}\n${pad}  </>\n${pad})}`;
  }
  if (node.name === "x-dc") return children.join("\n");
  const attrs = Object.entries(node.attribs).map(([k, v]) => attr(k, v)).filter(Boolean);
  const open = `<${node.name}${attrs.length ? " " + attrs.join(" ") : ""}`;
  if (!children.length) return `${pad}${open} />`;
  return `${pad}${open}>\n${children.join("\n")}\n${pad}</${node.name}>`;
}

const root = doc.children.find((n) => n.name === "html");
const body = root.children.find((n) => n.name === "body");
const xdc = body.children.find((n) => n.name === "x-dc");
console.log(emit(xdc, 0));
const logic = body.children.find((n) => n.name === "script" && n.attribs.type === "text/x-dc");
if (logic) console.log("\n/* logic script:\n" + logic.children.map((c) => c.data).join("") + "\n*/");
