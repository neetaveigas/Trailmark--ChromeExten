#!/usr/bin/env node
/*
 * Trailmark build (FR-1.1 to FR-1.5, FR-1.6 domain validation).
 *
 *   npm run build
 *
 * Reads trailmark.config.json and manifest.template.json, and writes a
 * loadable extension to dist/. DESIGN.md section 3 ("What build.js writes to
 * dist/") and section 6 describe the steps and rules.
 *
 * The pure parts (toMatchPattern, toMatchPatterns, validateConfig,
 * createManifest, injectBuildValues) are exported for the Node tests.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { isValidSiteKey } = require('../extension/shared/events.js');

/** The one place the collector address is defined (DESIGN.md section 6, Issue #4). */
const COLLECTOR_ORIGIN = 'http://localhost:4317';
const COLLECTOR_HOST_PERMISSION = `${COLLECTOR_ORIGIN}/*`;
const COLLECTOR_EVENTS_URL = `${COLLECTOR_ORIGIN}/events`;

/** Extension files copied to the root of dist/. */
const ROOT_FILES = ['service-worker.js', 'content.js', 'popup.html', 'popup.js', 'popup.css'];
/** Shared files that must end up in dist/shared/ (DESIGN.md section 3). */
const SHARED_FILES = ['events.js', 'tracking-logic.js', 'serial-queue.js'];
/** Files that receive build values, and the placeholders they must contain. */
const PLACEHOLDERS = {
  siteKey: "'__TRAILMARK_SITE_KEY__'",
  collectorUrl: "'__TRAILMARK_COLLECTOR_URL__'",
};
const INJECT_INTO = 'service-worker.js';

const HOSTNAME_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const VERSION_PATTERN = /^(0|[1-9]\d{0,8})(\.(0|[1-9]\d{0,8})){0,3}$/;

class BuildError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BuildError';
  }
}

function domainError(entry, reason) {
  return new BuildError(`allowedDomains entry ${JSON.stringify(entry)} is not valid: ${reason}`);
}

function isValidHostname(host) {
  return host.length > 0 && host.length <= 253 && host.split('.').every((label) => HOSTNAME_LABEL.test(label));
}

// Turns one allowedDomains entry into a Chrome match pattern (DESIGN.md
// section 6, "allowedDomains format and build validation"):
//   example.com   -> *://example.com/*
//   *.example.com -> *://*.example.com/*   (the domain and its subdomains)
//   *             -> *://*/*               (every site; only entry, see toMatchPatterns)
// Throws a BuildError naming the entry for anything else.
function toMatchPattern(entry) {
  if (typeof entry !== 'string') {
    throw domainError(entry, 'each entry must be a string such as "example.com".');
  }
  if (entry.trim() === '') {
    throw domainError(entry, 'the entry is empty. Write a hostname such as "example.com".');
  }
  if (entry === '*') {
    return '*://*/*';
  }
  if (entry.includes('://')) {
    throw domainError(entry, 'remove the scheme (such as "https://"). Write only the hostname, such as "example.com".');
  }
  if (entry.includes('/')) {
    throw domainError(entry, 'remove the path. Write only the hostname, such as "example.com".');
  }
  if (entry.includes(':')) {
    throw domainError(entry, 'remove the port. Ports are not allowed; "localhost" already matches every port.');
  }

  let host = entry;
  let subdomains = false;
  if (entry.startsWith('*.')) {
    host = entry.slice(2);
    subdomains = true;
  }
  if (host.includes('*')) {
    throw domainError(entry, '"*" is only allowed on its own ("*") or at the very start as "*." (such as "*.example.com").');
  }
  if (/[A-Z]/.test(host)) {
    throw domainError(entry, `use lowercase letters only (such as ${JSON.stringify(entry.toLowerCase())}).`);
  }
  if (!isValidHostname(host)) {
    throw domainError(
      entry,
      'it is not a valid hostname. Use only lowercase letters, digits, hyphens and dots, such as "shop.example.com".'
    );
  }
  return subdomains ? `*://*.${host}/*` : `*://${host}/*`;
}

/** Validates the whole allowedDomains list and returns its match patterns, without duplicates. */
function toMatchPatterns(allowedDomains) {
  if (!Array.isArray(allowedDomains)) {
    throw new BuildError('allowedDomains must be a list, such as ["example.com"] or ["*"].');
  }
  if (allowedDomains.length === 0) {
    throw new BuildError('allowedDomains is empty. List at least one website, or use ["*"] for every website.');
  }
  if (allowedDomains.includes('*') && allowedDomains.length > 1) {
    throw new BuildError('allowedDomains: "*" (every website) must be the only entry. Use ["*"] on its own, or list the websites.');
  }
  return [...new Set(allowedDomains.map(toMatchPattern))];
}

function requireText(config, field) {
  if (typeof config[field] !== 'string' || config[field].trim() === '') {
    throw new BuildError(`trailmark.config.json: "${field}" must be a non-empty string.`);
  }
}

/** Checks every setting the build uses (FR-1.1). Throws a BuildError on the first problem. */
function validateConfig(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new BuildError('trailmark.config.json must contain a JSON object.');
  }
  requireText(config, 'name');
  requireText(config, 'description');
  requireText(config, 'version');
  if (!VERSION_PATTERN.test(config.version)) {
    throw new BuildError(
      `trailmark.config.json: "version" ${JSON.stringify(config.version)} is not valid. Use 1 to 4 numbers separated by dots, such as "0.1.0".`
    );
  }
  if (!isValidSiteKey(config.siteKey)) {
    throw new BuildError(
      'trailmark.config.json: "siteKey" must be exactly 22 characters of letters, numbers, "_" and "-".'
    );
  }
  toMatchPatterns(config.allowedDomains);
}

