import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const sitesPath = path.join(root, "sites.txt");
const publicDir = path.join(root, "public");
const screenshotsDir = path.join(publicDir, "screenshots");
const targetDomain = "gambaaa.fun";
const crawlLimit = positiveInteger(process.env.CRAWL_LIMIT) || 10;
const skipScreenshots =
  process.argv.includes("--skip-screenshots") ||
  process.env.SKIP_SCREENSHOTS === "1";

const generatedAt = new Date();

await mkdir(screenshotsDir, { recursive: true });

const groups = parseGroups(await readFile(sitesPath, "utf8"));
const browserTools = await loadBrowserTools();
const browser = await launchBrowser(browserTools);

const renderedGroups = [];

try {
  for (const [groupIndex, group] of groups.entries()) {
    const renderedSites = [];

    for (const [siteIndex, originalUrl] of group.sites.entries()) {
      console.log(
        `[site] ${group.name} ${siteIndex + 1}/${group.sites.length}: ${originalUrl}`,
      );
      const result = await inspectSite(browser, originalUrl);

      renderedSites.push({
        originalUrl,
        repoName: repoNameFromUrl(originalUrl),
        repoUrl: repoUrlFromSiteUrl(originalUrl),
        readme: await readmeInfoFromSiteUrl(originalUrl),
        finalUrl: result.finalUrl,
        isGambaaa: isGambaaaHost(result.finalUrl),
        screenshot: result.gallery[0]?.screenshot || null,
        gallery: result.gallery,
        metadata: result.metadata,
        status: result.status,
        error: result.error,
      });
    }

    renderedGroups.push({
      name: group.name,
      sites: renderedSites,
    });
  }
} finally {
  if (browser) {
    await browser.close();
  }
}

await writeFile(
  path.join(publicDir, "index.html"),
  renderHtml(renderedGroups),
  "utf8",
);
await writeFile(
  path.join(publicDir, "sitemap.xml"),
  renderSitemap(renderedGroups),
  "utf8",
);

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
                return (await fileExists(candidate)) ? candidate : null;
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
    if (await fileExists(executablePath)) {
      return executablePath;
    }
  }

  return null;
}

