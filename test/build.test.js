'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const {
  COLLECTOR_HOST_PERMISSION,
  COLLECTOR_EVENTS_URL,
  SHARED_FILES,
  BuildError,
  toMatchPattern,
  toMatchPatterns,
  createManifest,
  injectBuildValues,
  build,
} = require('../scripts/build.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const BUILD_SCRIPT = path.join(REPO_ROOT, 'scripts', 'build.js');
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'manifest.template.json'), 'utf8'));

function config(overrides = {}) {
  return {
    name: 'Trailmark Test',
    description: 'Test build',
    version: '1.2.3',
    siteKey: 'tmTestSiteKey_0123-abc',
    allowedDomains: ['example.com'],
    ...overrides,
  };
}

/** Copies the config, template and extension/ into a fresh temporary folder. */
function makeProject(t, configOverrides) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trailmark-build-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(path.join(REPO_ROOT, 'extension'), path.join(dir, 'extension'), { recursive: true });
  fs.copyFileSync(path.join(REPO_ROOT, 'manifest.template.json'), path.join(dir, 'manifest.template.json'));
  fs.writeFileSync(path.join(dir, 'trailmark.config.json'), JSON.stringify(config(configOverrides)));
  return dir;
}

function count(list, value) {
  return list.filter((item) => item === value).length;
}

// ---- allowedDomains validation (mentor decision in #9) ----

test('toMatchPattern accepts the three approved forms and localhost', () => {
  assert.equal(toMatchPattern('example.com'), '*://example.com/*');
  assert.equal(toMatchPattern('*.example.com'), '*://*.example.com/*');
  assert.equal(toMatchPattern('*'), '*://*/*');
  assert.equal(toMatchPattern('localhost'), '*://localhost/*');
  assert.equal(toMatchPattern('shop-1.example.co.uk'), '*://shop-1.example.co.uk/*');
  assert.deepEqual(toMatchPatterns(['*']), ['*://*/*']);
});

const REJECTED = [
  ['https://example.com', /scheme/],
  ['example.com/home', /path/],
  ['example.com:8080', /port/],
  ['ex*mple.com', /"\*" is only allowed/],
  ['shop.*.com', /"\*" is only allowed/],
  ['*example.com', /"\*" is only allowed/],
  ['', /empty/],
  ['Example.com', /lowercase/],
  ['exa mple.com', /not a valid hostname/],
  ['example..com', /not a valid hostname/],
  ['-example.com', /not a valid hostname/],
  ['*.', /not a valid hostname/],
];

for (const [entry, reason] of REJECTED) {
  test(`toMatchPattern rejects ${JSON.stringify(entry)} with an error naming the entry`, () => {
    assert.throws(
      () => toMatchPattern(entry),
      (error) => {
        assert.ok(error instanceof BuildError);
        assert.ok(error.message.includes(JSON.stringify(entry)), error.message);
        assert.match(error.message, reason);
        return true;
      }
    );
  });
}

test('toMatchPatterns rejects an empty list, "*" with other entries, and a non-list', () => {
  assert.throws(() => toMatchPatterns([]), /allowedDomains is empty/);
  assert.throws(() => toMatchPatterns(['*', 'example.com']), /must be the only entry/);
  assert.throws(() => toMatchPatterns('example.com'), /must be a list/);
  assert.throws(() => toMatchPatterns([42]), /must be a string/);
});

test('toMatchPatterns removes duplicate entries', () => {
  assert.deepEqual(toMatchPatterns(['example.com', 'example.com']), ['*://example.com/*']);
});

// ---- createManifest (Issue #4) ----

test('createManifest with a short list adds the collector permission once, never to matches', () => {
  const manifest = createManifest(config({ allowedDomains: ['shop.example.com', '*.example.org'] }), TEMPLATE);

  assert.deepEqual(manifest.host_permissions, [
    '*://shop.example.com/*',
    '*://*.example.org/*',
    COLLECTOR_HOST_PERMISSION,
  ]);
  assert.equal(count(manifest.host_permissions, 'http://localhost:4317/*'), 1);
  for (const script of manifest.content_scripts) {
    assert.deepEqual(script.matches, ['*://shop.example.com/*', '*://*.example.org/*']);
    assert.ok(!script.matches.includes(COLLECTOR_HOST_PERMISSION));
  }
});

test('createManifest with ["*"] still adds the collector permission once', () => {
  const manifest = createManifest(config({ allowedDomains: ['*'] }), TEMPLATE);

  assert.deepEqual(manifest.host_permissions, ['*://*/*', 'http://localhost:4317/*']);
  assert.deepEqual(manifest.content_scripts[0].matches, ['*://*/*']);
});

test('createManifest keeps the allowedDomains entries identical in host_permissions and matches', () => {
  const manifest = createManifest(config({ allowedDomains: ['localhost', 'example.com'] }), TEMPLATE);
  const domainPermissions = manifest.host_permissions.filter((p) => p !== COLLECTOR_HOST_PERMISSION);
  assert.deepEqual(domainPermissions, manifest.content_scripts[0].matches);
});

test('createManifest does not duplicate a collector permission already in the template', () => {
  const template = { ...TEMPLATE, host_permissions: [COLLECTOR_HOST_PERMISSION] };
  const manifest = createManifest(config(), template);
  assert.equal(count(manifest.host_permissions, COLLECTOR_HOST_PERMISSION), 1);
});

