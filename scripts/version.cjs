// Shared version resolution for every desktop platform. No package dependencies.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const BASE = "(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)";
const VERSION = new RegExp(`^v?(${BASE})(?:-beta\\.([1-9][0-9]*))?$`);

function parseVersion(value, baseOnly = false) {
  if (typeof value !== "string" || value !== value.trim())
    throw new Error("Invalid version: whitespace is not allowed.");
  const match = VERSION.exec(value);
  if (!match || (baseOnly && match[2])) {
    throw new Error(
      `Invalid version "${value}". Expected vX.Y.Z${baseOnly ? "" : " or vX.Y.Z-beta.N"}.`,
    );
  }
  const beta = match[2] ? Number(match[2]) : 0;
  if (!Number.isSafeInteger(beta))
    throw new Error("Invalid version: beta number is too large.");
  return { base: match[1], beta, version: value.replace(/^v/, "") };
}

function readProperties(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || /^[\s]*[#!]/.test(line)) continue;
    const match = /^\s*([\w.-]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || Object.hasOwn(values, match[1]))
      throw new Error("Invalid or duplicate Version.properties entry.");
    values[match[1]] = match[2];
  }
  parseVersion(values.version || "", true);
  if (
    !/^(0|[1-9][0-9]*)$/.test(values.beta || "") ||
    !Number.isSafeInteger(Number(values.beta))
  ) {
    throw new Error("Version.properties beta must be a non-negative integer.");
  }
  return {
    version: values.version.replace(/^v/, ""),
    beta: Number(values.beta),
  };
}

function nextBeta(properties, requestedBase, tags) {
  const base = parseVersion(requestedBase || properties.version, true).base;
  const previous = tags
    .map((tag) => VERSION.exec(tag))
    .filter((match) => match && match[1] === base && match[2]);
  const beta =
    Math.max(
      properties.version === base ? properties.beta : 0,
      ...previous.map((match) => Number(match[2])),
    ) + 1;
  if (!Number.isSafeInteger(beta))
    throw new Error("Beta counter exceeds the supported integer range.");
  return {
    base,
    beta,
    version: `${base}-beta.${beta}`,
    tag: `v${base}-beta.${beta}`,
  };
}

function updateProperties(text, next) {
  return text
    .replace(/^(\s*version\s*=\s*).*$/m, `$1${next.base}`)
    .replace(/^(\s*beta\s*=\s*).*$/m, `$1${next.beta}`);
}

