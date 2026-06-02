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

const generatedAt = new Date();

await mkdir(screenshotsDir, { recursive: true });

const groups = parseGroups(await readFile(sitesPath, "utf8"));
const browserTools = await loadBrowserTools();
const browser = await launchBrowser(browserTools);

const renderedGroups = [];

try {
  for (const [groupIndex, sites] of groups.entries()) {
    const renderedSites = [];

    for (const [siteIndex, originalUrl] of sites.entries()) {
      const slug = stableSlug(originalUrl, groupIndex, siteIndex);
      const screenshotName = `${slug}.png`;
      const screenshotPath = path.join(screenshotsDir, screenshotName);
      const result = await inspectSite(browser, originalUrl, screenshotPath);

      renderedSites.push({
        originalUrl,
        repoName: repoNameFromUrl(originalUrl),
        finalUrl: result.finalUrl,
        isGambaaa: isGambaaaHost(result.finalUrl),
        screenshot: result.hasScreenshot ? `screenshots/${screenshotName}` : null,
        status: result.status,
        error: result.error
      });
    }

    renderedGroups.push(renderedSites);
  }
} finally {
  if (browser) {
    await browser.close();
  }
}

await writeFile(path.join(publicDir, "index.html"), renderHtml(renderedGroups), "utf8");

function parseGroups(content) {
  return content
    .split(/\n\s*\n/g)
    .map((group) =>
      group
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean)
    )
    .filter((group) => group.length > 0);
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
    ["WebKit", browserTools.webkit]
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
        args: candidate.type === "chromium" ? systemChromiumArgs() : []
      });
      console.log(`Using ${candidate.name} at ${executablePath}.`);
      return browser;
    } catch (error) {
      console.warn(
        `Found ${candidate.name} at ${executablePath}, but could not launch it: ${
          error instanceof Error ? error.message.split("\n")[0] : String(error)
        }`
      );
    }
  }

  console.warn("No compatible browser executable found, generating placeholders instead.");
  return null;
}

async function browserCandidates() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
  const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
  const commands = await pathCommandCandidates();

  return [
    {
      name: "Google Chrome",
      type: "chromium",
      paths: [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        path.join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/snap/bin/chromium",
        path.join(programFiles, "Google/Chrome/Application/chrome.exe"),
        path.join(programFilesX86, "Google/Chrome/Application/chrome.exe"),
        path.join(localAppData, "Google/Chrome/Application/chrome.exe"),
        ...commands.chrome
      ]
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
        ...commands.chromium
      ]
    },
    {
      name: "Microsoft Edge",
      type: "chromium",
      paths: [
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        path.join(home, "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
        "/usr/bin/microsoft-edge",
        "/usr/bin/microsoft-edge-stable",
        path.join(programFiles, "Microsoft/Edge/Application/msedge.exe"),
        path.join(programFilesX86, "Microsoft/Edge/Application/msedge.exe"),
        path.join(localAppData, "Microsoft/Edge/Application/msedge.exe"),
        ...commands.edge
      ]
    },
    {
      name: "Brave",
      type: "chromium",
      paths: [
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        path.join(home, "Applications/Brave Browser.app/Contents/MacOS/Brave Browser"),
        "/usr/bin/brave-browser",
        "/usr/bin/brave",
        "/snap/bin/brave",
        path.join(programFiles, "BraveSoftware/Brave-Browser/Application/brave.exe"),
        path.join(programFilesX86, "BraveSoftware/Brave-Browser/Application/brave.exe"),
        path.join(localAppData, "BraveSoftware/Brave-Browser/Application/brave.exe"),
        ...commands.brave
      ]
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
        ...commands.firefox
      ]
    }
  ];
}

async function pathCommandCandidates() {
  const pathDirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const commandMap = {
    chrome: ["google-chrome", "google-chrome-stable", "chrome"],
    chromium: ["chromium", "chromium-browser"],
    edge: ["microsoft-edge", "microsoft-edge-stable", "msedge"],
    brave: ["brave-browser", "brave"],
    firefox: ["firefox"]
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
              })
            )
          )
        ).filter(Boolean)
      ])
    )
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
    "--no-sandbox"
  ];
}