async function fileExists(filePath) {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
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

async function inspectSite(browser, originalUrl) {
  if (!browser) {
    return {
      finalUrl: await fetchFinalUrl(originalUrl),
      gallery: [],
      metadata: emptyMetadata(),
      status: "Preview pending",
      error:
        "Install dependencies and rerun the generator to capture screenshots.",
    };
  }

  try {
    const result = await crawlSite(browser, originalUrl);

    return {
      finalUrl: result.gallery[0]?.url || originalUrl,
      gallery: result.gallery,
      metadata: result.metadata,
      status: result.gallery.length > 0 ? "Loaded" : "Load failed",
      error: result.gallery.length > 0 ? null : "No screenshots were captured.",
    };
  } catch (error) {
    return {
      finalUrl: originalUrl,
      gallery: [],
      metadata: emptyMetadata(),
      status: "Load failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function crawlSite(browser, originalUrl) {
  const queue = [normalizeUrl(originalUrl)];
  const queued = new Set(queue);
  const captured = new Set();
  const galleryKeys = new Set();
  const gallery = [];
  const originalScope = siteScopeFromUrl(originalUrl);
  let scope = null;
  let robots = null;
  let metadata = emptyMetadata();

  while (queue.length > 0 && gallery.length < crawlLimit) {
    const url = queue.shift();
    if (!url || captured.has(url)) {
      continue;
    }

    const page = await browser.newPage({
      viewport: { width: 1366, height: 900 },
      deviceScaleFactor: 1,
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
      const screenshotName = screenshotNameForUrl(finalUrl);
      const screenshotPath = path.join(screenshotsDir, screenshotName);
      const screenshotUrl = `screenshots/${screenshotName}`;
      const galleryKey = canonicalUrl(finalUrl);
      const screenshotExists = await fileExists(screenshotPath);

      if (galleryKeys.has(galleryKey)) {
        console.log(`[gallery] duplicate skipped: ${finalUrl}`);
      } else if (!skipScreenshots || !screenshotExists) {
        await page.screenshot({
          path: screenshotPath,
          fullPage: false,
        });
        console.log(
          `[screenshot] saved ${screenshotUrl}${skipScreenshots ? " (missing)" : ""}`,
        );
      } else {
        console.log(`[screenshot] reused ${screenshotUrl}`);
      }

      if (!galleryKeys.has(galleryKey)) {
        galleryKeys.add(galleryKey);
        gallery.push({
          url: finalUrl,
          title: title || pageLabelFromUrl(finalUrl),
          screenshot: screenshotUrl,
          status: response ? response.status() : null,
        });
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

  return { gallery, metadata };
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
  return `${hashUrl(canonicalUrl(rawUrl))}.png`;
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

function isGambaaaHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === targetDomain || host.endsWith(`.${targetDomain}`);
  } catch {
    return false;
  }
}

function repoNameFromUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  const parts = parsed.pathname.split("/").filter(Boolean);
  return parts.at(-1) || parsed.hostname;
}

function repoUrlFromSiteUrl(rawUrl) {
  return `https://github.com/pslib-cz/${repoNameFromUrl(rawUrl)}`;
}

async function readmeInfoFromSiteUrl(rawUrl) {
  const repoName = repoNameFromUrl(rawUrl);
  const readmeUrl = `https://raw.githubusercontent.com/pslib-cz/${repoName}/main/README.md`;

  try {
    const response = await fetch(readmeUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { url: null, links: [] };
    }

    const content = await response.text();
    const links = extractUsefulReadmeLinks(content, repoName);

    return {
      url: repoUrlFromSiteUrl(rawUrl),
      links,
    };
  } catch {
    return { url: null, links: [] };
  }
}

function extractUsefulReadmeLinks(content, repoName) {
  const rawUrls = [...content.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)].map(
    (match) => cleanReadmeUrl(match[0]),
  );

  const assetHints = [
    ...content.matchAll(
      /(?:^|[\s[(])((?:\.\/|\/)?public\/assets\/images\/?[^\s<>"')\]]*)/gim,
    ),
  ].map(
    (match) =>
      `https://github.com/pslib-cz/${repoName}/tree/main/${match[1].replace(/^\.?\//, "")}`,
  );

  return unique([...rawUrls, ...assetHints])
    .map((url) => normalizeReadmeLink(url, repoName))
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

function normalizeReadmeLink(rawUrl, repoName) {
  try {
    if (rawUrl.startsWith("/public/assets/images")) {
      return `https://github.com/pslib-cz/${repoName}/tree/main${rawUrl}`;
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
  const totalSites = groups.reduce((sum, group) => sum + group.sites.length, 0);
  const gambaaaSites = groups
    .flatMap((group) => group.sites)
    .filter((site) => site.isGambaaa).length;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Gambaaa Projects</title>
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
        grid-template-columns: minmax(220px, 1fr) minmax(180px, 260px);
        gap: 12px;
        width: min(720px, 100%);
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
      select {
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
        <h1 id="page-title">Gambaaa Projects</h1>
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
            </select>
          </div>
        </div>
      </section>
      ${groups
        .map(
          (
            group,
            index,
          ) => `<section class="group" aria-labelledby="group-${index + 1}">
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
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      const modal = document.querySelector("#gallery-modal");
      const modalTitle = document.querySelector("#gallery-title");
      const modalImage = document.querySelector("[data-gallery-image]");
      const modalLink = document.querySelector("[data-gallery-link]");
      const modalCount = document.querySelector("[data-gallery-count]");
      const prevButton = document.querySelector("[data-gallery-prev]");
      const nextButton = document.querySelector("[data-gallery-next]");
      const closeButton = document.querySelector("[data-gallery-close]");
      let activeGallery = [];
      let activeIndex = 0;

      searchInput?.addEventListener("input", applyControls);
      sortSelect?.addEventListener("change", applyControls);

      function applyControls() {
        const query = (searchInput?.value || "").trim().toLowerCase();

        for (const grid of document.querySelectorAll("[data-site-grid]")) {
          const cards = [...grid.querySelectorAll("[data-site-card]")];
          cards.sort((a, b) => compareCards(a, b, sortSelect?.value || "original"));
          for (const card of cards) {
            card.hidden = Boolean(query) && !(card.dataset.search || "").includes(query);
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

        return Number(a.dataset.index) - Number(b.dataset.index);
      }

      function byName(a, b) {
        return collator.compare(a.dataset.name || "", b.dataset.name || "");
      }

      function byDomain(a, b) {
        return Number(a.dataset.gambaaa) - Number(b.dataset.gambaaa);
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
  const statusCode = site.gallery[0]?.status || null;
  const statusLabel = statusCode ? `HTTP ${statusCode}` : "HTTP unknown";
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
    metadata.accessibility ? "accessibility" : "accessibility missing",
    statusLabel,
    ...site.gallery.flatMap((item) => [item.title, item.url]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return `<article class="site-card" data-site-card data-index="${index}" data-name="${escapedRepo}" data-gambaaa="${site.isGambaaa ? "1" : "0"}" data-search="${escapeHtml(searchText)}">
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
