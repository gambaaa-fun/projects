import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sitesPath = path.join(root, "sites.txt");
const publicDir = path.join(root, "public");
const screenshotsDir = path.join(publicDir, "screenshots");
const snapshotsDir = path.join(publicDir, "snapshots");
const snapshotsManifestPath = path.join(publicDir, "snapshots.json");
const targetDomain = "gambaaa.fun";
const fallbackGithubOwner = "gambaaa-fun";
const crawlLimit = positiveInteger(process.env.CRAWL_LIMIT) || 10;
const backfillLimit =
  process.env.BACKFILL_LIMIT === "0"
    ? Number.POSITIVE_INFINITY
    : positiveInteger(process.env.BACKFILL_LIMIT) || 250;
const groupParallelism = positiveInteger(process.env.GROUP_PARALLELISM) || 2;
const debugCommits = process.env.DEBUG_COMMITS !== "0";
const screenshotFormat = imageFormat(process.env.SCREENSHOT_FORMAT) || "webp";
const screenshotQuality =
  boundedNumber(process.env.SCREENSHOT_QUALITY, 0, 1) ?? 0.82;
const skipScreenshots =
  process.argv.includes("--skip-screenshots") ||
  process.env.SKIP_SCREENSHOTS === "1";
const noBrowser =
  process.argv.includes("--no-browser") || process.env.NO_BROWSER === "1";

const generatedAt = new Date();
await mkdir(screenshotsDir, { recursive: true });
await mkdir(snapshotsDir, { recursive: true });

const groups = parseGroups(await readFile(sitesPath, "utf8"));
const snapshotArchive = await loadSnapshotArchive();
await recoverLocalSnapshots(snapshotArchive);
const browserTools = await loadBrowserTools();
const browser = await launchBrowser(browserTools);
let renderedGroups = groups.map((group) => ({
  name: group.name,
  sites: [],
}));
let savingGeneratedOutput = false;
let stopRequested = false;
let stopSignal = null;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopRequested = true;
    stopSignal = signal;
    console.log(
      `\n[stop] ${signal} received, finishing current page work before saving...`,
    );
  });
}

try {
  console.log(
    `[groups] processing ${groups.length} groups with ${Math.min(groupParallelism, groups.length)} workers`,
  );
  await parallelMap(groups, groupParallelism, (group, index) =>
    renderGroup(browser, group, renderedGroups[index]),
  );
} finally {
  if (browser) {
    await browser.close();
  }
}

await saveGeneratedOutput(stopSignal || "complete");

if (stopSignal) {
  process.exit(stopSignal === "SIGINT" ? 130 : 143);
}

async function renderGroup(browser, group, renderedGroup) {
  for (const [siteIndex, originalUrl] of group.sites.entries()) {
    if (stopRequested) {
      console.log(`[stop] ${group.name}: not starting remaining sites`);
      break;
    }

    renderedGroup.sites.push(
      await renderSite(browser, group, siteIndex, originalUrl),
    );
  }

  return renderedGroup;
}

async function saveGeneratedOutput(reason) {
  if (savingGeneratedOutput) {
    return;
  }

  savingGeneratedOutput = true;
  await writeSnapshotListings(snapshotArchive);
  const groupsToSave = renderedGroups.filter(Boolean);
  await writeFile(
    snapshotsManifestPath,
    JSON.stringify(snapshotArchive, null, 2),
    "utf8",
  );
  await writeFile(
    path.join(publicDir, "404.html"),
    renderHtml(groupsToSave),
    "utf8",
  );
  await writeFile(
    path.join(publicDir, "sitemap.xml"),
    renderSitemap(groupsToSave),
    "utf8",
  );
  savingGeneratedOutput = false;
  console.log(
    `[save] ${reason}: wrote ${groupsToSave.reduce((sum, group) => sum + group.sites.length, 0)} rendered sites`,
  );
}

async function writeSnapshotListings(archive) {
  for (const siteArchive of Object.values(archive.sites || {})) {
    for (const snapshot of siteArchive.snapshots || []) {
      const snapshotRoot = path.join(
        snapshotsDir,
        siteArchive.id,
        snapshot.key,
      );
      const siteRoot = path.join(snapshotRoot, "site");
      const assetsRoot = path.join(snapshotRoot, "assets");
      if (!(await fileExists(snapshotRoot))) {
        continue;
      }

      if (await fileExists(assetsRoot)) {
        await repairCapturedAssetFolder(assetsRoot);
      }

      if (await fileExists(siteRoot)) {
        await repairLocalStaticFiles(siteArchive, siteRoot);
        await writeDirectoryListings(siteArchive, snapshot, siteRoot, siteRoot);
      }

      await writeDirectoryListing(
        siteArchive,
        snapshot,
        snapshotRoot,
        snapshotRoot,
      );
    }
  }
}

async function repairLocalStaticFiles(siteArchive, siteRoot) {
  const files = await recursiveFiles(siteRoot).catch(() => []);
  const deployFiles = files
    .filter((filePath) => isUsefulRepoFile(filePath))
    .map((filePath) => ({
      repoPath: path
        .relative(siteRoot, filePath)
        .split(path.sep)
        .join(path.posix.sep),
      localPath: path
        .relative(siteRoot, filePath)
        .split(path.sep)
        .join(path.posix.sep),
    }));

  for (const file of deployFiles) {
    if (!/\.(html?|css)$/i.test(file.localPath)) {
      continue;
    }

    const outputPath = path.join(siteRoot, ...file.localPath.split("/"));
    const bytes = await readFile(outputPath);
    await writeFile(
      outputPath,
      rewriteStaticFile(
        bytes,
        file.localPath,
        deployFiles,
        siteArchive.originalUrl,
      ),
    );
  }
}

async function repairCapturedAssetFolder(assetsRoot) {
  const files = await recursiveFiles(assetsRoot).catch(() => []);
  const cssFiles = files.filter((filePath) => /\.css$/i.test(filePath));
  const aliases = new Map();

  for (const filePath of cssFiles) {
    const css = await readFile(filePath, "utf8").catch(() => "");
    for (const layer of cssLayerNames(css)) {
      aliases.set(`${layer}.css`, path.basename(filePath));
    }
  }

  if (aliases.size === 0) {
    return;
  }

  for (const filePath of cssFiles) {
    const css = await readFile(filePath, "utf8");
    const repaired = rewriteCssLocalAliases(css, aliases);
    if (repaired !== css) {
      await writeFile(filePath, repaired, "utf8");
    }
  }
}