test('createManifest fills name, description and version, and does not change the template', () => {
  const before = JSON.stringify(TEMPLATE);
  const manifest = createManifest(config(), TEMPLATE);

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Trailmark Test');
  assert.equal(manifest.description, 'Test build');
  assert.equal(manifest.version, '1.2.3');
  assert.equal(manifest.background.service_worker, 'service-worker.js');
  assert.equal(manifest.background.type, undefined, 'the worker must stay a classic script');
  assert.equal(JSON.stringify(TEMPLATE), before);
});

test('createManifest rejects bad settings', () => {
  assert.throws(() => createManifest(config({ siteKey: 'too-short' }), TEMPLATE), /siteKey/);
  assert.throws(() => createManifest(config({ version: 'v1' }), TEMPLATE), /version/);
  assert.throws(() => createManifest(config({ name: '' }), TEMPLATE), /"name"/);
  assert.throws(() => createManifest(config({ allowedDomains: ['https://x.com'] }), TEMPLATE), /scheme/);
});

// ---- site key injection (FR-1.4) ----

test('injectBuildValues replaces each placeholder with a quoted value', () => {
  const source = "const A = '__TRAILMARK_SITE_KEY__';\nconst B = '__TRAILMARK_COLLECTOR_URL__';\n";
  const result = injectBuildValues(source, { siteKey: 'tmTestSiteKey_0123-abc', collectorUrl: COLLECTOR_EVENTS_URL });
  assert.equal(result, 'const A = "tmTestSiteKey_0123-abc";\nconst B = "http://localhost:4317/events";\n');
});

test('injectBuildValues stops if a placeholder is missing or repeated', () => {
  const values = { siteKey: 'tmTestSiteKey_0123-abc', collectorUrl: COLLECTOR_EVENTS_URL };
  assert.throws(() => injectBuildValues("'__TRAILMARK_COLLECTOR_URL__'", values), /exactly once \(found 0\)/);
  assert.throws(
    () => injectBuildValues("'__TRAILMARK_SITE_KEY__' '__TRAILMARK_SITE_KEY__' '__TRAILMARK_COLLECTOR_URL__'", values),
    /exactly once \(found 2\)/
  );
});

test('no extension source file contains the configured site key', () => {
  const realConfig = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'trailmark.config.json'), 'utf8'));
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  for (const file of walk(path.join(REPO_ROOT, 'extension'))) {
    assert.ok(!fs.readFileSync(file, 'utf8').includes(realConfig.siteKey), `${file} contains the site key`);
  }
});

// ---- build output (Issue #6) ----

test('build writes a complete dist/ with every shared file and manifest file', (t) => {
  const dir = makeProject(t);
  const { distDir, manifest } = build({ rootDir: dir });

  for (const file of SHARED_FILES) {
    assert.ok(fs.existsSync(path.join(distDir, 'shared', file)), `dist/shared/${file} is missing`);
  }
  const referenced = [
    manifest.background.service_worker,
    ...manifest.content_scripts.flatMap((script) => script.js),
    manifest.action.default_popup,
  ];
  for (const file of referenced) {
    assert.ok(fs.existsSync(path.join(distDir, file)), `dist/${file} is missing`);
  }

  const written = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));
  assert.deepEqual(written, manifest);
  assert.ok(written.host_permissions.includes(COLLECTOR_HOST_PERMISSION));

  const worker = fs.readFileSync(path.join(distDir, 'service-worker.js'), 'utf8');
  assert.ok(worker.includes('"tmTestSiteKey_0123-abc"'));
  assert.ok(worker.includes('"http://localhost:4317/events"'));
  assert.ok(!worker.includes('__TRAILMARK_'));
});

test('build deletes files left over from an earlier build', (t) => {
  const dir = makeProject(t);
  const stale = path.join(dir, 'dist', 'old-file.js');
  fs.mkdirSync(path.dirname(stale), { recursive: true });
  fs.writeFileSync(stale, '// stale');

  build({ rootDir: dir });
  assert.ok(!fs.existsSync(stale));
});

test('build stops with a clear error when a shared file is missing', (t) => {
  const dir = makeProject(t);
  fs.rmSync(path.join(dir, 'extension', 'shared', 'serial-queue.js'));

  assert.throws(() => build({ rootDir: dir }), /Missing source files: extension\/shared\/serial-queue\.js/);
  assert.ok(!fs.existsSync(path.join(dir, 'dist')));
});

test('build stops with a clear error when the manifest refers to a file that does not exist', (t) => {
  const dir = makeProject(t);
  const template = structuredClone(TEMPLATE);
  template.content_scripts[0].js.push('shared/not-there.js');
  fs.writeFileSync(path.join(dir, 'manifest.template.json'), JSON.stringify(template));

  assert.throws(() => build({ rootDir: dir }), /missing files the extension needs: shared\/not-there\.js/);
  assert.ok(!fs.existsSync(path.join(dir, 'dist')), 'an incomplete dist/ must be removed');
});

test('npm run build exits with an error and writes no dist/ when an entry is rejected', (t) => {
  const dir = makeProject(t, { allowedDomains: ['https://example.com'] });
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(BUILD_SCRIPT, path.join(dir, 'scripts', 'build.js'));

  const result = spawnSync(process.execPath, [path.join(dir, 'scripts', 'build.js')], { cwd: dir, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Build failed: allowedDomains entry "https:\/\/example\.com" is not valid/);
  assert.ok(!fs.existsSync(path.join(dir, 'dist')));
});

test('the build script succeeds from the command line', (t) => {
  const dir = makeProject(t);
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(BUILD_SCRIPT, path.join(dir, 'scripts', 'build.js'));

  const output = execFileSync(process.execPath, [path.join(dir, 'scripts', 'build.js')], { cwd: dir, encoding: 'utf8' });
  assert.match(output, /Build complete/);
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'manifest.json')));
});
