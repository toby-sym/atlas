// Update every Atlas-owned app version when starting a new release series.
const fs = require("node:fs");
const path = require("node:path");

const VERSION_RE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

function replaceExactly(text, pattern, replacement, label) {
  const globalPattern = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
  );
  const matches = text.match(globalPattern) || [];
  if (matches.length !== 1)
    throw new Error(`${label}: expected one app-version field, found ${matches.length}.`);
  return text.replace(globalPattern, replacement);
}

function update(root, target) {
  if (!VERSION_RE.test(target))
    throw new Error(`Invalid base version "${target}". Use X.Y.Z without leading zeroes.`);

  const files = new Map();
  const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
  const properties = read("Version.properties");
  const current = /^version=(.+)$/m.exec(properties)?.[1];
  if (!current || !VERSION_RE.test(current))
    throw new Error("Version.properties must contain a valid version=X.Y.Z entry.");
  if (current === target) throw new Error(`Atlas is already at ${target}.`);

  const put = (relative, transform) => files.set(relative, transform(read(relative)));
  put("Version.properties", (text) => {
    let result = replaceExactly(text, /^version=.*$/gm, `version=${target}`, "Version.properties");
    result = replaceExactly(result, /^beta=.*$/gm, "beta=0", "Version.properties beta");
    return result;
  });
  put("frontend/package.json", (text) => replaceExactly(
    text, /("version"\s*:\s*")[^"]+("\s*,?)/, `$1${target}$2`, "frontend/package.json",
  ));
  put("frontend/package-lock.json", (text) => {
    let result = replaceExactly(text, /^(\{\r?\n  "name": "frontend",\r?\n  "version": ")[^"]+/, `$1${target}`, "frontend/package-lock.json root");
    const rootPackage = /("": \{\r?\n      "name": "frontend",\r?\n      "version": ")[^"]+/;
    return replaceExactly(result, rootPackage, `$1${target}`, "frontend/package-lock.json package root");
  });
  put("src-tauri/Cargo.toml", (text) => replaceExactly(
    text, /^(version\s*=\s*")[^"]+("\s*)$/m, `$1${target}$2`, "src-tauri/Cargo.toml",
  ));
  put("src-tauri/Cargo.lock", (text) => {
    const atlasPackage = /(\[\[package\]\]\r?\nname = "atlas"\r?\nversion = ")[^"]+/;
    return replaceExactly(text, atlasPackage, `$1${target}`, "src-tauri/Cargo.lock Atlas package");
  });
  put("src-tauri/tauri.conf.json", (text) => {
    let result = replaceExactly(text, /("version"\s*:\s*")[^"]+("\s*,)/, `$1${target}$2`, "Tauri app version");
    return replaceExactly(result, /(\"title\"\s*:\s*\"Atlas )[^\"]+(\")/, `$1${target}$2`, "Tauri window title");
  });
  put("backend/main.py", (text) => replaceExactly(
    text, /(app = FastAPI\(title="Atlas API", version=")[^"]+("\))/,
    `$1${target}$2`, "FastAPI app version",
  ));
  put("frontend/src/App.jsx", (text) => replaceExactly(
    text, /("[0-9]+\.[0-9]+\.[0-9]+-dev")/, `"${target}-dev"`, "frontend dev fallback",
  ));
  put("frontend/src/App.test.js", (text) => replaceExactly(
    text, /("[0-9]+\.[0-9]+\.[0-9]+-dev")/, `"${target}-dev"`, "frontend dev fallback expectation",
  ));
  put("DESKTOP.md", (text) => {
    const escaped = current.replaceAll(".", "\\.");
    const currentVersion = new RegExp(`(?<![0-9.])${escaped}(?![0-9.])`, "g");
    const result = text.replace(currentVersion, target);
    if (result === text) throw new Error("DESKTOP.md: expected current app version examples.");
    return result;
  });

  for (const [relative, content] of files) fs.writeFileSync(path.join(root, relative), content);
  return { current, target, changed: [...files.keys()] };
}

if (require.main === module) {
  try {
    const target = process.argv[2];
    if (!target || process.argv.length !== 3)
      throw new Error("Usage: node scripts/bump-version.cjs X.Y.Z");
    const result = update(process.cwd(), target);
    console.log(`Updated Atlas ${result.current} to ${result.target}; beta counter reset to 0.`);
    for (const file of result.changed) console.log(`  ${file}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { update };