function git(root, ...args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function reserveBeta(root, branchRef, requestedBase, runId) {
  if (!branchRef.startsWith("refs/heads/"))
    throw new Error("Beta builds must be dispatched from a branch, not a tag.");
  if (!/^[1-9][0-9]*$/.test(runId))
    throw new Error("A numeric workflow run ID is required to reserve a beta.");
  git(root, "check-ref-format", branchRef);
  git(root, "fetch", "origin", "--tags");
  const marker = `atlas-beta-run:${runId}`;
  const tags = git(
    root,
    "for-each-ref",
    "--format=%(refname:short)|%(contents:subject)",
    "refs/tags",
  ).split("\n");
  // An annotated tag records the reservation, including when a later build fails.
  const existing = tags.find((line) => line.split("|")[1] === marker);
  if (existing) {
    const tag = existing.split("|")[0];
    const parsed = parseVersion(tag);
    if (!parsed.beta)
      throw new Error("The existing run reservation is not a beta.");
    return {
      version: parsed.version,
      tag,
      ref: git(root, "rev-parse", `${tag}^{commit}`),
      channel: "beta",
      prerelease: "true",
    };
  }
  // Fetch the branch again under the workflow's reservation lock: a preceding run
  // may have advanced its counter since this workflow was dispatched.
  git(root, "fetch", "origin", branchRef);
  git(root, "checkout", "--detach", "FETCH_HEAD");
  const file = path.join(root, "Version.properties");
  const text = fs.readFileSync(file, "utf8");
  const next = nextBeta(
    readProperties(text),
    requestedBase,
    tags.map((line) => line.split("|")[0]),
  );
  fs.writeFileSync(file, updateProperties(text, next));
  git(root, "add", "--", "Version.properties");
  git(
    root,
    "-c",
    "user.name=github-actions[bot]",
    "-c",
    "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    `chore: reserve ${next.tag}`,
  );
  git(
    root,
    "-c",
    "user.name=github-actions[bot]",
    "-c",
    "user.email=41898282+github-actions[bot]@users.noreply.github.com",
    "-c",
    "tag.gpgSign=false",
    "tag",
    "-a",
    next.tag,
    "-m",
    marker,
  );
  // Neither the counter nor the tag is published unless both updates succeed.
  // A concurrent branch push is rejected normally; never force-push user work.
  try {
    git(
      root,
      "push",
      "--atomic",
      "origin",
      `HEAD:${branchRef}`,
      `refs/tags/${next.tag}`,
    );
  } catch (error) {
    // Do not let a retry mistake an unpushed local tag for a saved reservation.
    git(root, "tag", "-d", next.tag);
    throw error;
  }
  return {
    version: next.version,
    tag: next.tag,
    ref: git(root, "rev-parse", "HEAD"),
    channel: "beta",
    prerelease: "true",
  };
}

function resolveBuild(root, env) {
  const type = env.BUILD_TYPE || (env.GITHUB_EVENT_NAME === "push" ? "release" : "");
  if (type === "beta")
    return reserveBeta(
      root,
      env.GITHUB_REF || "",
      env.TAG_NAME || "",
      env.GITHUB_RUN_ID || "",
    );
  if (type === "dev") {
    if (!/^[1-9][0-9]*$/.test(env.GITHUB_RUN_NUMBER || ""))
      throw new Error("A numeric run number is required.");
    return {
      version: `0.0.0-${env.GITHUB_RUN_NUMBER}`,
      tag: "",
      ref: git(root, "rev-parse", "HEAD"),
      channel: "dev",
      prerelease: "false",
    };
  }
  if (type !== "release") throw new Error(`Unknown build type: ${type}`);
  const tag =
    env.GITHUB_EVENT_NAME === "push" ? env.GITHUB_REF_NAME : env.TAG_NAME;
  const parsed = parseVersion(tag || "");
  // Existing release tags always build their own commit. A new manual tag is
  // created by the release action at the selected source commit.
  let ref = git(root, "rev-parse", "HEAD");
  if (git(root, "tag", "--list", tag))
    ref = git(root, "rev-parse", `refs/tags/${tag}^{commit}`);
  return {
    version: parsed.version,
    tag,
    ref,
    channel: parsed.beta ? "beta" : "release",
    prerelease: parsed.beta ? "true" : "false",
  };
}

function applyVersion(root, version, channel) {
  const parsed =
    channel === "dev"
      ? /^([0-9]+\.[0-9]+\.[0-9]+)-[0-9]+$/.exec(version)
      : null;
  const base = parsed ? parsed[1] : parseVersion(version).base;
  const file = path.join(root, "src-tauri", "tauri.conf.json");
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  config.version = version;
  if (channel === "beta") {
    for (const window of config.app?.windows || [])
      window.title = `Atlas ${version}`;
    // WiX requires a numeric MSI ProductVersion, even though the app and
    // installer filename retain the full beta SemVer.
    config.bundle ||= {};
    config.bundle.windows ||= {};
    config.bundle.windows.wix ||= {};
    config.bundle.windows.wix.version = base;
  }
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

if (require.main === module) {
  try {
    const root = process.cwd();
    if (process.argv[2] === "apply") {
      applyVersion(root, process.env.BUILD_VERSION, process.env.BUILD_CHANNEL);
    } else if (process.argv[2] === "prepare") {
      const result = resolveBuild(root, process.env);
      for (const [key, value] of Object.entries(result)) {
        if (process.env.GITHUB_OUTPUT)
          fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
      }
      console.log(
        `Building ${result.channel}: ${result.version} (${result.ref})`,
      );
      if (process.env.GITHUB_STEP_SUMMARY)
        fs.appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `### Atlas ${result.version}\n\nChannel: **${result.channel}**\n\nTag: ${result.tag || "none (artifact only)"}\n\nSource: \`${result.ref}\`\n`,
        );
    } else throw new Error("Usage: node scripts/version.cjs prepare|apply");
  } catch (error) {
    console.error(error.message);
    if (error.stderr) console.error(String(error.stderr));
    process.exitCode = 1;
  }
}

module.exports = {
  parseVersion,
  readProperties,
  nextBeta,
  updateProperties,
  reserveBeta,
  resolveBuild,
  applyVersion,
};
