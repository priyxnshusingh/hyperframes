// End-to-end acceptance run for the network mapper, driving a real browser.
// Usage: bun run build && bun run test:e2e   (needs Playwright + Chromium installed)
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(here, "output");
mkdirSync(out, { recursive: true });
const PORT = Number(process.env.PORT ?? 4179);
const BASE = process.env.BASE_URL ?? `http://localhost:${PORT}/?debug`;

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

/** npx spawns vite as a child, so signal the whole process group. */
function stopServer(proc) {
  if (!proc?.pid) return;
  try {
    process.kill(-proc.pid, "SIGTERM");
  } catch {
    proc.kill();
  }
}

async function startServer() {
  if (process.env.BASE_URL) return null;
  const proc = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: root,
    stdio: "pipe",
    detached: true,
  });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/`);
      if (r.ok) return proc;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  stopServer(proc);
  throw new Error("vite preview did not start");
}

const graph = (page) =>
  page.evaluate(() => {
    const cy = window.__networkCy;
    const real = (e) => !e.id().startsWith("__");
    return {
      nodes: cy.nodes().filter(real).length,
      edges: cy.edges().filter(real).length,
      visibleNodes: cy.nodes().filter((n) => real(n) && !n.hasClass("hidden")).length,
      labels: cy
        .nodes()
        .filter(real)
        .map((n) => n.data("label")),
    };
  });

const profileFact = async (page, label) => {
  const dd = page.locator(".profile .facts div", { hasText: label }).locator("dd");
  return (await dd.textContent())?.trim();
};

async function addPerson(page, { name, ctc }) {
  await page.getByPlaceholder("e.g. Friend A").fill(name);
  if (ctc !== undefined) await page.getByLabel("Annual CTC amount").fill(String(ctc));
  await page.locator(".person-form button[type=submit]").click();
  await page.locator(`.profile[aria-label="Profile of ${name}"]`).waitFor();
}

async function selectViaSearch(page, name, { exact = true } = {}) {
  const search = page.getByLabel("Search people on the map");
  await search.fill(name);
  await search.press("Enter");
  await page.locator(exact ? `.profile[aria-label="Profile of ${name}"]` : ".profile").waitFor();
}

async function openTab(page, label) {
  const tab = page.getByRole("tab", { name: label });
  if (!(await tab.isVisible()))
    await page
      .getByLabel(/sidebar/i)
      .first()
      .click();
  await tab.click();
}

const server = await startServer();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

try {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__networkCy));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(out, "00-sample.png") });
  check("Sample network shown on first run", (await graph(page)).nodes === 10);

  await page.getByRole("button", { name: "Start fresh with just me" }).click();
  await page.waitForTimeout(300);
  check("Start fresh leaves only ME", (await graph(page)).nodes === 1);

  // 1. Friend A ↔ ME
  await addPerson(page, { name: "Friend A", ctc: 18 });
  check(
    "1. Friend A added and connected to ME",
    (await profileFact(page, "Connection level")) === "1",
  );

  // 2. Friend X ↔ Friend A (via "New person connected" on A's profile)
  await page.getByRole("button", { name: "+ New person connected" }).click();
  await addPerson(page, { name: "Friend X", ctc: 25 });
  check(
    "2. Friend X connected to Friend A (level 2)",
    (await profileFact(page, "Connection level")) === "2",
  );

  // 3. Friend Y ↔ Friend X
  await page.getByRole("button", { name: "+ New person connected" }).click();
  await addPerson(page, { name: "Friend Y", ctc: 40 });
  check(
    "3. Friend Y connected to Friend X (level 3)",
    (await profileFact(page, "Connection level")) === "3",
  );
  await page.screenshot({ path: join(out, "01-chain.png") });

  // 4 + 5. Connect Friend Y directly to ME via connect mode
  await page.getByRole("button", { name: "Connect to another person" }).click();
  const connectPicker = page.getByPlaceholder("Search a person to connect…");
  await connectPicker.fill("Me");
  await connectPicker.press("Enter");
  await page.waitForTimeout(200);
  let g = await graph(page);
  check(
    "4. Y ↔ ME added without removing existing connections",
    g.edges === 4,
    `${g.edges} connections`,
  );
  check("5. Friend Y's level updated to 1", (await profileFact(page, "Connection level")) === "1");
  await page.screenshot({ path: join(out, "02-y-to-me.png") });

  // 6. Any-to-any: Friend B created with no connections, then connected to Friend X
  await page.getByRole("button", { name: "+ New person connected" }).click();
  await page.getByRole("button", { name: /Don't connect to Friend Y/ }).click();
  await addPerson(page, { name: "Friend B", ctc: undefined });
  check(
    "Person can be created without connections",
    (await profileFact(page, "Connection level")) === "Not connected",
  );
  const addConn = page.getByPlaceholder("Add a connection — search people…");
  await addConn.fill("Friend X");
  await addConn.press("Enter");
  await page.waitForTimeout(200);
  g = await graph(page);
  check(
    "6. Connected two arbitrary people (B ↔ X)",
    g.edges === 5,
    `B level ${await profileFact(page, "Connection level")}`,
  );
  // Duplicate guard
  await addConn.fill("Friend X");
  check(
    "Duplicate connection not offered in picker",
    (await page.locator(".profile .picker-list li").count()) === 0,
  );
  await addConn.fill("");
  check(
    "CTC not added shown for empty CTC",
    (await profileFact(page, "Annual CTC")) === "CTC not added",
  );

  // Triangle / circular: A ↔ B, plus B ↔ ME
  await addConn.fill("Friend A");
  await addConn.press("Enter");
  await addConn.fill("Me");
  await addConn.press("Enter");
  await page.waitForTimeout(200);
  g = await graph(page);
  check("Circular connections supported", g.edges === 7, `${g.edges} connections`);

  // 8. Edit CTC
  await selectViaSearch(page, "Friend A");
  await page.locator(".profile").getByRole("button", { name: "Edit" }).click();
  await page.locator(".profile").getByLabel("Annual CTC amount").fill("20");
  await page.locator(".profile").getByRole("button", { name: "Save changes" }).click();
  check("8. CTC edited and displayed", (await profileFact(page, "Annual CTC")) === "₹20 LPA");
  g = await graph(page);
  check(
    "8. CTC shown on node label",
    g.labels.some((l) => l === "Friend A\n₹20 LPA"),
  );

  // 9. Analytics
  await openTab(page, "Insights");
  const stat = async (label) =>
    (
      await page
        .locator(".analytics .stat", {
          has: page.locator(".stat-label", { hasText: new RegExp(`^${label}$`) }),
        })
        .innerText()
    ).replace(/\s+/g, " ");
  const people = await stat("People in network");
  const direct = await stat("Direct connections");
  const avg = await stat("Average CTC");
  const top = await stat("Highest CTC");
  const avgDirect = await stat("Avg CTC · direct");
  check("9. People count", people.includes(" 4 "), people);
  check("9. Direct connections (A, Y, B)", direct.includes(" 3 "), direct);
  check("9. Average CTC = (20+25+40)/3", avg.includes("₹28.33 LPA") && avg.includes("3 of 4"), avg);
  check("9. Highest CTC = Friend Y", top.includes("₹40 LPA") && top.includes("Friend Y"), top);
  check(
    "9. Avg direct CTC = (20+40)/2 over 2 of 3",
    avgDirect.includes("₹30 LPA") && avgDirect.includes("2 of 3"),
    avgDirect,
  );
  await page.screenshot({ path: join(out, "03-insights.png") });

  // 12. Delete a connection keeps both people
  await selectViaSearch(page, "Friend X");
  await page.getByRole("button", { name: "Remove connection with Friend B" }).click();
  await page.waitForTimeout(200);
  g = await graph(page);
  check(
    "12. Removing a connection keeps both profiles",
    g.edges === 6 && g.nodes === 5,
    `${g.nodes} people, ${g.edges} connections`,
  );

  // Shortest path + filters
  await openTab(page, "Filter & paths");
  const toSlot = page.getByLabel("To", { exact: true });
  await toSlot.fill("Friend X");
  await toSlot.press("Enter");
  const pathText = await page.locator(".path-result").innerText();
  check(
    "Shortest path highlighted (2 hops)",
    pathText.includes("2 hops"),
    pathText.replace(/\s+/g, " "),
  );
  await page.getByRole("radio", { name: "Direct (1)" }).click();
  g = await graph(page);
  check("Filter: direct connections only", g.visibleNodes === 4, `${g.visibleNodes} visible`);
  await page.getByRole("button", { name: "Reset filters" }).click();
  g = await graph(page);
  check("Reset filters shows everyone", g.visibleNodes === 5);
  await page.screenshot({ path: join(out, "04-path.png") });

  // 10. Persistence across reload
  await page.getByLabel("Layout", { exact: true }).selectOption("radial");
  await page.waitForTimeout(1500);
  const positionsOf = () =>
    page.evaluate(() =>
      window.__networkCy
        .nodes()
        .filter((n) => !n.id().startsWith("__"))
        .map((n) => `${n.id()}@${Math.round(n.position().x)},${Math.round(n.position().y)}`)
        .sort()
        .join(" "),
    );
  const before = await positionsOf();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(window.__networkCy));
  await page.waitForTimeout(800);
  g = await graph(page);
  check(
    "10. Refresh preserves people & connections",
    g.nodes === 5 && g.edges === 6,
    `${g.nodes}/${g.edges}`,
  );
  check("10. Refresh preserves CTC", g.labels.includes("Friend A\n₹20 LPA"));
  const after = await positionsOf();
  check(
    "10. Refresh keeps the saved layout and node positions",
    JSON.stringify(before) === JSON.stringify(after) &&
      (await page.getByLabel("Layout", { exact: true }).inputValue()) === "radial",
  );

  // 11. Export → clear → import
  await page.getByRole("button", { name: /Export \/ Import|Data/ }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Export Backup (JSON)" }).click(),
  ]);
  const backupPath = join(out, "backup.json");
  await download.saveAs(backupPath);
  const backup = JSON.parse(readFileSync(backupPath, "utf8"));
  check(
    "11. Export contains people & connections",
    backup.people.length === 5 && backup.connections.length === 6,
  );

  for (const [label, file] of [
    ["Export People & CTC (CSV)", "people.csv"],
    ["Export Map image (PNG)", "map.png"],
    ["Export Map image (SVG)", "map.svg"],
  ]) {
    await page.getByRole("button", { name: /Export \/ Import|Data/ }).click();
    const [d] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: label }).click(),
    ]);
    await d.saveAs(join(out, file));
    check(`Export ${file}`, (await d.failure()) === null);
  }
  const csv = readFileSync(join(out, "people.csv"), "utf8");
  check("CSV includes CTC values", csv.includes("Friend Y,4000000,₹40 LPA"));

  await openTab(page, "Settings");
  await page.getByRole("button", { name: "Clear network…" }).click();
  await page.getByRole("button", { name: "Clear network", exact: true }).click();
  g = await graph(page);
  check("Clear network leaves only ME", g.nodes === 1);
  await page.locator("input[type=file]").first().setInputFiles(backupPath);
  await page.getByRole("button", { name: "Replace with import" }).click();
  await page.waitForTimeout(400);
  g = await graph(page);
  check(
    "11. Import restores people, CTC and connections",
    g.nodes === 5 && g.edges === 6 && g.labels.includes("Friend Y\n₹40 LPA"),
  );

  // Delete a person with confirmation
  await selectViaSearch(page, "Friend B");
  await page.locator(".profile").getByRole("button", { name: "Delete" }).click();
  check("Delete asks for confirmation", await page.getByRole("alertdialog").isVisible());
  await page.getByRole("button", { name: "Delete person" }).click();
  g = await graph(page);
  check(
    "Deleting a person removes only their connections",
    g.nodes === 4 && g.edges === 4,
    `${g.nodes}/${g.edges}`,
  );

  // Undo
  await page.keyboard.press("Control+z");
  g = await graph(page);
  check("Undo restores the deleted person", g.nodes === 5 && g.edges === 6);

  // 7. Scale: 1,000 people
  await openTab(page, "Settings");
  await page.getByRole("button", { name: "Stress test (1,000 people)" }).click();
  const t0 = Date.now();
  await page.getByRole("button", { name: "Load test network" }).click();
  await page.waitForFunction(() => window.__networkCy.nodes().length >= 1001, null, {
    timeout: 30000,
  });
  await page.waitForTimeout(500);
  const loadMs = Date.now() - t0;
  await page.screenshot({ path: join(out, "05-stress-1000.png") });
  const t1 = Date.now();
  await selectViaSearch(page, "Aarav", { exact: false });
  const selectMs = Date.now() - t1;
  const t2 = Date.now();
  await page.locator(".profile").getByRole("button", { name: "Edit" }).click();
  await page.locator(".profile").getByLabel("Annual CTC amount").fill("77");
  await page.locator(".profile").getByRole("button", { name: "Save changes" }).click();
  const editMs = Date.now() - t2;
  check("7. 1,000 people load and lay out", loadMs < 20000, `${loadMs} ms`);
  check("7. Selecting stays responsive at 1,000 people", selectMs < 2000, `${selectMs} ms`);
  check("7. Editing stays responsive at 1,000 people", editMs < 2000, `${editMs} ms`);
  await page.screenshot({ path: join(out, "06-stress-selected.png") });

  // Mobile viewport smoke check
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check("Mobile layout has no horizontal scroll", overflow <= 0, `${overflow}px`);
  await page.screenshot({ path: join(out, "07-mobile.png") });

  check("No runtime errors in the console", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (err) {
  failures++;
  console.error(err);
  await page.screenshot({ path: join(out, "failure.png") }).catch(() => {});
} finally {
  await browser.close();
  stopServer(server);
}

console.log(failures === 0 ? "\nAll acceptance checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
