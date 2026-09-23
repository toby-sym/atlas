const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  parseVersion,
  readProperties,
  nextBeta,
  updateProperties,
  reserveBeta,
  resolveBuild,
  applyVersion,
} = require("./version.cjs");

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-version-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const origin = path.join(root, "origin.git");
  const repo = path.join(root, "repo");
  git(root, "init", "--bare", origin);
  git(root, "init", "-b", "main", repo);
  git(repo, "config", "user.name", "Version Test");
  git(repo, "config", "user.email", "test@example.invalid");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "config", "tag.gpgSign", "false");
  fs.writeFileSync(
    path.join(repo, "Version.properties"),
    "# Keep this comment\nversion=0.1.0\nbeta=0\n",
  );
  git(repo, "add", ".");
  git(repo, "commit", "-m", "initial");
  git(repo, "remote", "add", "origin", origin);
  git(repo, "push", "origin", "main");
  return { root, repo, origin };
}

test("accepts stable and numbered beta versions and rejects unsafe or malformed input", () => {
  assert.equal(parseVersion("v1.2.3").version, "1.2.3");
  assert.equal(parseVersion("v1.2.3-beta.12").beta, 12);
  for (const value of [
    "main",
    "",
    "1.02.3",
    "1.2",
    "v1.2.3-beta.0",
    "1.2.3-beta.01",
    "v1.2.3; echo bad",
    "1.2.3\nversion=4.5.6",
    "v1.2.3\n",
    "v1.2.3-beta.999999999999999999",
  ]) {
    assert.throws(() => parseVersion(value));
  }
  assert.throws(() => parseVersion("1.2.3-beta.1", true));
});

test("counter is per base version and never reuses an existing tag", () => {
  const current = { version: "0.1.0", beta: 2 };
  assert.equal(nextBeta(current, "", []).version, "0.1.0-beta.3");
  assert.equal(nextBeta(current, "v0.2.0", []).version, "0.2.0-beta.1");
  assert.equal(
    nextBeta(current, "", ["v0.1.0-beta.8", "v0.2.0-beta.20"]).beta,
    9,
  );
  assert.equal(nextBeta(current, "0.2.0", ["v0.2.0-beta.5"]).beta, 6);
});