function cssLayerNames(css) {
  return [...css.matchAll(/@layer\s+([a-z0-9_-]+)\s*(?:[{;]|$)/gi)].map(
    (match) => match[1],
  );
}

function rewriteCssLocalAliases(css, aliases) {
  let rewritten = css;

  for (const [alias, fileName] of aliases) {
    if (alias === fileName) {
      continue;
    }

    const escapedAlias = escapeRegExp(alias);
    rewritten = rewritten.replace(
      new RegExp(`(["'(])(?:\\.\\/)?${escapedAlias}(["')])`, "g"),
      (match, open, close) => `${open}./${fileName}${close}`,
    );
  }

  return rewritten;
}

function escapeRegExp(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

async function writeDirectoryListings(
  siteArchive,
  snapshot,
  rootDir,
  currentDir,
) {
  await writeDirectoryListing(siteArchive, snapshot, rootDir, currentDir);
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(
    () => [],
  );

  for (const entry of entries) {
    if (entry.isDirectory()) {
      await writeDirectoryListings(
        siteArchive,
        snapshot,
        rootDir,
        path.join(currentDir, entry.name),
      );
    }
  }
}

async function writeDirectoryListing(
  siteArchive,
  snapshot,
  rootDir,
  currentDir,
) {
  const entries = await readdir(currentDir, { withFileTypes: true }).catch(
    () => [],
  );
  const rows = entries
    .filter((entry) => entry.name !== "_listing.html")
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) {
        return a.isDirectory() ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    })
    .map((entry) => {
      const suffix = entry.isDirectory() ? "/" : "";
      const href = entry.isDirectory()
        ? `${encodeURIComponent(entry.name)}/_listing.html`
        : encodeURIComponent(entry.name);
      return `<li><a href="${href}">${escapeHtml(entry.name)}${suffix}</a></li>`;
    })
    .join("");
  const relativeDir = path
    .relative(rootDir, currentDir)
    .split(path.sep)
    .join(path.posix.sep);
  const title = relativeDir || "snapshot root";
  const parent =
    currentDir === rootDir ? "" : `<p><a href="../_listing.html">../</a></p>`;

  await writeFile(
    path.join(currentDir, "_listing.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(siteArchive.originalUrl || siteArchive.id)} ${escapeHtml(snapshot.key)}</title>
    <style>
      body { margin: 0; padding: 24px; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17202a; background: #f7f7f4; }
      h1 { margin: 0 0 6px; font-size: 20px; }
      p { margin: 0 0 18px; color: #5f6b76; }
      ul { margin: 0; padding: 0; list-style: none; border: 1px solid #d8ddd2; background: white; }
      li + li { border-top: 1px solid #edf0e9; }
      a { display: block; padding: 10px 12px; color: #114b5f; text-decoration: none; }
      a:hover { background: #edf7f6; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(siteArchive.originalUrl || "")} at ${escapeHtml(snapshot.label || snapshot.key)}</p>
    ${parent}
    <ul>${rows || "<li><a>empty folder</a></li>"}</ul>
  </body>
</html>`,
    "utf8",
  );
}

async function renderSite(browser, group, siteIndex, originalUrl) {
  console.log(
    `[site] ${group.name} ${siteIndex + 1}/${group.sites.length}: ${originalUrl}`,
  );

  const [readme, latestCommit] = await Promise.all([
    readmeInfoFromSiteUrl(originalUrl),
    latestCommitInfoFromSiteUrl(originalUrl),
  ]);
  const result = await inspectSite(browser, originalUrl, latestCommit);

  return {
    originalUrl,
    repoName: repoNameFromUrl(originalUrl),
    repoUrl: repoUrlFromSiteUrl(originalUrl),
    readme,
    latestCommit,
    finalUrl: result.finalUrl,
    isGambaaa: isGambaaaHost(result.finalUrl),
    screenshot: result.gallery[0]?.screenshot || null,
    gallery: result.gallery,
    snapshots: result.snapshots,
    metadata: result.metadata,
    status: result.status,
    error: result.error,
  };
}

async function parallelMap(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      if (stopRequested) {
        break;
      }

      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

function parseGroups(content) {
  const groups = [];
  let current = { name: null, sites: [] };

  const pushCurrent = () => {
    if (current.sites.length === 0) {
      current = { name: null, sites: [] };
      return;
    }

    groups.push({
      name: current.name || `Group ${groups.length + 1}`,
      sites: current.sites,
    });
    current = { name: null, sites: [] };
  };

  for (const rawLine of content.split(/\r?\n/g)) {
    const line = rawLine.trim();

    if (!line) {
      pushCurrent();
      continue;
    }

    if (line.startsWith("#")) {
      pushCurrent();
      current.name = line.replace(/^#+\s*/, "").trim() || null;
      continue;
    }

    current.sites.push(line);
  }

  pushCurrent();
  return groups;
}

async function loadBrowserTools() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

async function launchBrowser(browserTools) {
  if (noBrowser) {
    console.log("Browser disabled, reusing local snapshots.");
    return null;
  }

  if (!browserTools) {
    return null;
  }

  const managedBrowsers = [
    ["Chromium", browserTools.chromium],
    ["Firefox", browserTools.firefox],
    ["WebKit", browserTools.webkit],
  ];

  for (const [name, browserType] of managedBrowsers) {
    try {
      const browser = await browserType.launch({ headless: true });
      console.log(`Using Playwright ${name}.`);
      return browser;
    } catch {
      // Keep looking for another browser.
    }
  }

  for (const candidate of await browserCandidates()) {
    const executablePath = await findExecutable(candidate);
    if (!executablePath) {
      continue;
    }

    try {
      const browser = await browserTools[candidate.type].launch({
        executablePath,
        headless: true,
        args: candidate.type === "chromium" ? systemChromiumArgs() : [],
      });
      console.log(`Using ${candidate.name} at ${executablePath}.`);
      return browser;
    } catch (error) {
      console.warn(
        `Found ${candidate.name} at ${executablePath}, but could not launch it: ${
          error instanceof Error ? error.message.split("\n")[0] : String(error)
        }`,
      );
    }
  }

  console.warn(
    "No compatible browser executable found, generating placeholders instead.",
  );
  return null;
}

async function browserCandidates() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
  const programFilesX86 =
    process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
  const commands = await pathCommandCandidates();

  return [
    {
      name: "Google Chrome",
      type: "chromium",
      paths: [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        path.join(
          home,
          "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ),
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/snap/bin/chromium",
        path.join(programFiles, "Google/Chrome/Application/chrome.exe"),
        path.join(programFilesX86, "Google/Chrome/Application/chrome.exe"),
        path.join(localAppData, "Google/Chrome/Application/chrome.exe"),
        ...commands.chrome,
      ],
    },
    {
      name: "Chromium",
      type: "chromium",
      paths: [
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        path.join(home, "Applications/Chromium.app/Contents/MacOS/Chromium"),
        "/usr/local/bin/chromium",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/snap/bin/chromium",
        path.join(programFiles, "Chromium/Application/chrome.exe"),
        path.join(programFilesX86, "Chromium/Application/chrome.exe"),
        ...commands.chromium,
      ],
    },
    {
      name: "Microsoft Edge",
      type: "chromium",
      paths: [
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        path.join(
          home,
          "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ),
        "/usr/bin/microsoft-edge",
        "/usr/bin/microsoft-edge-stable",
        path.join(programFiles, "Microsoft/Edge/Application/msedge.exe"),
        path.join(programFilesX86, "Microsoft/Edge/Application/msedge.exe"),
        path.join(localAppData, "Microsoft/Edge/Application/msedge.exe"),
        ...commands.edge,
      ],
    },
    {
      name: "Brave",
      type: "chromium",
      paths: [
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        path.join(
          home,
          "Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        ),
        "/usr/bin/brave-browser",
        "/usr/bin/brave",
        "/snap/bin/brave",
        path.join(
          programFiles,
          "BraveSoftware/Brave-Browser/Application/brave.exe",
        ),
        path.join(
          programFilesX86,
          "BraveSoftware/Brave-Browser/Application/brave.exe",
        ),
        path.join(
          localAppData,
          "BraveSoftware/Brave-Browser/Application/brave.exe",
        ),
        ...commands.brave,
      ],
    },
    {
      name: "Firefox",
      type: "firefox",
      paths: [
        "/Applications/Firefox.app/Contents/MacOS/firefox",
        path.join(home, "Applications/Firefox.app/Contents/MacOS/firefox"),
        "/usr/bin/firefox",
        "/usr/local/bin/firefox",
        "/snap/bin/firefox",
        path.join(programFiles, "Mozilla Firefox/firefox.exe"),
        path.join(programFilesX86, "Mozilla Firefox/firefox.exe"),
        path.join(localAppData, "Mozilla Firefox/firefox.exe"),
        ...commands.firefox,
      ],
    },
  ];
}

async function pathCommandCandidates() {
  const pathDirs = (process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  const commandMap = {
    chrome: ["google-chrome", "google-chrome-stable", "chrome"],
    chromium: ["chromium", "chromium-browser"],
    edge: ["microsoft-edge", "microsoft-edge-stable", "msedge"],
    brave: ["brave-browser", "brave"],
    firefox: ["firefox"],
  };

  return Object.fromEntries(
    await Promise.all(
      Object.entries(commandMap).map(async ([key, commands]) => [
        key,
        (
          await Promise.all(
            commands.flatMap((command) =>
              pathDirs.map(async (dir) => {
                const candidate = path.join(dir, command);
                return (await fileExists(candidate, constants.X_OK))
                  ? candidate
                  : null;
              }),
            ),
          )
        ).filter(Boolean),
      ]),
    ),
  );
}

async function findExecutable(candidate) {
  for (const executablePath of unique(candidate.paths.filter(Boolean))) {
    if (await fileExists(executablePath, constants.X_OK)) {
      return executablePath;
    }
  }

  return null;
}

async function fileExists(filePath, mode = constants.F_OK) {
  try {
    await access(filePath, mode);
    return true;
  } catch {
    return false;
  }
}

async function loadSnapshotArchive() {
  try {
    const archive = JSON.parse(await readFile(snapshotsManifestPath, "utf8"));
    if (archive && typeof archive === "object" && archive.version === 1) {
      archive.sites ||= {};
      return archive;
    }
  } catch {
    // No archive exists yet.
  }

  return {
    version: 1,
    generatedAt: null,
    sites: {},
  };
}

async function recoverLocalSnapshots(archive) {
  const siteEntries = await readdir(snapshotsDir, {
    withFileTypes: true,
  }).catch(() => []);

  for (const siteEntry of siteEntries) {
    if (!siteEntry.isDirectory()) {
      continue;
    }

    const siteArchive = archive.sites?.[siteEntry.name];
    if (!siteArchive) {
      continue;
    }

    const siteSnapshotDir = path.join(snapshotsDir, siteEntry.name);
    const snapshotEntries = await readdir(siteSnapshotDir, {
      withFileTypes: true,
    }).catch(() => []);

    for (const snapshotEntry of snapshotEntries) {
      if (!snapshotEntry.isDirectory()) {
        continue;
      }

      const key = snapshotEntry.name;
      const existing = (siteArchive.snapshots || []).find(
        (snapshot) => snapshot.key === key,
      );

      if (snapshotHasLocalPages(existing)) {
        continue;
      }

      const recovered = await snapshotFromLocalFiles(siteArchive, key);
      if (recovered) {
        updateSiteArchive(siteArchive, {
          ...recovered,
          ...existing,
          capturedAt: existing?.capturedAt || recovered.capturedAt,
          timestamp: existing?.timestamp || recovered.timestamp,
          label: existing?.label || recovered.label,
          metadata: existing?.metadata || recovered.metadata,
          pages: recovered.pages,
        });
      }
    }
  }
}

async function snapshotFromLocalFiles(siteArchive, key) {
  const snapshotRoot = path.join(snapshotsDir, siteArchive.id, key);
  const siteRoot = path.join(snapshotRoot, "site");
  const pagesRoot = path.join(snapshotRoot, "pages");
  const sitePages = await localHtmlFiles(siteRoot);
  const capturedPages = await localHtmlFiles(pagesRoot);
  const localPages = sitePages.length > 0 ? sitePages : capturedPages;

  if (localPages.length === 0) {
    return null;
  }

  const snapshotInfo = await stat(snapshotRoot).catch(() => null);
  const capturedAt = snapshotInfo?.mtime
    ? snapshotInfo.mtime.toISOString()
    : generatedAt.toISOString();
  const timestamp =
    snapshotInfo?.mtimeMs || Date.parse(capturedAt) || Date.now();
  const originalUrl = siteArchive.originalUrl || siteArchive.canonicalUrl || "";

  return {
    key,
    capturedAt,
    timestamp,
    label: key,
    source: "local",
    metadata: emptyMetadata(),
    pages: await Promise.all(
      localPages.map(async (localPage, index) => ({
        url: localPageUrl(originalUrl, localPage, index),
        title:
          (await titleFromLocalHtml(localPage)) || pageLabelFromUrl(localPage),
        screenshot: null,
        localPage,
        status: null,
      })),
    ),
  };
}

async function localHtmlFiles(rootDir) {
  const files = await recursiveFiles(rootDir).catch(() => []);
  return files
    .filter((filePath) => /\.html?$/i.test(filePath))
    .sort((a, b) => {
      const aIndex = /(^|\/)index\.html?$/i.test(a) ? 0 : 1;
      const bIndex = /(^|\/)index\.html?$/i.test(b) ? 0 : 1;
      return aIndex - bIndex || a.localeCompare(b);
    })
    .map((filePath) =>
      path.relative(publicDir, filePath).split(path.sep).join(path.posix.sep),
    )
    .filter((filePath) => !filePath.startsWith(".."));
}

async function recursiveFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await recursiveFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

async function titleFromLocalHtml(localPage) {
  const html = await readFile(path.join(publicDir, localPage), "utf8").catch(
    () => "",
  );
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() || "";
}

function localPageUrl(originalUrl, localPage, index) {
  if (!originalUrl || !localPage.includes("/site/")) {
    return originalUrl || localPage;
  }

  const relative = localPage.split("/site/")[1] || "";
  if (index === 0 && /^index\.html?$/i.test(relative)) {
    return originalUrl;
  }

  try {
    return new URL(
      relative,
      originalUrl.endsWith("/") ? originalUrl : `${originalUrl}/`,
    ).href;
  } catch {
    return originalUrl;
  }
}

function siteArchiveForUrl(rawUrl) {
  const key = canonicalUrl(rawUrl);
  const id = hashUrl(key);
  snapshotArchive.sites[id] ||= {
    id,
    originalUrl: rawUrl,
    canonicalUrl: key,
    snapshots: [],
  };

  return snapshotArchive.sites[id];
}

function snapshotKeyFromCommit(commitInfo) {
  if (commitInfo?.sha) {
    return commitInfo.sha.slice(0, 12);
  }

  if (commitInfo?.timestamp) {
    return String(commitInfo.timestamp);
  }

  return "unknown";
}

function snapshotLabel(commitInfo, capturedAt) {
  if (commitInfo?.date) {
    return new Date(commitInfo.date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Europe/Prague",
    });
  }

  return new Date(capturedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Europe/Prague",
  });
}

function currentSnapshotFromArchive(siteArchive, snapshotKey) {
  return (siteArchive.snapshots || []).find(
    (snapshot) =>
      snapshot.key === snapshotKey &&
      Array.isArray(snapshot.pages) &&
      snapshot.pages.some((page) => page.localPage),
  );
}

function snapshotHasLocalPages(snapshot) {
  return (
    Array.isArray(snapshot?.pages) &&
    snapshot.pages.some((page) => page?.localPage)
  );
}

function updateSiteArchive(siteArchive, snapshot) {
  if (!snapshotHasLocalPages(snapshot)) {
    return;
  }

  const retained = (siteArchive.snapshots || []).filter(
    (item) => item.key !== snapshot.key,
  );
  siteArchive.snapshots = [snapshot, ...retained]
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    .slice(0, 80);
  snapshotArchive.generatedAt = generatedAt.toISOString();
}

function unique(values) {
  return [...new Set(values)];
}

function systemChromiumArgs() {
  return [
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--no-sandbox",
  ];
}

async function inspectSite(browser, originalUrl, latestCommit) {
  const siteArchive = siteArchiveForUrl(originalUrl);
  await backfillRepositorySnapshots(originalUrl, siteArchive).catch((error) => {
    console.warn(
      `[backfill] ${originalUrl}: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  const snapshotKey = snapshotKeyFromCommit(latestCommit);
  const existingSnapshot = currentSnapshotFromArchive(siteArchive, snapshotKey);

  if (existingSnapshot) {
    console.log(`[snapshot] reused ${siteArchive.id}/${snapshotKey}`);
    return {
      finalUrl: existingSnapshot.pages[0]?.url || originalUrl,
      gallery: pagesToGallery(existingSnapshot.pages),
      snapshots: siteArchive.snapshots,
      metadata: existingSnapshot.metadata || emptyMetadata(),
      status: existingSnapshot.pages.length > 0 ? "Loaded" : "Load failed",
      error:
        existingSnapshot.pages.length > 0
          ? null
          : "No snapshots were captured.",
    };
  }

  if (!browser) {
    return {
      finalUrl: await fetchFinalUrl(originalUrl),
      gallery: [],
      snapshots: siteArchive.snapshots || [],
      metadata: emptyMetadata(),
      status: "Preview pending",
      error:
        "Install dependencies and rerun the generator to capture screenshots.",
    };
  }

  try {
    const result = await crawlSite(browser, originalUrl, {
      siteArchive,
      snapshotKey,
      latestCommit,
    });
    updateSiteArchive(siteArchive, result.snapshot);

    return {
      finalUrl: result.gallery[0]?.url || originalUrl,
      gallery: result.gallery,
      snapshots: siteArchive.snapshots,
      metadata: result.metadata,
      status: result.gallery.length > 0 ? "Loaded" : "Load failed",
      error: result.gallery.length > 0 ? null : "No screenshots were captured.",
    };
  } catch (error) {
    return {
      finalUrl: originalUrl,
      gallery: [],
      snapshots: siteArchive.snapshots || [],
      metadata: emptyMetadata(),
      status: "Load failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function crawlSite(browser, originalUrl, snapshotContext) {
  const queue = [normalizeUrl(originalUrl)];
  const queued = new Set(queue);
  const captured = new Set();
  const galleryKeys = new Set();
  const gallery = [];
  const pages = [];
  const assetMap = new Map();
  const assetSources = new Map();
  const snapshotRoot = path.join(
    snapshotsDir,
    snapshotContext.siteArchive.id,
    snapshotContext.snapshotKey,
  );
  const assetsRoot = path.join(snapshotRoot, "assets");
  const pagesRoot = path.join(snapshotRoot, "pages");
  const originalScope = siteScopeFromUrl(originalUrl);
  let scope = null;
  let robots = null;
  let metadata = emptyMetadata();

  await mkdir(assetsRoot, { recursive: true });
  await mkdir(pagesRoot, { recursive: true });

  while (queue.length > 0 && gallery.length < crawlLimit) {
    const url = queue.shift();
    if (!url || captured.has(url)) {
      continue;
    }

    const page = await browser.newPage({
      viewport: { width: 1366, height: 900 },
      deviceScaleFactor: 1,
    });
    const pendingAssets = new Set();

    page.on("response", (response) => {
      if (!scope) {
        return;
      }

      const download = saveLocalAsset(
        response,
        scope,
        assetsRoot,
        snapshotRoot,
        assetMap,
        assetSources,
      )
        .catch(() => null)
        .finally(() => pendingAssets.delete(download));
      pendingAssets.add(download);
    });

    try {
      console.log(`[crawl] ${url}`);
      const response = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      await page
        .waitForLoadState("networkidle", { timeout: 5000 })
        .catch(() => {});

      const finalUrl = normalizeUrl(page.url());
      captured.add(finalUrl);
      captured.add(url);

      if (!scope) {
        scope =
          new URL(finalUrl).origin === originalScope.origin
            ? originalScope
            : siteScopeFromUrl(finalUrl);
        robots = await loadRobots(scope.origin);
      }

      if (robots && !isAllowedByRobots(finalUrl, robots)) {
        captured.add(finalUrl);
        continue;
      }

      const title = await page.title().catch(() => "");
      const screenshotName = snapshotFileNameForKey(
        `${snapshotContext.siteArchive.id}/${snapshotContext.snapshotKey}/${finalUrl}`,
      );
      const screenshotPath = path.join(snapshotRoot, screenshotName);
      const screenshotUrl = path.posix.join(
        "snapshots",
        snapshotContext.siteArchive.id,
        snapshotContext.snapshotKey,
        screenshotName,
      );
      const galleryKey = canonicalUrl(finalUrl);
      const screenshotExists = await fileExists(screenshotPath);

      if (galleryKeys.has(galleryKey)) {
        console.log(`[gallery] duplicate skipped: ${finalUrl}`);
      } else if (!skipScreenshots || !screenshotExists) {
        await writeOptimizedScreenshot(page, screenshotPath);
        console.log(
          `[screenshot] saved ${screenshotUrl}${skipScreenshots ? " (missing)" : ""}`,
        );
      } else {
        console.log(`[screenshot] reused ${screenshotUrl}`);
      }

      if (!galleryKeys.has(galleryKey)) {
        await Promise.allSettled([...pendingAssets]);
        await rewriteCapturedAssets(assetSources, assetMap);
        const localPage = await saveLocalPage(
          page,
          finalUrl,
          pagesRoot,
          snapshotRoot,
          assetMap,
        );
        galleryKeys.add(galleryKey);
        const pageRecord = {
          url: finalUrl,
          title: title || pageLabelFromUrl(finalUrl),
          screenshot: screenshotUrl,
          localPage,
          status: response ? response.status() : null,
        };
        pages.push(pageRecord);
        gallery.push(pageRecord);
      }

      if (gallery.length === 1) {
        const sitemapUrls = await discoverSitemapUrls(scope.origin, robots);
        metadata = {
          ...(await inspectPageMetadata(page)),
          robots: robots?.exists || false,
          sitemap: sitemapUrls.length > 0,
          sitemapUrls,
          loadMs: await pageLoadMs(page),
        };
      }

      const links = await page
        .locator("a[href]")
        .evaluateAll((anchors) => anchors.map((anchor) => anchor.href))
        .catch(() => []);

      for (const link of links) {
        const normalized = normalizeCrawlLink(link, scope);
        if (
          !normalized ||
          queued.has(normalized) ||
          captured.has(normalized) ||
          (robots && !isAllowedByRobots(normalized, robots))
        ) {
          continue;
        }

        queued.add(normalized);
        queue.push(normalized);
      }
    } catch (error) {
      captured.add(url);
      console.warn(
        `Could not crawl ${url}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      );
    } finally {
      await page.close();
    }
  }

  await rewriteCapturedAssets(assetSources, assetMap);

  const capturedAt = generatedAt.toISOString();
  const timestamp =
    snapshotContext.latestCommit?.timestamp ||
    Date.parse(capturedAt) ||
    Date.now();
  const snapshot = {
    key: snapshotContext.snapshotKey,
    capturedAt,
    timestamp,
    label: snapshotLabel(snapshotContext.latestCommit, capturedAt),
    commit: snapshotContext.latestCommit || emptyCommitInfo(),
    metadata,
    pages,
  };

  return { gallery, metadata, snapshot };
}

function pagesToGallery(pages = []) {
  return pages.map((page) => ({
    url: page.url,
    title: page.title || pageLabelFromUrl(page.url),
    screenshot: page.screenshot,
    localPage: page.localPage,
    status: page.status || null,
  }));
}

async function backfillRepositorySnapshots(originalUrl, siteArchive) {
  const repo = repoInfoFromSiteUrl(originalUrl);
  const checkout = await cloneRepositoryForBackfill(repo).catch((error) => {
    console.warn(
      `[backfill] ${repo.owner}/${repo.name}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  });

  if (!checkout) {
    return;
  }

  try {
    const commits = await listRepoCommitsFromGit(checkout.dir, repo);

    if (commits.length === 0) {
      return;
    }

    siteArchive.repo ||= repo;
    siteArchive.pagesBuildType = "git";

    for (const commit of commits) {
      if (currentSnapshotFromArchive(siteArchive, commit.sha.slice(0, 12))) {
        continue;
      }

      const snapshot = await snapshotFromRepoCheckout(
        checkout.dir,
        repo,
        originalUrl,
        siteArchive,
        commit,
      ).catch((error) => {
        console.warn(
          `[backfill] ${repo.owner}/${repo.name}@${commit.sha.slice(0, 7)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      });

      if (snapshot) {
        siteArchive.publishRoot = snapshot.publishRoot;
        updateSiteArchive(siteArchive, snapshot);
        console.log(
          `[backfill] saved ${repo.owner}/${repo.name}@${commit.sha.slice(0, 7)} from ${snapshot.publishRoot || "/"}`,
        );
      }
    }
  } finally {
    await rm(checkout.parent, { recursive: true, force: true }).catch(() => {});
  }
}

async function cloneRepositoryForBackfill(repo) {
  const parent = await mkdtemp(path.join(tmpdir(), "gambaaa-backfill-"));
  const dir = path.join(parent, repo.name);
  const depth = Number.isFinite(backfillLimit)
    ? Math.max(1, Math.min(backfillLimit, 250))
    : 250;

  try {
    await runGit([
      "clone",
      "--quiet",
      "--filter=blob:none",
      "--no-checkout",
      "--depth",
      String(depth),
      repoUrlFromInfo(repo),
      dir,
    ]);
  } catch (error) {
    await rm(parent, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  return { parent, dir };
}

async function runGit(args, options = {}) {
  const { stdout } = await execFile("git", args, {
    ...options,
    timeout: options.timeout || 60000,
    maxBuffer: options.maxBuffer || 1024 * 1024 * 8,
  });
  return stdout;
}

async function detectPublishRootFromCheckout(repoDir) {
  const workflowDir = path.join(repoDir, ".github", "workflows");
  const workflowFiles = (
    await recursiveFiles(workflowDir).catch(() => [])
  ).filter((filePath) => /\.ya?ml$/i.test(filePath));

  for (const workflowPath of workflowFiles) {
    const workflow = await readFile(workflowPath, "utf8").catch(() => "");
    const root = parseWorkflowPublishRoot(workflow);
    if (root !== null) {
      return root;
    }
  }

  return "";
}

function parseWorkflowPublishRoot(workflow) {
  const patterns = [
    /uses:\s*actions\/upload-pages-artifact@[\w.-]+[\s\S]{0,600}?path:\s*['"]?([^'"\n#]+)['"]?/i,
    /uses:\s*peaceiris\/actions-gh-pages@[\w.-]+[\s\S]{0,900}?publish_dir:\s*['"]?([^'"\n#]+)['"]?/i,
    /uses:\s*jamesives\/github-pages-deploy-action@[\w.-]+[\s\S]{0,900}?folder:\s*['"]?([^'"\n#]+)['"]?/i,
    /\bpublish_dir:\s*['"]?([^'"\n#]+)['"]?/i,
    /\bfolder:\s*['"]?([^'"\n#]+)['"]?/i,
  ];

  for (const pattern of patterns) {
    const match = workflow.match(pattern);
    if (match?.[1]) {
      return cleanPublishRoot(match[1]);
    }
  }

  return null;
}

function cleanPublishRoot(value) {
  const trimmed = String(value || "")
    .trim()
    .replace(/^\$\{\{\s*github\.workspace\s*\}\}\//i, "")
    .replace(/^\.?\//, "")
    .replace(/\/+$/g, "");
  return trimmed === "." ? "" : trimmed;
}

async function listRepoCommitsFromGit(repoDir, repo) {
  const limit = Number.isFinite(backfillLimit)
    ? Math.max(1, backfillLimit)
    : 250;
  const output = await runGit(
    ["-C", repoDir, "log", `--max-count=${limit}`, "--format=%H%x09%cI%x09%s"],
    { timeout: 30000 },
  ).catch(() => "");

  return output
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, date, ...messageParts] = line.split("\t");
      return {
        date,
        timestamp: date ? Date.parse(date) || 0 : 0,
        sha,
        url: `${repoUrlFromInfo(repo)}/commit/${sha}`,
        message: firstCommitMessageLine(messageParts.join("\t")),
      };
    })
    .filter((commit) => commit.sha);
}

async function snapshotFromRepoCheckout(
  repoDir,
  repo,
  originalUrl,
  siteArchive,
  commit,
) {
  const key = commit.sha.slice(0, 12);
  const snapshotRoot = path.join(snapshotsDir, siteArchive.id, key);
  const siteRoot = path.join(snapshotRoot, "site");

  await runGit(["-C", repoDir, "checkout", "--quiet", "--force", commit.sha], {
    timeout: 60000,
  });

  const publishRoot = await detectPublishRootFromCheckout(repoDir);
  const files = (await recursiveCheckoutFiles(repoDir))
    .map((filePath) =>
      path.relative(repoDir, filePath).split(path.sep).join(path.posix.sep),
    )
    .filter((itemPath) => !itemPath.startsWith(".git/"))
    .filter((itemPath) => pathIsInsidePublishRoot(itemPath, publishRoot))
    .filter(isUsefulRepoFile);
  const deployFiles = files.map((itemPath) => ({
    repoPath: itemPath,
    localPath: publishRelativePath(itemPath, publishRoot),
  }));

  if (deployFiles.length === 0) {
    return null;
  }

  await mkdir(siteRoot, { recursive: true });

  for (const file of deployFiles) {
    const outputPath = path.join(siteRoot, ...file.localPath.split("/"));
    await mkdir(path.dirname(outputPath), { recursive: true });
    const bytes = await readFile(
      path.join(repoDir, ...file.repoPath.split("/")),
    );
    await writeFile(
      outputPath,
      rewriteStaticFile(bytes, file.localPath, deployFiles, originalUrl),
    );
  }

  const pageFile =
    deployFiles.find((file) => file.localPath.toLowerCase() === "index.html") ||
    deployFiles.find((file) => /(^|\/)index\.html$/i.test(file.localPath)) ||
    deployFiles.find((file) => /\.html?$/i.test(file.localPath));

  if (!pageFile) {
    return null;
  }

  const capturedAt = generatedAt.toISOString();
  const localPage = path.posix.join(
    "snapshots",
    siteArchive.id,
    key,
    "site",
    pageFile.localPath,
  );

  return {
    key,
    capturedAt,
    timestamp: commit.timestamp || Date.parse(capturedAt) || Date.now(),
    label: snapshotLabel(commit, capturedAt),
    source: "github",
    publishRoot,
    commit: {
      ...commit,
      url: commit.url || `${repoUrlFromInfo(repo)}/commit/${commit.sha}`,
    },
    metadata: emptyMetadata(),
    pages: [
      {
        url: originalUrl,
        title: `${repo.name}@${key}`,
        screenshot: null,
        localPage,
        status: null,
      },
    ],
  };
}

async function recursiveCheckoutFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === ".git") {
      continue;
    }

    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await recursiveCheckoutFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function pathIsInsidePublishRoot(itemPath, publishRoot) {
  if (!publishRoot) {
    return !itemPath.startsWith(".git/");
  }

  return itemPath === publishRoot || itemPath.startsWith(`${publishRoot}/`);
}

function publishRelativePath(itemPath, publishRoot) {
  return publishRoot
    ? itemPath.slice(publishRoot.length).replace(/^\/+/, "")
    : itemPath;
}

function isUsefulRepoFile(itemPath) {
  return /\.(avif|css|gif|html?|ico|jpe?g|js|json|mjs|mp3|mp4|ogg|otf|png|svg|ttf|txt|wasm|wav|webmanifest|webm|webp|woff2?|xml)$/i.test(
    itemPath,
  );
}

function rewriteStaticFile(bytes, localPath, deployFiles, originalUrl) {
  const extension = path.extname(localPath).toLowerCase();
  if (![".html", ".htm", ".css"].includes(extension)) {
    return bytes;
  }

  const text = Buffer.from(bytes).toString("utf8");
  const rewrite = (rawUrl) =>
    localRepoUrlForReference(rawUrl, localPath, deployFiles, originalUrl);

  if (extension === ".css") {
    return Buffer.from(rewriteCssText(text, rewrite), "utf8");
  }

  return Buffer.from(rewriteHtmlText(text, rewrite), "utf8");
}

function rewriteHtmlText(html, rewrite) {
  return ensureHeadBase(
    html
      .replace(
        /\b(src|href|poster)=("|')([^"']+)\2/gi,
        (match, attr, quote, rawUrl) => {
          const localUrl = rewrite(rawUrl);
          return localUrl
            ? `${attr}=${quote}${escapeAttribute(localUrl)}${quote}`
            : match;
        },
      )
      .replace(/\bsrcset=("|')([^"']+)\1/gi, (match, quote, rawValue) => {
        const rewritten = rawValue
          .split(",")
          .map((candidate) => {
            const [rawUrl, ...rest] = candidate.trim().split(/\s+/g);
            const localUrl = rewrite(rawUrl);
            return [localUrl || rawUrl, ...rest].join(" ");
          })
          .join(", ");
        return `srcset=${quote}${escapeAttribute(rewritten)}${quote}`;
      })
      .replace(
        /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
        (match, open, css, close) =>
          `${open}${rewriteCssText(css, rewrite)}${close}`,
      ),
    "./",
  );
}

function ensureHeadBase(html, href) {
  if (/<base\b/i.test(html)) {
    return html;
  }

  const base = `<base href="${escapeAttribute(href)}">`;
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}\n    ${base}`);
  }

  return `${base}\n${html}`;
}

function rewriteCssText(css, rewrite) {
  return css.replace(/url\((['"]?)([^'")]+)\1\)/gi, (match, quote, rawUrl) => {
    const localUrl = rewrite(rawUrl);
    return localUrl ? `url(${quote}${localUrl}${quote})` : match;
  });
}

function localRepoUrlForReference(
  rawUrl,
  fromLocalPath,
  deployFiles,
  originalUrl,
) {
  const trimmed = String(rawUrl || "").trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    /^(data|blob|mailto|tel|javascript):/i.test(trimmed)
  ) {
    return null;
  }

  let targetPath = "";
  const sitePath = siteScopeFromUrl(originalUrl).basePath.replace(
    /^\/|\/$/g,
    "",
  );

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("//")) {
    try {
      const url = new URL(trimmed, originalUrl);
      const original = new URL(originalUrl);
      if (url.origin !== original.origin) {
        return null;
      }
      targetPath = url.pathname.replace(/^\/+/, "");
      if (sitePath && targetPath.startsWith(`${sitePath}/`)) {
        targetPath = targetPath.slice(sitePath.length + 1);
      }
    } catch {
      return null;
    }
  } else if (trimmed.startsWith("/")) {
    targetPath = trimmed.replace(/^\/+/, "");
    if (sitePath && targetPath.startsWith(`${sitePath}/`)) {
      targetPath = targetPath.slice(sitePath.length + 1);
    }
    if (!deployFiles.some((file) => file.localPath === targetPath)) {
      const fallbackPath = path.posix.normalize(
        path.posix.join(
          path.posix.dirname(fromLocalPath),
          trimmed.replace(/^\/+/, ""),
        ),
      );
      if (deployFiles.some((file) => file.localPath === fallbackPath)) {
        targetPath = fallbackPath;
      }
    }
  } else {
    targetPath = path.posix.normalize(
      path.posix.join(path.posix.dirname(fromLocalPath), trimmed),
    );
  }

  targetPath = targetPath.replace(/^\.\//, "").split(/[?#]/)[0];
  const hasTarget = deployFiles.some((file) => file.localPath === targetPath);
  if (!hasTarget) {
    return null;
  }

  return relativePublicUrl(fromLocalPath, targetPath);
}

async function saveLocalAsset(
  response,
  scope,
  assetsRoot,
  snapshotRoot,
  assetMap,
  assetSources,
) {
  const url = normalizeAssetUrl(response.url());
  if (!url || !isSnapshotAssetUrl(url, scope) || assetMap.has(url)) {
    return null;
  }

  const contentType = response.headers()["content-type"] || "";
  if (!isUsefulAsset(contentType, url)) {
    return null;
  }

  const buffer = await response.body().catch(() => null);
  if (!buffer || buffer.length === 0) {
    return null;
  }

  const assetName = `${hashUrl(url)}${assetExtension(url, contentType)}`;
  const assetPath = path.join(assetsRoot, assetName);
  let output = buffer;

  if (/text\/css/i.test(contentType) || /\.css(?:$|\?)/i.test(url)) {
    output = Buffer.from(
      rewriteCssUrls(buffer.toString("utf8"), url, assetMap, assetPath),
      "utf8",
    );
  }

  await writeFile(assetPath, output);
  const localAsset = publicRelativePath(assetPath);
  assetMap.set(url, localAsset);
  assetSources.set(localAsset, {
    url,
    path: assetPath,
    contentType,
  });
  console.log(`[asset] saved ${localAsset}`);
  return localAsset;
}

async function rewriteCapturedAssets(assetSources, assetMap) {
  for (const asset of assetSources.values()) {
    const isCss =
      /text\/css/i.test(asset.contentType) || /\.css(?:$|\?)/i.test(asset.url);
    if (!isCss) {
      continue;
    }

    const css = await readFile(asset.path, "utf8").catch(() => null);
    if (css === null) {
      continue;
    }

    const rewritten = rewriteCssUrls(css, asset.url, assetMap, asset.path);
    if (rewritten !== css) {
      await writeFile(asset.path, rewritten, "utf8");
    }
  }
}

async function saveLocalPage(
  page,
  finalUrl,
  pagesRoot,
  snapshotRoot,
  assetMap,
) {
  const pageName = `${hashUrl(canonicalUrl(finalUrl))}.html`;
  const pagePath = path.join(pagesRoot, pageName);
  let html = await page.content();
  const snapshotRelativeRoot = relativePublicUrl(
    publicRelativePath(pagePath),
    publicRelativePath(snapshotRoot),
  );

  html = html.replace(
    /\b(src|href|poster)=("|')([^"']+)\2/gi,
    (match, attr, quote, rawUrl) => {
      const localUrl = localUrlForReference(
        rawUrl,
        finalUrl,
        assetMap,
        pagePath,
      );
      return localUrl
        ? `${attr}=${quote}${escapeAttribute(localUrl)}${quote}`
        : match;
    },
  );
  html = html.replace(
    /\bsrcset=("|')([^"']+)\1/gi,
    (match, quote, rawValue) => {
      const rewritten = rewriteSrcset(rawValue, finalUrl, assetMap, pagePath);
      return rewritten === rawValue
        ? match
        : `srcset=${quote}${escapeAttribute(rewritten)}${quote}`;
    },
  );
  html = html.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (match, open, css, close) =>
      `${open}${rewriteCssUrls(css, finalUrl, assetMap, pagePath)}${close}`,
  );
  html = ensureHeadBase(html, `${snapshotRelativeRoot}/`);

  await writeFile(pagePath, html, "utf8");
  return publicRelativePath(pagePath);
}

function rewriteCssUrls(css, baseUrl, assetMap, targetPath) {
  return css.replace(/url\((['"]?)([^'")]+)\1\)/gi, (match, quote, rawUrl) => {
    const localUrl = localUrlForReference(
      rawUrl,
      baseUrl,
      assetMap,
      targetPath,
    );
    return localUrl ? `url(${quote}${localUrl}${quote})` : match;
  });
}

function rewriteSrcset(value, baseUrl, assetMap, targetPath) {
  return value
    .split(",")
    .map((candidate) => {
      const trimmed = candidate.trim();
      const [rawUrl, ...rest] = trimmed.split(/\s+/g);
      const localUrl = localUrlForReference(
        rawUrl,
        baseUrl,
        assetMap,
        targetPath,
      );
      return [localUrl || rawUrl, ...rest].join(" ");
    })
    .join(", ");
}

function localUrlForReference(rawUrl, baseUrl, assetMap, targetPath) {
  const normalized = resolveAssetUrl(rawUrl, baseUrl);
  const localAsset = normalized ? assetMap.get(normalized) : null;
  if (!localAsset) {
    return null;
  }

  return relativePublicUrl(publicRelativePath(targetPath), localAsset);
}

function resolveAssetUrl(rawUrl, baseUrl) {
  const trimmed = String(rawUrl || "").trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    /^(data|blob|mailto|tel|javascript):/i.test(trimmed)
  ) {
    return null;
  }

  try {
    return normalizeAssetUrl(new URL(trimmed, baseUrl).href);
  } catch {
    return null;
  }
}

function normalizeAssetUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function isSnapshotAssetUrl(rawUrl, scope) {
  try {
    const url = new URL(rawUrl);
    return (
      url.origin === scope.origin && url.pathname.startsWith(scope.basePath)
    );
  } catch {
    return false;
  }
}

function isUsefulAsset(contentType, rawUrl) {
  return (
    /^(text\/css|application\/javascript|text\/javascript|image\/|font\/|audio\/|video\/)/i.test(
      contentType,
    ) ||
    /\.(avif|css|gif|ico|jpe?g|js|mjs|mp3|mp4|ogg|otf|png|svg|ttf|wav|webm|webp|woff2?)$/i.test(
      new URL(rawUrl).pathname,
    )
  );
}

function assetExtension(rawUrl, contentType) {
  const pathname = new URL(rawUrl).pathname;
  const extension = path.extname(pathname);
  if (extension && extension.length <= 8) {
    return extension;
  }

  if (/text\/css/i.test(contentType)) return ".css";
  if (/javascript/i.test(contentType)) return ".js";
  if (/image\/svg/i.test(contentType)) return ".svg";
  if (/image\/png/i.test(contentType)) return ".png";
  if (/image\/jpe?g/i.test(contentType)) return ".jpg";
  if (/image\/webp/i.test(contentType)) return ".webp";
  if (/font\/woff2/i.test(contentType)) return ".woff2";
  if (/font\/woff/i.test(contentType)) return ".woff";
  return ".asset";
}

function publicRelativePath(filePath) {
  return path.relative(publicDir, filePath).split(path.sep).join("/");
}

function relativePublicUrl(fromPublicFile, toPublicFile) {
  const fromDir = path.posix.dirname(fromPublicFile);
  const relative = path.posix.relative(fromDir, toPublicFile);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function escapeAttribute(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

async function inspectPageMetadata(page) {
  return await page.evaluate(() => {
    const hasText = (selector, attr) => {
      const node = document.querySelector(selector);
      const value = attr ? node?.getAttribute(attr) : node?.textContent;
      return Boolean(value && value.trim());
    };

    const images = [...document.images];
    const controls = [
      ...document.querySelectorAll("button, input, select, textarea"),
    ];

    return {
      seo:
        Boolean(document.title.trim()) &&
        hasText('meta[name="description"]', "content") &&
        hasText('link[rel="canonical"]', "href"),
      accessibility:
        Boolean(document.documentElement.lang) &&
        Boolean(document.querySelector("h1")) &&
        images.every((image) => image.hasAttribute("alt")) &&
        controls.every((control) => {
          if (control.tagName === "BUTTON") {
            return Boolean(
              control.textContent.trim() || control.getAttribute("aria-label"),
            );
          }

          const id = control.getAttribute("id");
          return Boolean(
            control.getAttribute("aria-label") ||
            control.getAttribute("aria-labelledby") ||
            (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)),
          );
        }),
    };
  });
}

async function pageLoadMs(page) {
  return await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    return nav
      ? Math.round(
          nav.loadEventEnd || nav.domContentLoadedEventEnd || nav.duration,
        )
      : null;
  });
}

async function loadRobots(origin) {
  const robotsUrl = `${origin}/robots.txt`;

  try {
    const response = await fetch(robotsUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { exists: false, rules: [], sitemapUrls: [] };
    }

    return parseRobots(await response.text());
  } catch {
    return { exists: false, rules: [], sitemapUrls: [] };
  }
}

function parseRobots(content) {
  const rules = [];
  const sitemapUrls = [];
  let appliesToBot = false;

  for (const rawLine of content.split(/\r?\n/g)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) {
      continue;
    }

    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "sitemap" && value) {
      sitemapUrls.push(value);
      continue;
    }

    if (key === "user-agent") {
      const agent = value.toLowerCase();
      appliesToBot = agent === "*" || agent.includes("gambaaa");
      continue;
    }

    if ((key === "allow" || key === "disallow") && appliesToBot) {
      rules.push({
        type: key,
        path: value || "/",
      });
    }
  }

  return { exists: true, rules, sitemapUrls };
}

function isAllowedByRobots(rawUrl, robots) {
  if (!robots?.exists || robots.rules.length === 0) {
    return true;
  }

  const pathName = new URL(rawUrl).pathname || "/";
  const matches = robots.rules
    .filter((rule) => rule.path && pathName.startsWith(rule.path))
    .sort((a, b) => b.path.length - a.path.length);

  if (matches.length === 0) {
    return true;
  }

  return matches[0].type === "allow";
}

async function discoverSitemapUrls(origin, robots) {
  const urls = [...(robots?.sitemapUrls || [])];
  const defaultSitemap = `${origin}/sitemap.xml`;

  if (!urls.includes(defaultSitemap) && (await urlExists(defaultSitemap))) {
    urls.push(defaultSitemap);
  }

  if (urls.length > 0) {
    console.log(`[sitemap] found ${urls.join(", ")}`);
  }

  return urls;
}

async function urlExists(url) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function emptyMetadata() {
  return {
    robots: false,
    sitemap: false,
    sitemapUrls: [],
    seo: false,
    accessibility: false,
    loadMs: null,
  };
}

function normalizeCrawlLink(rawUrl, scope) {
  if (!scope) {
    return null;
  }

  try {
    const url = new URL(rawUrl);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    if (
      url.origin !== scope.origin ||
      !url.pathname.startsWith(scope.basePath)
    ) {
      return null;
    }

    if (
      /\.(avif|css|gif|ico|jpe?g|js|json|map|pdf|png|svg|webp|xml|zip)$/i.test(
        url.pathname,
      )
    ) {
      return null;
    }

    return normalizeUrl(url.href);
  } catch {
    return null;
  }
}

function siteScopeFromUrl(rawUrl) {
  const url = new URL(rawUrl);
  const segments = url.pathname.split("/");
  const lastSegment = segments.at(-1) || "";
  const isFile = /\.[a-z0-9]+$/i.test(lastSegment);
  const basePath = url.pathname.endsWith("/")
    ? url.pathname
    : isFile
      ? url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1) || "/"
      : `${url.pathname}/`;

  return {
    origin: url.origin,
    basePath,
  };
}

function normalizeUrl(rawUrl) {
  return canonicalUrl(rawUrl);
}

function canonicalUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  const lastSegment = url.pathname.split("/").filter(Boolean).at(-1) || "";
  const isFile = /\.[a-z0-9]+$/i.test(lastSegment);
  if (!isFile && url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.href;
}

function screenshotNameForUrl(rawUrl) {
  return `${hashUrl(canonicalUrl(rawUrl))}.${screenshotFormat}`;
}

function snapshotFileNameForKey(key) {
  return `${hashUrl(key)}.${screenshotFormat}`;
}

async function writeOptimizedScreenshot(page, screenshotPath) {
  const pngBuffer = await page.screenshot({
    type: "png",
    fullPage: false,
  });
  const optimizedBuffer = await transcodeScreenshot(page, pngBuffer);
  await writeFile(screenshotPath, optimizedBuffer);
}

async function transcodeScreenshot(page, pngBuffer) {
  const mimeType = `image/${screenshotFormat}`;
  const encoded = await page.evaluate(
    async ({ bytes, mimeType, quality }) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: "image/png" });
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { alpha: false });
      context.drawImage(bitmap, 0, 0);
      bitmap.close();

      const output = await new Promise((resolve) =>
        canvas.toBlob(resolve, mimeType, quality),
      );

      if (!output || output.type !== mimeType) {
        throw new Error(
          `${mimeType} encoding is not supported by this browser`,
        );
      }

      return [...new Uint8Array(await output.arrayBuffer())];
    },
    {
      bytes: [...pngBuffer],
      mimeType,
      quality: screenshotQuality,
    },
  );

  return Buffer.from(encoded);
}

function hashUrl(rawUrl) {
  return createHash("sha1").update(rawUrl).digest("hex").slice(0, 16);
}

function pageLabelFromUrl(rawUrl) {
  const url = new URL(rawUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.at(-1) || url.hostname;
}

function positiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function boundedNumber(value, min, max) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

function imageFormat(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ["avif", "webp"].includes(normalized) ? normalized : null;
}

async function fetchFinalUrl(originalUrl) {
  try {
    const response = await fetch(originalUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    return response.url || originalUrl;
  } catch {
    return originalUrl;
  }
}

async function githubJson(url) {
  const response = await fetch(url, {
    headers: githubHeaders("application/vnd.github+json"),
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`GitHub HTTP ${response.status} for ${url}`);
  }

  return await response.json();
}

async function fetchGithubRaw(repo, ref, filePath) {
  const response = await fetch(githubRawUrl(repo, ref, filePath), {
    headers: githubHeaders("text/plain, */*"),
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`GitHub raw HTTP ${response.status} for ${filePath}`);
  }

  return await response.text();
}

async function fetchGithubRawBytes(repo, ref, filePath) {
  const response = await fetch(githubRawUrl(repo, ref, filePath), {
    headers: githubHeaders("*/*"),
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`GitHub raw HTTP ${response.status} for ${filePath}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function githubRawUrl(repo, ref, filePath) {
  return `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${encodeURIComponent(ref)}/${filePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function githubHeaders(accept) {
  return {
    Accept: accept,
    "User-Agent": "gambaaa-projects-generator",
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {}),
  };
}

function isGambaaaHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === targetDomain || host.endsWith(`.${targetDomain}`);
  } catch {
    return false;
  }
}

function repoNameFromUrl(rawUrl) {
  return repoInfoFromSiteUrl(rawUrl).name;
}

function repoInfoFromSiteUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const githubPagesOwner = parsed.hostname
    .toLowerCase()
    .match(/^([a-z0-9-]+)\.github\.io$/)?.[1];

  return {
    owner: githubPagesOwner || fallbackGithubOwner,
    name: parts.at(-1) || parsed.hostname,
  };
}

function repoUrlFromSiteUrl(rawUrl) {
  const repo = repoInfoFromSiteUrl(rawUrl);
  return repoUrlFromInfo(repo);
}

function repoUrlFromInfo(repo) {
  return `https://github.com/${repo.owner}/${repo.name}`;
}

async function readmeInfoFromSiteUrl(rawUrl) {
  const repo = repoInfoFromSiteUrl(rawUrl);
  const readmeUrl = `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/main/README.md`;

  try {
    const response = await fetch(readmeUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { url: null, links: [] };
    }

    const content = await response.text();
    const links = extractUsefulReadmeLinks(content, repo);

    return {
      url: repoUrlFromInfo(repo),
      links,
    };
  } catch {
    return { url: null, links: [] };
  }
}

async function latestCommitInfoFromSiteUrl(rawUrl) {
  const repo = repoInfoFromSiteUrl(rawUrl);
  const atomResult = await latestCommitInfoFromAtom(repo, rawUrl);
  if (atomResult.date) {
    return atomResult;
  }

  if (process.env.ALLOW_GITHUB_API !== "1") {
    return emptyCommitInfo();
  }

  return await latestCommitInfoFromApi(repo, rawUrl);
}

async function latestCommitInfoFromAtom(repo, rawUrl) {
  const commitsUrl = `https://github.com/${repo.owner}/${repo.name}/commits.atom`;
  debugCommit(
    `atom lookup ${repo.owner}/${repo.name} from ${rawUrl} via ${commitsUrl}`,
  );

  try {
    const response = await fetch(commitsUrl, {
      headers: {
        Accept: "application/atom+xml, application/xml;q=0.9, */*;q=0.8",
        "User-Agent": "gambaaa-projects-generator",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      debugCommit(
        `atom failed ${repo.owner}/${repo.name}: HTTP ${response.status} ${response.statusText}`,
      );
      return emptyCommitInfo();
    }

    const feed = await response.text();
    const entry = firstAtomEntry(feed);
    const committedAt = atomTagText(entry, "updated");
    const commitUrl = atomEntryLink(entry);
    const sha = commitUrl?.match(/\/commit\/([a-f0-9]{7,40})/i)?.[1] || null;

    if (!entry) {
      debugCommit(`atom empty ${repo.owner}/${repo.name}: no entries found`);
    } else if (!committedAt) {
      debugCommit(`atom missing date ${repo.owner}/${repo.name}`);
    } else {
      debugCommit(
        `atom found ${repo.owner}/${repo.name}: ${committedAt} ${sha ? sha.slice(0, 7) : ""}`,
      );
    }

    return {
      date: committedAt,
      timestamp: committedAt ? Date.parse(committedAt) || 0 : 0,
      sha,
      url: commitUrl,
      message: decodeXmlEntities(atomTagText(entry, "title")),
    };
  } catch (error) {
    debugCommit(
      `atom error ${repo.owner}/${repo.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return emptyCommitInfo();
  }
}

async function latestCommitInfoFromApi(repo, rawUrl) {
  const commitsUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}/commits?per_page=1`;
  debugCommit(
    `api lookup ${repo.owner}/${repo.name} from ${rawUrl} via ${commitsUrl}`,
  );

  try {
    const response = await fetch(commitsUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "gambaaa-projects-generator",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      debugCommit(
        `api failed ${repo.owner}/${repo.name}: HTTP ${response.status} ${response.statusText}; remaining=${response.headers.get("x-ratelimit-remaining") || "?"}; reset=${formatRateLimitReset(response.headers.get("x-ratelimit-reset"))}`,
      );
      return emptyCommitInfo();
    }

    const commits = await response.json();
    const commit = Array.isArray(commits) ? commits[0] : null;
    const committedAt =
      commit?.commit?.committer?.date || commit?.commit?.author?.date || null;

    if (!commit) {
      debugCommit(`api empty ${repo.owner}/${repo.name}: no commits found`);
    } else if (!committedAt) {
      debugCommit(
        `api missing date ${repo.owner}/${repo.name}: commit ${commit.sha || "unknown sha"} has no committer/author date`,
      );
    } else {
      debugCommit(
        `api found ${repo.owner}/${repo.name}: ${committedAt} ${commit.sha ? commit.sha.slice(0, 7) : ""}`,
      );
    }

    return {
      date: committedAt,
      timestamp: committedAt ? Date.parse(committedAt) || 0 : 0,
      sha: commit?.sha || null,
      url: commit?.html_url || null,
      message: firstCommitMessageLine(commit?.commit?.message || ""),
    };
  } catch (error) {
    debugCommit(
      `api error ${repo.owner}/${repo.name}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return emptyCommitInfo();
  }
}

function firstAtomEntry(feed) {
  return feed.match(/<entry\b[\s\S]*?<\/entry>/i)?.[0] || "";
}

function atomTagText(entry, tagName) {
  if (!entry) {
    return "";
  }

  return decodeXmlEntities(
    entry
      .match(
        new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"),
      )?.[1]
      ?.trim() || "",
  );
}

function atomEntryLink(entry) {
  if (!entry) {
    return null;
  }

  return (
    decodeXmlEntities(
      entry.match(/<link\b[^>]*href="([^"]+)"/i)?.[1]?.trim() || "",
    ) || null
  );
}

function decodeXmlEntities(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'");
}

function debugCommit(message) {
  if (debugCommits) {
    console.log(`[commit] ${message}`);
  }
}

function formatRateLimitReset(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "?";
  }

  return new Date(timestamp * 1000).toISOString();
}

function emptyCommitInfo() {
  return {
    date: null,
    timestamp: 0,
    sha: null,
    url: null,
    message: "",
  };
}

function firstCommitMessageLine(message) {
  return message.split(/\r?\n/g)[0]?.trim() || "";
}

function extractUsefulReadmeLinks(content, repo) {
  const rawUrls = [...content.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)].map(
    (match) => cleanReadmeUrl(match[0]),
  );

  const assetHints = [
    ...content.matchAll(
      /(?:^|[\s[(])((?:\.\/|\/)?public\/assets\/images\/?[^\s<>"')\]]*)/gim,
    ),
  ].map(
    (match) =>
      `https://github.com/${repo.owner}/${repo.name}/tree/main/${match[1].replace(/^\.?\//, "")}`,
  );

  return unique([...rawUrls, ...assetHints])
    .map((url) => normalizeReadmeLink(url, repo))
    .filter(Boolean)
    .filter((url) => !isDiscardedReadmeUrl(url))
    .map((url) => ({
      url,
      label: readmeLinkLabel(url),
    }));
}

function cleanReadmeUrl(url) {
  return url.replace(/[),.;\]]+$/g, "");
}

function normalizeReadmeLink(rawUrl, repo) {
  try {
    if (rawUrl.startsWith("/public/assets/images")) {
      return `https://github.com/${repo.owner}/${repo.name}/tree/main${rawUrl}`;
    }

    return new URL(rawUrl).href;
  } catch {
    return null;
  }
}

function isDiscardedReadmeUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return (
      host === "pslib-cz.github.io" ||
      host === targetDomain ||
      host.endsWith(`.${targetDomain}`)
    );
  } catch {
    return true;
  }
}

function readmeLinkLabel(rawUrl) {
  const host = new URL(rawUrl).hostname.toLowerCase();

  if (host.includes("figma")) {
    return "Figma";
  }

  if (host.includes("canva")) {
    return "Canva";
  }

  if (rawUrl.includes("/public/assets/images")) {
    return "Images";
  }

  return host.replace(/^www\./, "");
}

function formatCommitDate(commitInfo) {
  if (!commitInfo?.date) {
    return "Unknown update";
  }

  return `Updated ${new Date(commitInfo.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Europe/Prague",
  })}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderSitemap(groups) {
  const urls = unique(
    groups
      .flatMap((group) => group.sites)
      .flatMap((site) => [
        ...site.gallery.map((item) => item.url),
        ...(site.metadata?.sitemapUrls || []),
      ])
      .filter(Boolean),
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")}
</urlset>
`;
}

function renderHtml(groups) {
  const sites = groups.flatMap((group, groupIndex) =>
    group.sites.map((site, siteIndex) => ({
      id: hashUrl(canonicalUrl(site.originalUrl)),
      group: group.name,
      groupIndex,
      siteIndex,
      originalUrl: site.originalUrl,
      finalUrl: site.finalUrl,
      repoName: site.repoName,
      repoUrl: site.repoUrl,
      readme: site.readme,
      latestCommit: site.latestCommit,
      isGambaaa: site.isGambaaa,
      metadata: site.metadata,
      status: site.status,
      error: site.error,
      snapshots: site.snapshots || [],
    })),
  );
  const appData = {
    generatedAt: generatedAt.toISOString(),
    targetDomain,
    groups: groups.map((group) => group.name),
    sites,
  };
  const appJson = JSON.stringify(appData).replaceAll("</", "<\\/");
  const totalSnapshots = sites.reduce(
    (sum, site) => sum + (site.snapshots?.length || 0),
    0,
  );
  const localPages = sites.reduce(
    (sum, site) =>
      sum +
      (site.snapshots || []).reduce(
        (snapshotSum, snapshot) =>
          snapshotSum +
          (snapshot.pages || []).filter((page) => page.localPage).length,
        0,
      ),
    0,
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Gambaaa Wayback</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #101216;
        --panel: #181c22;
        --panel-2: #202630;
        --text: #f5f7fb;
        --muted: #a7b0bd;
        --line: #323946;
        --accent: #6fd0a8;
        --accent-2: #6ca8e8;
        --warn: #efc66b;
        --bad: #f08b8b;
      }

      * { box-sizing: border-box; }
      html,
      body {
        height: 100%;
      }
      body {
        margin: 0;
        min-height: 100%;
        overflow: hidden;
        background: var(--bg);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      a { color: inherit; text-decoration: none; }
      button, input, select { font: inherit; }
      [hidden] { display: none !important; }

      .app {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        height: 100dvh;
        min-height: 0;
        overflow: hidden;
      }
      .topbar {
        display: grid;
        gap: 14px;
        border-bottom: 1px solid var(--line);
        background: #141820;
        padding: 16px;
      }
      .brand-row,
      .controls,
      .snapshot-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .brand {
        border: 0;
        background: transparent;
        color: var(--text);
        cursor: pointer;
        font-size: clamp(1.3rem, 4vw, 2.4rem);
        font-weight: 900;
        line-height: 1;
        padding: 0;
        text-align: left;
      }
      .brand:hover,
      .brand:focus-visible {
        color: var(--accent);
      }
      .pill {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        border: 1px solid var(--line);
        border-radius: 999px;
        background: #11151b;
        color: var(--muted);
        font-size: 0.82rem;
        font-weight: 800;
        padding: 5px 10px;
      }
      .pill.good {
        border-color: color-mix(in srgb, var(--accent) 55%, transparent);
        color: #cffff0;
      }
      .pill.warn {
        border-color: color-mix(in srgb, var(--warn) 50%, transparent);
        color: #ffe7ad;
      }
      .field {
        display: grid;
        gap: 5px;
        min-width: min(100%, 180px);
      }
      .field.search { flex: 1 1 340px; }
      label {
        color: var(--muted);
        font-size: 0.72rem;
        font-weight: 900;
        text-transform: uppercase;
      }
      input,
      select,
      .button {
        min-height: 40px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #0f1217;
        color: var(--text);
        font-size: 0.92rem;
        font-weight: 750;
        padding: 0 12px;
      }
      input { width: 100%; }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .button[aria-pressed="true"],
      .snapshot-button[aria-current="true"] {
        border-color: color-mix(in srgb, var(--accent) 60%, transparent);
        background: color-mix(in srgb, var(--accent) 18%, #0f1217);
        color: #d9fff0;
      }
      .snapshot-row {
        overflow-x: auto;
        flex-wrap: nowrap;
        padding-bottom: 2px;
      }
      .snapshot-button {
        flex: 0 0 auto;
        min-height: 38px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #11151b;
        color: var(--text);
        cursor: pointer;
        font-size: 0.86rem;
        font-weight: 800;
        padding: 0 12px;
        white-space: nowrap;
      }
      .workspace {
        display: grid;
        grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
        height: 100%;
        min-height: 0;
        overflow: hidden;
      }
      .sidebar {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        min-height: 0;
        border-right: 1px solid var(--line);
        background: #11151b;
      }
      .sidebar-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        border-bottom: 1px solid var(--line);
        padding: 12px 14px;
      }
      .site-list {
        overflow: auto;
        padding: 10px;
      }
      .group-title {
        color: var(--muted);
        font-size: 0.76rem;
        font-weight: 900;
        padding: 14px 8px 8px;
        text-transform: uppercase;
      }
      .site-button {
        display: grid;
        gap: 7px;
        width: 100%;
        border: 1px solid transparent;
        border-radius: 8px;
        background: transparent;
        color: var(--text);
        cursor: pointer;
        margin: 0 0 6px;
        padding: 10px;
        text-align: left;
      }
      .site-button:hover,
      .site-button[aria-current="true"] {
        border-color: var(--line);
        background: var(--panel);
      }
      .site-name {
        overflow-wrap: anywhere;
        font-size: 0.95rem;
        font-weight: 850;
      }
      .site-meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        color: var(--muted);
        font-size: 0.78rem;
      }
      .viewer {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        min-height: 0;
        max-height: 100%;
        overflow: hidden;
        background: #0c0f13;
      }
      .viewer-head {
        display: grid;
        gap: 10px;
        border-bottom: 1px solid var(--line);
        background: var(--panel);
        padding: 12px 14px;
      }
      .viewer-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      h1, h2, p { margin: 0; }
      h1 {
        overflow-wrap: anywhere;
        font-size: clamp(1.1rem, 2vw, 1.6rem);
        letter-spacing: 0;
      }
      .resource-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .playback {
        display: grid;
        gap: 8px;
      }
      .timeline {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
      }
      .time-nav {
        display: inline-grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #11151b;
        color: var(--text);
        cursor: pointer;
        font-size: 1.05rem;
        font-weight: 900;
      }
      .time-nav:disabled {
        cursor: default;
        opacity: 0.35;
      }
      .time-rail {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(92px, 1fr);
        align-items: end;
        min-height: 42px;
        border: 1px solid var(--line);
        border-radius: 8px;
        overflow-x: auto;
        background: #11151b;
        padding: 6px;
      }
      .time-dot {
        display: grid;
        align-content: end;
        justify-items: center;
        min-width: 0;
        height: 30px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        font-size: 0.68rem;
        font-weight: 850;
        padding: 0 4px;
      }
      .time-dot::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: currentColor;
        margin-bottom: 4px;
      }
      .time-dot[aria-current="true"] {
        background: color-mix(in srgb, var(--accent) 16%, transparent);
        color: var(--accent);
      }
      .address-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #11151b;
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 800;
        padding: 7px 9px;
      }
      .address-bar span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .resource-link {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        border: 1px solid var(--line);
        border-radius: 8px;
        color: var(--muted);
        font-size: 0.82rem;
        font-weight: 850;
        padding: 5px 9px;
      }
      .resource-link:hover { color: var(--accent); border-color: #596374; }
      .frame-wrap {
        min-height: 0;
        max-height: 100%;
        overflow: hidden;
        padding: 12px;
      }
      iframe {
        display: block;
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: white;
      }
      .empty {
        display: grid;
        align-items: start;
        justify-items: center;
        height: 100%;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #11151b;
        color: var(--muted);
        padding: 24px;
        text-align: center;
      }
      @media (max-width: 880px) {
        .workspace {
          grid-template-columns: 1fr;
        }
        .sidebar {
          max-height: 44vh;
          border-right: 0;
          border-bottom: 1px solid var(--line);
        }
      }
    </style>
  </head>
  <body>
    <main class="app">
      <header class="topbar">
        <div class="brand-row">
          <button class="brand" type="button" data-home aria-label="Return to the first Wayback view">Gambaaa Wayback</button>
          <span class="pill">${sites.length} sites</span>
          <span class="pill">${totalSnapshots} snapshots</span>
          <span class="pill good">${localPages} local pages</span>
          <span class="pill">Updated ${escapeHtml(generatedAt.toLocaleString("en-US", { timeZone: "Europe/Prague" }))}</span>
        </div>
        <div class="controls">
          <div class="field search">
            <label for="url-search">Search or URL</label>
            <input id="url-search" type="search" placeholder="Repo, URL, snapshot, page title">
          </div>
          <div class="field">
            <label for="sort-sites">Sort</label>
            <select id="sort-sites">
              <option value="updated-desc">Last updated</option>
              <option value="original">Original order</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              <option value="snapshots-desc">Most snapshots</option>
            </select>
          </div>
          <button class="button" type="button" data-group-toggle aria-pressed="true">Grouped</button>
        </div>
        <div class="snapshot-row" data-snapshots></div>
      </header>
      <section class="workspace">
        <aside class="sidebar">
          <div class="sidebar-head">
            <span class="pill" data-result-count></span>
            <span class="pill" data-selected-count></span>
          </div>
          <div class="site-list" data-site-list></div>
        </aside>
        <section class="viewer">
          <div class="viewer-head">
            <div class="viewer-title">
              <h1 data-viewer-title></h1>
              <span class="pill" data-viewer-status></span>
            </div>
            <div class="playback">
              <div class="timeline">
                <button class="time-nav" type="button" data-prev-snapshot aria-label="Previous snapshot">&lt;</button>
                <div class="time-rail" data-timeline></div>
                <button class="time-nav" type="button" data-next-snapshot aria-label="Next snapshot">&gt;</button>
              </div>
              <div class="address-bar"><strong>URL</strong><span data-page-url></span></div>
            </div>
            <div class="resource-row" data-resources></div>
          </div>
          <div class="frame-wrap" data-frame-wrap></div>
        </section>
      </section>
    </main>
    <script id="wayback-data" type="application/json">${appJson}</script>
    <script>
      const data = JSON.parse(document.querySelector("#wayback-data").textContent);
      const controls = {
        home: document.querySelector("[data-home]"),
        search: document.querySelector("#url-search"),
        sort: document.querySelector("#sort-sites"),
        grouped: document.querySelector("[data-group-toggle]"),
        snapshots: document.querySelector("[data-snapshots]"),
        list: document.querySelector("[data-site-list]"),
        resultCount: document.querySelector("[data-result-count]"),
        selectedCount: document.querySelector("[data-selected-count]"),
        title: document.querySelector("[data-viewer-title]"),
        status: document.querySelector("[data-viewer-status]"),
        prevSnapshot: document.querySelector("[data-prev-snapshot]"),
        nextSnapshot: document.querySelector("[data-next-snapshot]"),
        timeline: document.querySelector("[data-timeline]"),
        pageUrl: document.querySelector("[data-page-url]"),
        resources: document.querySelector("[data-resources]"),
        frameWrap: document.querySelector("[data-frame-wrap]"),
      };
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      let state = readState();
      let applyingRoute = false;
      let viewerRequestId = 0;

      if (!location.pathname.startsWith("/wayback")) {
        updateRoute();
      } else if (location.hash) {
        updateRoute();
      }

      controls.search.value = state.q || state.url || "";
      controls.sort.value = state.sort || "updated-desc";
      controls.grouped.setAttribute("aria-pressed", String(state.grouped !== "0"));
      controls.grouped.textContent = state.grouped === "0" ? "Ungrouped" : "Grouped";

      controls.home.addEventListener("click", () => {
        state = {
          q: "",
          url: "",
          site: "",
          snapshot: "",
          page: "0",
          sort: "updated-desc",
          grouped: "1",
        };
        controls.search.value = "";
        controls.sort.value = "updated-desc";
        controls.grouped.setAttribute("aria-pressed", "true");
        controls.grouped.textContent = "Grouped";
        updateRoute();
        render();
      });
      controls.search.addEventListener("input", () => {
        state.q = controls.search.value;
        state.url = looksLikeUrl(state.q) ? state.q : "";
        updateRoute();
        render();
      });
      controls.sort.addEventListener("change", () => {
        state.sort = controls.sort.value;
        updateRoute();
        render();
      });
      controls.grouped.addEventListener("click", () => {
        state.grouped = controls.grouped.getAttribute("aria-pressed") === "true" ? "0" : "1";
        controls.grouped.setAttribute("aria-pressed", String(state.grouped !== "0"));
        controls.grouped.textContent = state.grouped === "0" ? "Ungrouped" : "Grouped";
        updateRoute();
        render();
      });
      controls.prevSnapshot.addEventListener("click", () => shiftSnapshot(-1));
      controls.nextSnapshot.addEventListener("click", () => shiftSnapshot(1));
      window.addEventListener("popstate", () => {
        if (applyingRoute) return;
        state = readState();
        controls.search.value = state.q || state.url || "";
        controls.sort.value = state.sort || "updated-desc";
        controls.grouped.setAttribute("aria-pressed", String(state.grouped !== "0"));
        controls.grouped.textContent = state.grouped === "0" ? "Ungrouped" : "Grouped";
        render();
      });

      render();

      function render() {
        const sites = visibleSites();
        const selected = selectedSite(sites);
        const snapshots = selected?.snapshots || [];
        const snapshot = selectedSnapshot(snapshots);
        const pages = snapshot?.pages || [];
        const page = selectedPage(pages);

        controls.resultCount.textContent = String(sites.length) + " / " + String(data.sites.length) + " sites";
        controls.selectedCount.textContent = selected ? String(snapshots.length) + " captures" : "0 captures";
        renderSiteList(sites, selected);
        renderSnapshots(snapshots, snapshot);
        renderTimeline(snapshots, snapshot, page);
        renderViewer(selected, snapshot, pages, page);

        if (selected && state.site !== selected.id) {
          state.site = selected.id;
          state.snapshot = snapshot?.key || "";
          state.page = page ? String(pages.indexOf(page)) : "0";
          updateRoute();
        }
      }

      function visibleSites() {
        const query = normalize(state.q || state.url || "");
        const grouped = controls.grouped.getAttribute("aria-pressed") === "true";
        const sites = data.sites
          .map((site) => ({ site, score: searchScore(site, query) }))
          .filter((entry) => !query || entry.score > 0)
          .sort((a, b) => b.score - a.score || compareSites(a.site, b.site, grouped))
          .map((entry) => entry.site);
        return sites;
      }

      function selectedSite(sites) {
        return (
          sites.find((site) => site.id === state.site) ||
          sites.find((site) => normalize(site.originalUrl).includes(normalize(state.url || ""))) ||
          sites[0] ||
          null
        );
      }

      function selectedSnapshot(snapshots) {
        return snapshots.find((snapshot) => snapshot.key === state.snapshot) || snapshots[0] || null;
      }

      function selectedPage(pages) {
        const index = Number.parseInt(state.page || "0", 10);
        return pages[Number.isFinite(index) ? index : 0] || pages[0] || null;
      }

      function renderSiteList(sites, selected) {
        controls.list.innerHTML = "";
        const grouped = controls.grouped.getAttribute("aria-pressed") === "true";
        let previousGroup = "";
        for (const site of sites) {
          if (grouped && site.group !== previousGroup) {
            previousGroup = site.group;
            const heading = document.createElement("div");
            heading.className = "group-title";
            heading.textContent = site.group;
            controls.list.append(heading);
          }

          const button = document.createElement("button");
          button.type = "button";
          button.className = "site-button";
          button.setAttribute("aria-current", String(site.id === selected?.id));
          button.innerHTML =
            '<span class="site-name"></span><span class="site-meta"></span>';
          button.querySelector(".site-name").textContent = site.repoName;
          button.querySelector(".site-meta").textContent =
            String(site.snapshots.length) + " snapshots · " + hostLabel(site.finalUrl || site.originalUrl);
          button.addEventListener("click", () => {
            state.site = site.id;
            state.snapshot = site.snapshots[0]?.key || "";
            state.page = "0";
            updateRoute();
            render();
          });
          controls.list.append(button);
        }
      }

      function renderSnapshots(snapshots, selected) {
        controls.snapshots.innerHTML = "";
        if (snapshots.length === 0) {
          const empty = document.createElement("span");
          empty.className = "pill warn";
          empty.textContent = "No local snapshots";
          controls.snapshots.append(empty);
          return;
        }

        for (const snapshot of snapshots) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "snapshot-button";
          button.setAttribute("aria-current", String(snapshot.key === selected?.key));
          button.textContent = snapshot.label || snapshot.key;
          button.addEventListener("click", () => {
            state.snapshot = snapshot.key;
            state.page = "0";
            updateRoute();
            render();
          });
          controls.snapshots.append(button);
        }
      }

      function renderTimeline(snapshots, selected, page) {
        controls.timeline.innerHTML = "";
        controls.pageUrl.textContent = page?.url || "No page selected";
        const selectedIndex = snapshots.findIndex((snapshot) => snapshot.key === selected?.key);
        controls.prevSnapshot.disabled = selectedIndex <= 0;
        controls.nextSnapshot.disabled = selectedIndex < 0 || selectedIndex >= snapshots.length - 1;

        if (snapshots.length === 0) {
          const empty = document.createElement("span");
          empty.className = "pill warn";
          empty.textContent = "No captures";
          controls.timeline.append(empty);
          return;
        }

        for (const snapshot of snapshots) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "time-dot";
          button.setAttribute("aria-current", String(snapshot.key === selected?.key));
          button.title = snapshot.label || snapshot.key;
          button.textContent = timelineLabel(snapshot);
          button.addEventListener("click", () => {
            state.snapshot = snapshot.key;
            state.page = "0";
            updateRoute();
            render();
          });
          controls.timeline.append(button);
        }
      }

      function shiftSnapshot(delta) {
        const site = data.sites.find((item) => item.id === state.site) || data.sites[0];
        const snapshots = site?.snapshots || [];
        const index = snapshots.findIndex((snapshot) => snapshot.key === state.snapshot);
        const next = snapshots[index + delta];
        if (!next) return;
        state.snapshot = next.key;
        state.page = "0";
        updateRoute();
        render();
      }

      function timelineLabel(snapshot) {
        const date = new Date(Number(snapshot.timestamp || 0));
        if (!Number.isFinite(date.getTime())) return snapshot.key.slice(0, 6);
        return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      }

      function renderViewer(site, snapshot, pages, page) {
        controls.resources.innerHTML = "";
        controls.frameWrap.innerHTML = "";
        controls.title.textContent = site?.repoName || "No site selected";
        controls.status.textContent = snapshot ? snapshot.label : "No snapshot";

        if (!site || !snapshot) {
          controls.frameWrap.innerHTML = '<div class="empty">No local snapshot is available for this selection.</div>';
          return;
        }

        for (const link of resourceLinks(site, snapshot, page)) {
          const anchor = document.createElement("a");
          anchor.className = "resource-link";
          anchor.href = link.href;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.textContent = link.label;
          controls.resources.append(anchor);
        }

        if (page?.localPage) {
          renderLocalPage(site, snapshot, pages, page);
        } else if (page?.screenshot) {
          const img = document.createElement("img");
          img.src = publicUrl(page.screenshot);
          img.alt = "Snapshot screenshot of " + (page.title || page.url);
          img.style.width = "100%";
          img.style.borderRadius = "8px";
          controls.frameWrap.append(img);
        } else {
          renderFallbackListing(site, snapshot, page?.localPage || "");
        }
      }

      async function renderLocalPage(site, snapshot, pages, page) {
        const requestId = ++viewerRequestId;
        const localPage = page.localPage;
        const target = publicUrl(localPage);

        if (!(await fileIsAvailable(target)) && requestId === viewerRequestId) {
          renderFallbackListing(site, snapshot, localPage);
          return;
        }

        if (requestId !== viewerRequestId) return;
        const frame = document.createElement("iframe");
        frame.src = target;
        frame.title = "Snapshot of " + (page.title || page.url);
        frame.addEventListener("load", () => wireFrameNavigation(frame, pages, page));
        controls.frameWrap.replaceChildren(frame);
      }

      function wireFrameNavigation(frame, pages, currentPage) {
        let documentRef = null;
        try {
          documentRef = frame.contentDocument;
        } catch {
          return;
        }

        if (!documentRef) return;
        const localByUrl = new Map(
          (pages || [])
            .filter((item) => item.url && item.localPage)
            .map((item) => [canonicalPageUrl(item.url), item]),
        );

        for (const anchor of documentRef.querySelectorAll("a[href]")) {
          const rawHref = anchor.getAttribute("href") || "";
          if (!rawHref || rawHref.startsWith("#")) continue;

          let target = "";
          try {
            target = new URL(rawHref, currentPage?.url || frame.contentWindow.location.href).href;
          } catch {
            continue;
          }

          const localPage = localByUrl.get(canonicalPageUrl(target));
          if (!localPage) continue;
          anchor.href = publicUrl(localPage.localPage);
          anchor.target = "_self";
          anchor.addEventListener("click", () => {
            const index = pages.indexOf(localPage);
            if (index >= 0) {
              state.page = String(index);
              updateRoute();
              controls.pageUrl.textContent = localPage.url;
            }
          });
        }
      }

      function canonicalPageUrl(rawUrl) {
        try {
          const url = new URL(rawUrl);
          url.hash = "";
          url.searchParams.sort();
          return url.href.replace(new RegExp("/(?:index\\\\.html?)?$", "i"), "/");
        } catch {
          return String(rawUrl || "").split("#")[0];
        }
      }

      async function renderFallbackListing(site, snapshot, missingPath) {
        const requestId = ++viewerRequestId;
        const listing = await firstAvailableListing(site, snapshot, missingPath);
        if (requestId !== viewerRequestId) return;

        if (listing) {
          const frame = document.createElement("iframe");
          frame.src = publicUrl(listing);
          frame.title = "Files in snapshot " + (snapshot.label || snapshot.key);
          controls.frameWrap.replaceChildren(frame);
        } else {
          controls.frameWrap.innerHTML = '<div class="empty">No local snapshot files are available for this selection.</div>';
        }
      }

      async function firstAvailableListing(site, snapshot, missingPath) {
        const candidates = [];
        if (missingPath) {
          const parts = missingPath.split("/").filter(Boolean);
          parts.pop();
          while (parts.length > 3) {
            candidates.push(parts.join("/") + "/_listing.html");
            parts.pop();
          }
        }

        candidates.push(
          "snapshots/" + site.id + "/" + snapshot.key + "/site/_listing.html",
          "snapshots/" + site.id + "/" + snapshot.key + "/_listing.html",
        );

        for (const candidate of [...new Set(candidates)]) {
          if (await fileIsAvailable(publicUrl(candidate))) {
            return candidate;
          }
        }

        return "";
      }

      async function fileIsAvailable(url) {
        try {
          const response = await fetch(url, { method: "HEAD", cache: "no-store" });
          if (response.ok) return true;
          if (response.status !== 405) return false;
        } catch {
          // Some static hosts reject HEAD; try a tiny GET below.
        }

        try {
          const response = await fetch(url, { method: "GET", cache: "no-store" });
          return response.ok;
        } catch {
          return false;
        }
      }

      function resourceLinks(site, snapshot, page) {
        const links = [
          { label: "Original", href: site.originalUrl },
          { label: "Captured URL", href: page?.url },
          { label: "GitHub", href: site.repoUrl },
        ];
        if (snapshot.commit?.url) links.push({ label: "Commit", href: snapshot.commit.url });
        if (site.readme?.url) links.push({ label: "README", href: site.readme.url });
        for (const link of site.readme?.links || []) links.push({ label: link.label, href: link.url });
        return links.filter((link) => link.href);
      }

      function compareSites(a, b, grouped = false) {
        if (grouped && a.groupIndex !== b.groupIndex) {
          return a.groupIndex - b.groupIndex;
        }

        const mode = state.sort || "updated-desc";
        if (mode === "original") return a.groupIndex - b.groupIndex || a.siteIndex - b.siteIndex;
        if (mode === "name-asc") return collator.compare(a.repoName, b.repoName);
        if (mode === "name-desc") return collator.compare(b.repoName, a.repoName);
        if (mode === "snapshots-desc") return b.snapshots.length - a.snapshots.length || collator.compare(a.repoName, b.repoName);
        return latestTimestamp(b) - latestTimestamp(a) || collator.compare(a.repoName, b.repoName);
      }

      function latestTimestamp(site) {
        return Number(site.snapshots[0]?.timestamp || site.latestCommit?.timestamp || 0);
      }

      function searchScore(site, query) {
        if (!query) return 1;
        const haystack = normalize([
          site.repoName,
          site.originalUrl,
          site.finalUrl,
          site.group,
          site.isGambaaa ? "gambaaa" : "original",
          site.latestCommit?.message,
          site.latestCommit?.sha,
          ...site.snapshots.flatMap((snapshot) => [
            snapshot.key,
            snapshot.label,
            snapshot.commit?.message,
            ...(snapshot.pages || []).flatMap((page) => [page.title, page.url]),
          ]),
        ].filter(Boolean).join(" "));
        return query.split(/\\s+/g).filter(Boolean).reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
      }

      function readState() {
        const hashParams = new URLSearchParams(location.hash.slice(1));
        if (hashParams.size > 0) {
          return {
            q: hashParams.get("q") || "",
            url: hashParams.get("url") || "",
            site: hashParams.get("site") || "",
            snapshot: hashParams.get("snapshot") || "",
            page: hashParams.get("page") || "0",
            sort: hashParams.get("sort") || "updated-desc",
            grouped: hashParams.get("grouped") || "1",
          };
        }

        const parts = location.pathname.startsWith("/wayback")
          ? location.pathname
              .replace(/^\\/wayback\\/?/, "")
              .split("/")
              .filter(Boolean)
              .map((part) => decodeURIComponent(part))
          : [];
        const route = {};
        for (let index = 0; index < parts.length; index += 2) {
          route[parts[index]] = parts[index + 1] || "";
        }
        const labeledRoute = ["site", "snapshot", "page", "q", "url", "sort", "grouped"].includes(parts[0]);

        return {
          q: route.q || "",
          url: route.url || "",
          site: route.site || (!labeledRoute ? parts[0] || "" : ""),
          snapshot: route.snapshot || (!labeledRoute ? parts[1] || "" : ""),
          page: route.page || (!labeledRoute ? parts[2] || "0" : "0"),
          sort: route.sort || "updated-desc",
          grouped: route.grouped || "1",
        };
      }

      function updateRoute() {
        const parts = ["wayback"];
        if (state.site) parts.push("site", state.site);
        if (state.snapshot) parts.push("snapshot", state.snapshot);
        if (state.page && state.page !== "0") parts.push("page", state.page);
        if (state.q) parts.push("q", state.q);
        if (state.url) parts.push("url", state.url);
        if (state.sort && state.sort !== "updated-desc") parts.push("sort", state.sort);
        if (state.grouped && state.grouped !== "1") parts.push("grouped", state.grouped);
        const route = "/" + parts.map((part) => encodeURIComponent(part)).join("/");
        applyingRoute = true;
        history.replaceState(null, "", route);
        applyingRoute = false;
      }

      function publicUrl(value) {
        const path = String(value || "");
        return /^https?:\\/\\//i.test(path) || path.startsWith("/") ? path : "/" + path;
      }

      function normalize(value) {
        return String(value || "").trim().toLowerCase();
      }

      function looksLikeUrl(value) {
        return /^https?:\\/\\//i.test(String(value || "").trim());
      }

      function hostLabel(rawUrl) {
        try {
          return new URL(rawUrl).hostname.replace(/^www\\./, "");
        } catch {
          return "unknown host";
        }
      }
    </script>
  </body>
</html>
`;

  const allSites = groups.flatMap((group) => group.sites);
  const totalSites = groups.reduce((sum, group) => sum + group.sites.length, 0);
  const gambaaaSites = groups
    .flatMap((group) => group.sites)
    .filter((site) => site.isGambaaa).length;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Volný Projekt projects</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #111318;
        --panel: #191d25;
        --panel-strong: #222835;
        --text: #f4f7fb;
        --muted: #aab3c2;
        --line: #343b4a;
        --accent: #6fd0a8;
        --accent-strong: #26b783;
        --warning: #f0c66a;
        --danger: #f18989;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: var(--bg);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      button,
      input,
      select {
        font: inherit;
      }

      .page {
        width: min(1180px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 56px;
      }

      .hero {
        display: grid;
        gap: 18px;
        padding: 26px 0 30px;
        border-bottom: 1px solid var(--line);
      }

      .eyebrow {
        color: var(--accent);
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      h1,
      h2,
      p {
        margin: 0;
      }

      h1 {
        max-width: 760px;
        font-size: clamp(2.2rem, 6vw, 5.6rem);
        line-height: 0.95;
        letter-spacing: 0;
      }

      .summary {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        color: var(--muted);
      }

      .tools {
        display: grid;
        grid-template-columns: minmax(220px, 1fr) minmax(180px, 260px) auto;
        align-items: end;
        gap: 12px;
        width: min(880px, 100%);
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #151922;
        padding: 12px;
      }

      .field {
        display: grid;
        gap: 6px;
      }

      label {
        color: var(--muted);
        font-size: 0.78rem;
        font-weight: 800;
      }

      input,
      select,
      .toggle-button {
        width: 100%;
        min-height: 38px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #0f1218;
        color: var(--text);
        font-size: 0.92rem;
        font-weight: 700;
        padding: 0 12px;
      }

      .toggle-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        cursor: pointer;
        white-space: nowrap;
      }

      .toggle-button[aria-pressed="true"] {
        border-color: color-mix(in srgb, var(--accent) 50%, transparent);
        background: color-mix(in srgb, var(--accent-strong) 18%, #0f1218);
        color: #cffff0;
      }

      input::placeholder {
        color: #798395;
      }

      .summary span,
      .badge {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 5px 10px;
        background: #151922;
        font-size: 0.82rem;
        font-weight: 700;
      }

      .group {
        padding-top: 34px;
      }

      [hidden] {
        display: none !important;
      }

      .group-head {
        display: flex;
        align-items: end;
        justify-content: space-between;
        gap: 18px;
        margin-bottom: 16px;
      }

      h2 {
        font-size: clamp(1.3rem, 3vw, 2rem);
        letter-spacing: 0;
      }

      .group-count {
        color: var(--muted);
        font-size: 0.94rem;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 16px;
      }

      .site-card {
        display: grid;
        overflow: hidden;
        min-height: 100%;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        transition: border-color 160ms ease, transform 160ms ease, background 160ms ease;
      }

      .site-card:hover {
        transform: translateY(-2px);
        border-color: #566176;
        background: var(--panel-strong);
      }

      .site-card[hidden] {
        display: none;
      }

      .preview {
        display: grid;
        place-items: center;
        width: 100%;
        aspect-ratio: 16 / 10;
        overflow: hidden;
        border: 0;
        border-bottom: 1px solid var(--line);
        background: #0f1218;
        color: inherit;
        cursor: pointer;
        padding: 0;
        text-align: inherit;
      }

      .preview:disabled {
        cursor: default;
      }

      .preview img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      .placeholder {
        display: grid;
        gap: 8px;
        place-items: center;
        width: 100%;
        height: 100%;
        color: var(--muted);
        padding: 20px;
        text-align: center;
      }

      .placeholder-mark {
        width: 54px;
        height: 54px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background:
          linear-gradient(135deg, transparent 0 45%, #303747 45% 55%, transparent 55%),
          #171b24;
      }

      .site-content {
        display: grid;
        gap: 12px;
        padding: 14px;
      }

      .repo {
        overflow-wrap: anywhere;
        font-size: 1rem;
        font-weight: 800;
        line-height: 1.25;
      }

      .repo-link:hover,
      .url:hover {
        color: var(--accent);
      }

      .url {
        color: var(--muted);
        overflow-wrap: anywhere;
        font-size: 0.82rem;
        line-height: 1.4;
      }

      .links {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .resource-link {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #151922;
        color: var(--muted);
        font-size: 0.82rem;
        font-weight: 800;
        padding: 5px 9px;
      }

      .resource-link:hover {
        border-color: #566176;
        color: var(--accent);
      }

      .badges {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .badge.gambaaa {
        border-color: color-mix(in srgb, var(--accent) 58%, transparent);
        background: color-mix(in srgb, var(--accent-strong) 18%, #12161d);
        color: #cffff0;
      }

      .badge.original {
        color: var(--muted);
      }

      .badge.error {
        border-color: color-mix(in srgb, var(--danger) 50%, transparent);
        color: #ffd7d7;
      }

      .badge.good {
        border-color: color-mix(in srgb, var(--accent) 45%, transparent);
        color: #cffff0;
      }

      .badge.warn {
        border-color: color-mix(in srgb, var(--warning) 45%, transparent);
        color: #ffe8ae;
      }

      footer {
        padding-top: 34px;
        color: var(--muted);
        font-size: 0.86rem;
      }

      .gallery-modal {
        position: fixed;
        inset: 0;
        z-index: 20;
        display: grid;
        place-items: center;
        padding: 20px;
        background: rgb(8 10 14 / 82%);
      }

      .gallery-modal[hidden] {
        display: none;
      }

      .gallery-dialog {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        gap: 14px;
        width: min(1100px, 100%);
        max-height: min(780px, calc(100vh - 40px));
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        padding: 14px;
      }

      .gallery-head,
      .gallery-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .gallery-title {
        overflow-wrap: anywhere;
        font-size: 1rem;
        font-weight: 800;
      }

      .icon-button {
        min-width: 38px;
        min-height: 38px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #151922;
        color: var(--text);
        cursor: pointer;
      }

      .gallery-stage {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        min-height: 0;
      }

      .gallery-image-wrap {
        display: grid;
        place-items: center;
        min-height: 0;
        height: 100%;
        border: 1px solid var(--line);
        border-radius: 8px;
        overflow: hidden;
        background: #0f1218;
      }

      .gallery-image {
        display: block;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }

      .gallery-link,
      .gallery-count {
        color: var(--muted);
        overflow-wrap: anywhere;
        font-size: 0.86rem;
      }

      .gallery-link:hover {
        color: var(--accent);
      }

      @media (max-width: 640px) {
        .page {
          width: min(100% - 20px, 1180px);
          padding-top: 18px;
        }

        .hero {
          padding-top: 18px;
        }

        .group-head {
          align-items: start;
          flex-direction: column;
          gap: 6px;
        }

        .grid {
          grid-template-columns: 1fr;
        }

        .tools {
          grid-template-columns: 1fr;
        }

        .gallery-stage {
          grid-template-columns: 1fr;
        }

        .gallery-stage .icon-button {
          width: 100%;
        }

        .gallery-foot {
          align-items: start;
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero" aria-labelledby="page-title">
        <p class="eyebrow">Daily website preview board</p>
        <h1 id="page-title">Volný project Projects</h1>
        <div class="summary" aria-label="Site summary">
          <span>${totalSites} sites</span>
          <span>${groups.length} groups</span>
          <span>${gambaaaSites} on ${targetDomain}</span>
          <span>Updated ${escapeHtml(generatedAt.toLocaleString("en-US", { timeZone: "Europe/Prague" }))}</span>
        </div>
        <div class="tools" aria-label="Site controls">
          <div class="field">
            <label for="search-sites">Search</label>
            <input id="search-sites" type="search" placeholder="Repo, URL, badge, page title">
          </div>
          <div class="field">
            <label for="sort-sites">Sort</label>
            <select id="sort-sites">
              <option value="original">Original order</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
              <option value="gambaaa-first">Gambaaa first</option>
              <option value="original-first">Original domain first</option>
              <option value="updated-desc" selected>Last updated</option>
            </select>
          </div>
          <button class="toggle-button" type="button" data-ungroup-toggle aria-pressed="false">Ungroup</button>
        </div>
      </section>
      <section class="group" data-flat-section aria-labelledby="group-all" hidden>
        <div class="group-head">
          <h2 id="group-all">All sites</h2>
          <p class="group-count" data-group-count>${allSites.length} sites</p>
        </div>
        <div class="grid" data-site-grid>
          ${allSites.map(renderSiteCard).join("\n          ")}
        </div>
      </section>
      ${groups
        .map(
          (
            group,
            index,
          ) => `<section class="group" data-grouped-section aria-labelledby="group-${index + 1}">
        <div class="group-head">
          <h2 id="group-${index + 1}">${escapeHtml(group.name)}</h2>
          <p class="group-count" data-group-count>${group.sites.length} sites</p>
        </div>
        <div class="grid" data-site-grid>
          ${group.sites.map(renderSiteCard).join("\n          ")}
        </div>
      </section>`,
        )
        .join("\n      ")}
      <footer>
        Generated from sites.txt. Repo links open the original URL, even when the site redirects elsewhere.
      </footer>
    </main>
    <div class="gallery-modal" id="gallery-modal" hidden>
      <div class="gallery-dialog" role="dialog" aria-modal="true" aria-labelledby="gallery-title">
        <div class="gallery-head">
          <p class="gallery-title" id="gallery-title"></p>
          <button class="icon-button" type="button" data-gallery-close aria-label="Close gallery">Close</button>
        </div>
        <div class="gallery-stage">
          <button class="icon-button" type="button" data-gallery-prev aria-label="Previous screenshot">Prev</button>
          <div class="gallery-image-wrap">
            <img class="gallery-image" alt="" data-gallery-image>
          </div>
          <button class="icon-button" type="button" data-gallery-next aria-label="Next screenshot">Next</button>
        </div>
        <div class="gallery-foot">
          <a class="gallery-link" href="#" target="_blank" rel="noopener noreferrer" data-gallery-link></a>
          <p class="gallery-count" data-gallery-count></p>
        </div>
      </div>
    </div>
    <script>
      const searchInput = document.querySelector("#search-sites");
      const sortSelect = document.querySelector("#sort-sites");
      const ungroupToggle = document.querySelector("[data-ungroup-toggle]");
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      const modal = document.querySelector("#gallery-modal");
      const modalTitle = document.querySelector("#gallery-title");
      const modalImage = document.querySelector("[data-gallery-image]");
      const modalLink = document.querySelector("[data-gallery-link]");
      const modalCount = document.querySelector("[data-gallery-count]");
      const prevButton = document.querySelector("[data-gallery-prev]");
      const nextButton = document.querySelector("[data-gallery-next]");
      const closeButton = document.querySelector("[data-gallery-close]");
      const preferenceKey = "gambaaa-project-controls";
      const preferenceMaxAge = 24 * 60 * 60 * 1000;
      let activeGallery = [];
      let activeIndex = 0;

      restorePreferences();

      searchInput?.addEventListener("input", () => {
        savePreferences();
        applyControls();
      });
      sortSelect?.addEventListener("change", () => {
        savePreferences();
        applyControls();
      });
      ungroupToggle?.addEventListener("click", () => {
        const enabled = ungroupToggle.getAttribute("aria-pressed") !== "true";
        setUngrouped(enabled);
        savePreferences();
        applyControls();
      });

      applyControls();

      function restorePreferences() {
        const preferences = readPreferences();
        if (!preferences) {
          return;
        }

        if (searchInput && typeof preferences.search === "string") {
          searchInput.value = preferences.search;
        }

        if (
          sortSelect &&
          typeof preferences.sort === "string" &&
          [...sortSelect.options].some((option) => option.value === preferences.sort)
        ) {
          sortSelect.value = preferences.sort;
        }

        setUngrouped(Boolean(preferences.ungrouped));
      }

      function readPreferences() {
        try {
          const preferences = JSON.parse(localStorage.getItem(preferenceKey) || "null");
          if (!preferences || Date.now() - Number(preferences.savedAt || 0) > preferenceMaxAge) {
            localStorage.removeItem(preferenceKey);
            return null;
          }

          return preferences;
        } catch {
          return null;
        }
      }

      function savePreferences() {
        try {
          localStorage.setItem(
            preferenceKey,
            JSON.stringify({
              search: searchInput?.value || "",
              sort: sortSelect?.value || "updated-desc",
              ungrouped: ungroupToggle?.getAttribute("aria-pressed") === "true",
              savedAt: Date.now(),
            }),
          );
        } catch {
          // Preferences are optional.
        }
      }

      function setUngrouped(enabled) {
        if (!ungroupToggle) {
          return;
        }

        ungroupToggle.setAttribute("aria-pressed", String(enabled));
        ungroupToggle.textContent = enabled ? "Group" : "Ungroup";
        for (const section of document.querySelectorAll("[data-grouped-section]")) {
          section.hidden = enabled;
        }
        const flatSection = document.querySelector("[data-flat-section]");
        if (flatSection) {
          flatSection.hidden = !enabled;
        }
      }

      function applyControls() {
        const query = normalizeText(searchInput?.value || "");

        for (const grid of document.querySelectorAll("[data-site-grid]")) {
          const cards = [...grid.querySelectorAll("[data-site-card]")];
          cards.sort(
            (a, b) =>
              compareSearchRank(a, b, query) ||
              compareCards(a, b, sortSelect?.value || "original"),
          );
          for (const card of cards) {
            card.hidden = Boolean(query) && searchScore(card, query) === 0;
            grid.append(card);
          }

          const visibleCount = cards.filter((card) => !card.hidden).length;
          const count = grid.closest(".group")?.querySelector("[data-group-count]");
          if (count) {
            count.textContent = String(visibleCount) + " / " + String(cards.length) + " sites";
          }
        }
      }

      function compareCards(a, b, mode) {
        if (mode === "name-asc") {
          return byName(a, b);
        }

        if (mode === "name-desc") {
          return byName(b, a);
        }

        if (mode === "gambaaa-first") {
          return byDomain(b, a) || byName(a, b);
        }

        if (mode === "original-first") {
          return byDomain(a, b) || byName(a, b);
        }

        if (mode === "updated-desc") {
          return byUpdated(b, a) || byName(a, b);
        }

        return Number(a.dataset.index) - Number(b.dataset.index);
      }

      function byName(a, b) {
        return collator.compare(a.dataset.name || "", b.dataset.name || "");
      }

      function byDomain(a, b) {
        return Number(a.dataset.gambaaa) - Number(b.dataset.gambaaa);
      }

      function byUpdated(a, b) {
        return Number(a.dataset.updated || "0") - Number(b.dataset.updated || "0");
      }

      function compareSearchRank(a, b, query) {
        if (!query) {
          return 0;
        }

        return searchScore(b, query) - searchScore(a, query);
      }

      function searchScore(card, query) {
        if (!query) {
          return 0;
        }

        const aliases = searchAliases(query);
        let score = 0;

        for (const alias of aliases) {
          if ((card.dataset.goodSearch || "").split(" ").includes(alias)) {
            score += 1000;
          }

          if ((card.dataset.badSearch || "").split(" ").includes(alias)) {
            score -= 500;
          }

          if ((card.dataset.name || "").toLowerCase().includes(alias)) {
            score += 80;
          }

          if ((card.dataset.search || "").includes(alias)) {
            score += 20;
          }
        }

        return score;
      }

      function searchAliases(query) {
        const aliases = new Set(query.split(/\s+/g).filter(Boolean));

        if (aliases.has("a11y")) {
          aliases.add("accessibility");
        }

        if (aliases.has("accessibility")) {
          aliases.add("a11y");
        }

        return aliases;
      }

      function normalizeText(value) {
        return value.trim().toLowerCase();
      }

      for (const button of document.querySelectorAll("[data-gallery]")) {
        button.addEventListener("click", () => {
          const gallery = JSON.parse(button.dataset.gallery || "[]");
          if (gallery.length === 0) {
            return;
          }

          activeGallery = gallery;
          activeIndex = 0;
          modalTitle.textContent = button.dataset.galleryTitle || "";
          modal.hidden = false;
          document.body.style.overflow = "hidden";
          renderGallery();
        });
      }

      prevButton?.addEventListener("click", () => {
        activeIndex = (activeIndex - 1 + activeGallery.length) % activeGallery.length;
        renderGallery();
      });

      nextButton?.addEventListener("click", () => {
        activeIndex = (activeIndex + 1) % activeGallery.length;
        renderGallery();
      });

      closeButton?.addEventListener("click", closeGallery);

      modal?.addEventListener("click", (event) => {
        if (event.target === modal) {
          closeGallery();
        }
      });

      document.addEventListener("keydown", (event) => {
        if (modal?.hidden) {
          return;
        }

        if (event.key === "Escape") {
          closeGallery();
        }

        if (event.key === "ArrowLeft") {
          prevButton?.click();
        }

        if (event.key === "ArrowRight") {
          nextButton?.click();
        }
      });

      function renderGallery() {
        const item = activeGallery[activeIndex];
        if (!item) {
          return;
        }

        modalImage.src = item.screenshot;
        modalImage.alt = item.title || item.url;
        modalLink.href = item.url;
        modalLink.textContent = item.title || item.url;
        modalCount.textContent = String(activeIndex + 1) + " / " + String(activeGallery.length);
        prevButton.disabled = activeGallery.length < 2;
        nextButton.disabled = activeGallery.length < 2;
      }

      function closeGallery() {
        modal.hidden = true;
        document.body.style.overflow = "";
        modalImage.removeAttribute("src");
      }
    </script>
  </body>
</html>
`;
}

function renderSiteCard(site, index) {
  const escapedRepo = escapeHtml(site.repoName);
  const escapedOriginal = escapeHtml(site.originalUrl);
  const escapedRepoUrl = escapeHtml(site.repoUrl);
  const escapedGallery = escapeHtml(JSON.stringify(site.gallery));
  const metadata = site.metadata || emptyMetadata();
  const latestCommit = site.latestCommit || emptyCommitInfo();
  const statusCode = site.gallery[0]?.status || null;
  const statusLabel = statusCode ? `HTTP ${statusCode}` : "HTTP unknown";
  const updatedLabel = formatCommitDate(latestCommit);
  const goodSearchTerms = [
    site.isGambaaa ? "gambaaa" : "original",
    metadata.robots ? "robots" : null,
    metadata.sitemap ? "sitemap" : null,
    metadata.seo ? "seo" : null,
    metadata.accessibility ? "a11y accessibility" : null,
  ]
    .filter(Boolean)
    .join(" ");
  const badSearchTerms = [
    metadata.robots ? null : "robots",
    metadata.sitemap ? null : "sitemap",
    metadata.seo ? null : "seo",
    metadata.accessibility ? null : "a11y accessibility",
  ]
    .filter(Boolean)
    .join(" ");
  const searchText = [
    site.repoName,
    site.originalUrl,
    site.finalUrl,
    site.repoUrl,
    site.readme?.url,
    ...(site.readme?.links || []).flatMap((link) => [link.label, link.url]),
    site.isGambaaa ? "gambaaa" : "original domain",
    metadata.robots ? "robots" : "no robots",
    metadata.sitemap ? "sitemap" : "no sitemap",
    metadata.seo ? "seo" : "seo missing",
    metadata.accessibility
      ? "a11y accessibility"
      : "no a11y accessibility missing",
    statusLabel,
    updatedLabel,
    latestCommit.message,
    latestCommit.sha,
    ...site.gallery.flatMap((item) => [item.title, item.url]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return `<article class="site-card" data-site-card data-index="${index}" data-name="${escapedRepo}" data-gambaaa="${site.isGambaaa ? "1" : "0"}" data-updated="${latestCommit.timestamp || 0}" data-good-search="${escapeHtml(goodSearchTerms)}" data-bad-search="${escapeHtml(badSearchTerms)}" data-search="${escapeHtml(searchText)}">
            <button class="preview" type="button" data-gallery="${escapedGallery}" data-gallery-title="${escapedRepo}" ${site.gallery.length === 0 ? "disabled" : ""} aria-label="Open screenshot gallery for ${escapedRepo}">
              ${
                site.screenshot
                  ? `<img src="${escapeHtml(site.screenshot)}" alt="Screenshot preview of ${escapedRepo}" loading="lazy">`
                  : `<div class="placeholder" aria-hidden="true"><span class="placeholder-mark"></span><span>Preview pending</span></div>`
              }
            </button>
            <div class="site-content">
              <a class="repo repo-link" href="${escapedOriginal}" target="_blank" rel="noopener noreferrer">${escapedRepo}</a>
              <a class="url" href="${escapedOriginal}" target="_blank" rel="noopener noreferrer">${escapedOriginal}</a>
              <div class="links" aria-label="Repository resources">
                <a class="resource-link" href="${escapedRepoUrl}" target="_blank" rel="noopener noreferrer">GitHub</a>
                ${latestCommit.url ? `<a class="resource-link" href="${escapeHtml(latestCommit.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(latestCommit.message || "Latest GitHub commit")}">${escapeHtml(updatedLabel)}</a>` : `<span class="resource-link" title="Latest GitHub commit was not available">${escapeHtml(updatedLabel)}</span>`}
                ${site.readme?.url ? `<a class="resource-link" href="${escapeHtml(site.readme.url)}" target="_blank" rel="noopener noreferrer">README</a>` : ""}
                ${(site.readme?.links || []).map((link) => `<a class="resource-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`).join("")}
              </div>
              <div class="badges" aria-label="Site badges">
                ${site.isGambaaa ? `<span class="badge gambaaa">On ${targetDomain}</span>` : `<span class="badge original">Original domain</span>`}
                ${renderBooleanBadge("robots.txt", metadata.robots)}
                ${renderBooleanBadge("sitemap", metadata.sitemap)}
                ${renderBooleanBadge("SEO", metadata.seo)}
                ${renderBooleanBadge("A11y", metadata.accessibility)}
                <span class="badge ${statusCode && statusCode >= 400 ? "error" : "original"}">${escapeHtml(statusLabel)}</span>
                ${site.error ? `<span class="badge error" title="${escapeHtml(site.error)}">Needs check</span>` : ""}
              </div>
            </div>
          </article>`;
}

function renderBooleanBadge(label, value) {
  return `<span class="badge ${value ? "good" : "warn"}">${value ? "" : "No "}${escapeHtml(label)}</span>`;
}
