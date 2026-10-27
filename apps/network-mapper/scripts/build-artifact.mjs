// Packs the `vite build --mode artifact` output into one page for a claude.ai
// Artifact: the publisher wraps it in its own document skeleton, so the page is
// just a title, the inlined stylesheet, the root element and the inlined script.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "dist-artifact", "assets");
const files = readdirSync(assets);
const pick = (ext) => {
  const matches = files.filter((f) => f.endsWith(ext));
  if (matches.length !== 1) throw new Error(`Expected one ${ext} bundle, found ${matches.length}`);
  return readFileSync(join(assets, matches[0]), "utf8");
};
// A literal "</script" or "</style" inside the bundle would end the inline element early.
const js = pick(".js").replace(/<\/script/gi, "<\\/script");
const css = pick(".css").replace(/<\/style/gi, "<\\/style");

const page = `<title>Network Map</title>
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`;
const out = join(root, "dist-artifact", "network-map.html");
writeFileSync(out, page);
console.log(`Wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