test("properties validation preserves comments and unrelated settings", () => {
  const text = "# Counter\r\nversion=0.1.0\r\nbeta=9\r\nother=keep\r\n";
  const updated = updateProperties(text, { base: "0.2.0", beta: 1 });
  assert.deepEqual(readProperties(updated), { version: "0.2.0", beta: 1 });
  assert.match(updated, /# Counter/);
  assert.match(updated, /other=keep/);
  for (const invalid of [
    "version=0.1.0",
    "version=bad\nbeta=0",
    "version=0.1.0\nbeta=-1",
    "version=0.1.0\nbeta=0\nbeta=1",
  ]) {
    assert.throws(() => readProperties(invalid));
  }
});

test("beta reservation persists once, all retries reuse the same tag and commit", (t) => {
  const { repo, origin } = fixture(t);
  const first = reserveBeta(repo, "refs/heads/main", "", "101");
  assert.equal(first.version, "0.1.0-beta.1");
  assert.equal(first.prerelease, "true");
  assert.match(git(origin, "show", "main:Version.properties"), /beta=1/);
  assert.equal(git(origin, "rev-parse", `${first.tag}^{commit}`), first.ref);
  const retry = reserveBeta(repo, "refs/heads/main", "", "101");
  assert.deepEqual(retry, first);
  const second = reserveBeta(repo, "refs/heads/main", "", "102");
  assert.equal(second.version, "0.1.0-beta.2");
  assert.match(git(origin, "show", "main:Version.properties"), /beta=2/);
  // Even retrying an older run after a newer reservation must keep its number.
  assert.deepEqual(reserveBeta(repo, "refs/heads/main", "", "101"), first);
  const newVersion = reserveBeta(repo, "refs/heads/main", "v0.2.0", "103");
  assert.equal(newVersion.version, "0.2.0-beta.1");
  assert.match(git(origin, "show", "main:Version.properties"), /version=0.2.0/);
});

test("beta reservation rejects tag dispatch and malicious version input without remote changes", (t) => {
  const { repo, origin } = fixture(t);
  const original = git(origin, "rev-parse", "main");
  assert.throws(
    () => reserveBeta(repo, "refs/tags/v0.1.0", "", "201"),
    /branch/,
  );
  assert.throws(
    () => reserveBeta(repo, "refs/heads/main", "v0.1.0;bad", "202"),
    /Invalid version/,
  );
  assert.equal(git(origin, "rev-parse", "main"), original);
  assert.equal(git(origin, "tag", "--list"), "");
});

test("stable, dev and pushed beta builds do not advance the counter", (t) => {
  const { repo } = fixture(t);
  const source = git(repo, "rev-parse", "HEAD");
  const original = fs.readFileSync(
    path.join(repo, "Version.properties"),
    "utf8",
  );
  const dev = resolveBuild(repo, {
    BUILD_TYPE: "dev",
    GITHUB_RUN_NUMBER: "42",
  });
  assert.equal(dev.version, "0.0.0-42");
  assert.equal(dev.tag, "");
  const stable = resolveBuild(repo, {
    BUILD_TYPE: "release",
    TAG_NAME: "v0.2.0",
  });
  assert.equal(stable.version, "0.2.0");
  assert.equal(stable.prerelease, "false");
  const pushed = resolveBuild(repo, {
    GITHUB_EVENT_NAME: "push",
    GITHUB_REF_NAME: "v0.2.0-beta.3",
  });
  assert.equal(pushed.channel, "beta");
  assert.equal(pushed.version, "0.2.0-beta.3");
  assert.equal(
    fs.readFileSync(path.join(repo, "Version.properties"), "utf8"),
    original,
  );
  assert.equal(git(repo, "rev-parse", "HEAD"), source);
  assert.throws(
    () => resolveBuild(repo, { BUILD_TYPE: "release", TAG_NAME: "" }),
    /Invalid version/,
  );
});

test("rejected push publishes neither counter nor tag and can be retried", (t) => {
  const { repo, origin } = fixture(t);
  const original = git(origin, "rev-parse", "main");
  const hook = path.join(origin, "hooks", "pre-receive");
  fs.writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  assert.throws(() => reserveBeta(repo, "refs/heads/main", "", "301"));
  assert.equal(git(origin, "rev-parse", "main"), original);
  assert.equal(git(origin, "tag", "--list"), "");
  assert.equal(git(repo, "tag", "--list"), "");
  fs.unlinkSync(hook);
  assert.equal(
    reserveBeta(repo, "refs/heads/main", "", "301").version,
    "0.1.0-beta.1",
  );
});

test("manual release of an existing tag uses its tagged source", (t) => {
  const { repo } = fixture(t);
  const tagged = git(repo, "rev-parse", "HEAD");
  git(repo, "tag", "v0.1.0");
  fs.writeFileSync(path.join(repo, "later.txt"), "later work");
  git(repo, "add", ".");
  git(repo, "commit", "-m", "later");
  assert.equal(
    resolveBuild(repo, { BUILD_TYPE: "release", TAG_NAME: "v0.1.0" }).ref,
    tagged,
  );
});

test("beta app metadata keeps full SemVer and provides a numeric WiX version", (t) => {
  const { repo } = fixture(t);
  fs.mkdirSync(path.join(repo, "src-tauri"));
  fs.writeFileSync(
    path.join(repo, "src-tauri", "tauri.conf.json"),
    JSON.stringify({
      version: "0.1.0",
      app: { windows: [{ title: "Atlas" }] },
      bundle: { windows: { wix: { language: "en-US" } } },
    }),
  );
  applyVersion(repo, "0.2.0-beta.7", "beta");
  const config = JSON.parse(
    fs.readFileSync(path.join(repo, "src-tauri", "tauri.conf.json")),
  );
  assert.equal(config.version, "0.2.0-beta.7");
  assert.equal(config.app.windows[0].title, "Atlas 0.2.0-beta.7");
  assert.equal(config.bundle.windows.wix.version, "0.2.0");
  assert.equal(config.bundle.windows.wix.language, "en-US");
});