async function inspectSite(browser, originalUrl, screenshotPath) {
  if (!browser) {
    return {
      finalUrl: await fetchFinalUrl(originalUrl),
      hasScreenshot: false,
      status: "Preview pending",
      error: "Install dependencies and rerun the generator to capture screenshots."
    };
  }

  const page = await browser.newPage({
    viewport: { width: 1366, height: 900 },
    deviceScaleFactor: 1
  });

  try {
    const response = await page.goto(originalUrl, {
      waitUntil: "networkidle",
      timeout: 30000
    });

    await page.screenshot({
      path: screenshotPath,
      fullPage: false
    });

    return {
      finalUrl: page.url(),
      hasScreenshot: true,
      status: response ? `${response.status()} ${response.statusText()}`.trim() : "Loaded",
      error: null
    };
  } catch (error) {
    return {
      finalUrl: page.url() === "about:blank" ? originalUrl : page.url(),
      hasScreenshot: false,
      status: "Load failed",
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await page.close();
  }
}

async function fetchFinalUrl(originalUrl) {
  try {
    const response = await fetch(originalUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15000)
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

function stableSlug(url, groupIndex, siteIndex) {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 10);
  return `group-${groupIndex + 1}-${String(siteIndex + 1).padStart(2, "0")}-${hash}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderHtml(groups) {
  const totalSites = groups.reduce((sum, group) => sum + group.length, 0);
  const gambaaaSites = groups.flat().filter((site) => site.isGambaaa).length;

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

      .preview {
        display: grid;
        place-items: center;
        aspect-ratio: 16 / 10;
        overflow: hidden;
        border-bottom: 1px solid var(--line);
        background: #0f1218;
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

      .url {
        color: var(--muted);
        overflow-wrap: anywhere;
        font-size: 0.82rem;
        line-height: 1.4;
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

      footer {
        padding-top: 34px;
        color: var(--muted);
        font-size: 0.86rem;
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
      </section>
      ${groups
        .map(
          (group, index) => `<section class="group" aria-labelledby="group-${index + 1}">
        <div class="group-head">
          <h2 id="group-${index + 1}">Group ${index + 1}</h2>
          <p class="group-count">${group.length} sites</p>
        </div>
        <div class="grid">
          ${group.map(renderSiteCard).join("\n          ")}
        </div>
      </section>`
        )
        .join("\n      ")}
      <footer>
        Generated from sites.txt. Cards always open the original URL, even when the site redirects elsewhere.
      </footer>
    </main>
  </body>
</html>
`;
}

function renderSiteCard(site) {
  const escapedRepo = escapeHtml(site.repoName);
  const escapedOriginal = escapeHtml(site.originalUrl);
  const escapedFinal = escapeHtml(site.finalUrl);
  const status = site.error ? "Load failed" : site.status;

  return `<a class="site-card" href="${escapedOriginal}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapedRepo}">
            <div class="preview">
              ${
                site.screenshot
                  ? `<img src="${escapeHtml(site.screenshot)}" alt="Screenshot preview of ${escapedRepo}" loading="lazy">`
                  : `<div class="placeholder" aria-hidden="true"><span class="placeholder-mark"></span><span>Preview pending</span></div>`
              }
            </div>
            <div class="site-content">
              <p class="repo">${escapedRepo}</p>
              <p class="url">${escapedOriginal}</p>
              <div class="badges" aria-label="Site badges">
                ${site.isGambaaa ? `<span class="badge gambaaa">On ${targetDomain}</span>` : `<span class="badge original">Original domain</span>`}
                <span class="badge original">${escapeHtml(status)}</span>
                ${site.finalUrl !== site.originalUrl ? `<span class="badge original" title="${escapedFinal}">Redirects</span>` : ""}
                ${site.error ? `<span class="badge error" title="${escapeHtml(site.error)}">Needs check</span>` : ""}
              </div>
            </div>
          </a>`;
}