/**
 * Pure: returns the finished manifest without changing the template.
 * The allowedDomains patterns fill both host_permissions and every content
 * script's matches (FR-1.3). The collector permission is always added to
 * host_permissions once, and never to matches (Issue #4).
 */
function createManifest(config, template) {
  validateConfig(config);
  const patterns = toMatchPatterns(config.allowedDomains);
  const manifest = structuredClone(template);

  manifest.name = config.name;
  manifest.description = config.description;
  manifest.version = config.version;
  manifest.host_permissions = [...new Set([...patterns, COLLECTOR_HOST_PERMISSION])];
  if (Array.isArray(manifest.content_scripts)) {
    for (const script of manifest.content_scripts) {
      script.matches = [...patterns];
    }
  }
  return manifest;
}

function replaceOnce(source, placeholder, value, fileName) {
  const count = source.split(placeholder).length - 1;
  if (count !== 1) {
    throw new BuildError(`${fileName} must contain ${placeholder} exactly once (found ${count}).`);
  }
  return source.replace(placeholder, () => JSON.stringify(value));
}

/** Pure: puts the site key and collector URL into the service worker source (FR-1.4). */
function injectBuildValues(source, values, fileName = INJECT_INTO) {
  let result = replaceOnce(source, PLACEHOLDERS.siteKey, values.siteKey, fileName);
  result = replaceOnce(result, PLACEHOLDERS.collectorUrl, values.collectorUrl, fileName);
  return result;
}

function readJson(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new BuildError(`Cannot read ${filePath}: ${error.code === 'ENOENT' ? 'file not found' : error.message}.`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new BuildError(`${filePath} is not valid JSON: ${error.message}`);
  }
}

/** Every file the manifest refers to, relative to dist/. */
function manifestFiles(manifest) {
  const files = [];
  if (manifest.background && manifest.background.service_worker) {
    files.push(manifest.background.service_worker);
  }
  for (const script of manifest.content_scripts || []) {
    files.push(...(script.js || []), ...(script.css || []));
  }
  if (manifest.action && manifest.action.default_popup) {
    files.push(manifest.action.default_popup);
  }
  return files;
}

/** Stops with a clear error if a required file is missing from dist/. */
function checkOutput(outDir, manifest) {
  const required = [
    ...manifestFiles(manifest),
    ...SHARED_FILES.map((file) => `shared/${file}`),
  ];
  const missing = [...new Set(required)].filter((file) => !fs.existsSync(path.join(outDir, file)));
  if (missing.length > 0) {
    throw new BuildError(`Build output is missing files the extension needs: ${missing.join(', ')}.`);
  }
}

/**
 * Runs the whole build. Settings are checked before dist/ is touched, so a
 * rejected setting leaves no new dist/. If a later step fails, the incomplete
 * dist/ is deleted so it cannot be loaded by mistake.
 */
function build({ rootDir = path.resolve(__dirname, '..'), outDir } = {}) {
  const distDir = outDir || path.join(rootDir, 'dist');
  const extensionDir = path.join(rootDir, 'extension');
  const sharedDir = path.join(extensionDir, 'shared');

  const config = readJson(path.join(rootDir, 'trailmark.config.json'));
  const template = readJson(path.join(rootDir, 'manifest.template.json'));
  const manifest = createManifest(config, template);

  const sources = [
    ...ROOT_FILES.map((file) => path.join(extensionDir, file)),
    ...SHARED_FILES.map((file) => path.join(sharedDir, file)),
  ];
  const missing = sources.filter((file) => !fs.existsSync(file));
  if (missing.length > 0) {
    throw new BuildError(
      `Missing source files: ${missing.map((file) => path.relative(rootDir, file).split(path.sep).join('/')).join(', ')}.`
    );
  }

  fs.rmSync(distDir, { recursive: true, force: true });
  try {
    fs.mkdirSync(distDir, { recursive: true });
    for (const file of ROOT_FILES) {
      fs.copyFileSync(path.join(extensionDir, file), path.join(distDir, file));
    }
    fs.cpSync(sharedDir, path.join(distDir, 'shared'), { recursive: true });

    const workerPath = path.join(distDir, INJECT_INTO);
    const worker = fs.readFileSync(workerPath, 'utf8');
    fs.writeFileSync(
      workerPath,
      injectBuildValues(worker, { siteKey: config.siteKey, collectorUrl: COLLECTOR_EVENTS_URL })
    );
    fs.writeFileSync(path.join(distDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    checkOutput(distDir, manifest);
  } catch (error) {
    fs.rmSync(distDir, { recursive: true, force: true });
    throw error;
  }
  return { distDir, manifest };
}

if (require.main === module) {
  try {
    const { distDir } = build();
    console.log(`Build complete: ${path.relative(process.cwd(), distDir) || distDir}`);
    console.log('Load it at chrome://extensions with "Load unpacked".');
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  COLLECTOR_ORIGIN,
  COLLECTOR_HOST_PERMISSION,
  COLLECTOR_EVENTS_URL,
  SHARED_FILES,
  BuildError,
  toMatchPattern,
  toMatchPatterns,
  validateConfig,
  createManifest,
  injectBuildValues,
  build,
};
