const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.join(__dirname, "..");
const textExtensions = new Set([".cjs", ".env", ".js", ".json", ".md", ".ts", ".yml", ".yaml"]);
const privateKeyLiteral = /(?:["']?private(?:Key|_key)[A-Za-z0-9_]*["']?\s*[:=]\s*["'](?:0x)?[0-9a-fA-F]{1,64}["']|(?:^|\n)\s*(?:TRON_)?PRIVATE_KEY\s*=\s*(?:0x)?[0-9a-fA-F]{64}\s*(?:$|\n))/g;

function isTextPath(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  return textExtensions.has(extension) || path.basename(relativePath).startsWith(".env");
}

function containsPrivateKeyLiteral(content) {
  privateKeyLiteral.lastIndex = 0;
  return privateKeyLiteral.test(content);
}

function scanTrackedFiles() {
  const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).split("\0").filter(Boolean);

  const findings = [];
  for (const relativePath of trackedFiles) {
    if (!isTextPath(relativePath)) {
      continue;
    }

    const absolutePath = path.join(repositoryRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }

    if (containsPrivateKeyLiteral(fs.readFileSync(absolutePath, "utf8"))) {
      findings.push(relativePath);
    }
  }

  return findings;
}

function scanHistory() {
  const rows = execFileSync("git", ["rev-list", "--objects", "--all"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim().split(/\r?\n/);

  const objects = new Map();
  for (const row of rows) {
    const separator = row.indexOf(" ");
    if (separator === -1) {
      continue;
    }
    const objectId = row.slice(0, separator);
    const relativePath = row.slice(separator + 1);
    if (isTextPath(relativePath) && !objects.has(objectId)) {
      objects.set(objectId, relativePath);
    }
  }

  const findings = [];
  for (const [objectId, relativePath] of objects) {
    let content;
    try {
      content = execFileSync("git", ["cat-file", "blob", objectId], {
        cwd: repositoryRoot,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      continue;
    }

    if (containsPrivateKeyLiteral(content)) {
      findings.push(relativePath);
    }
  }

  return [...new Set(findings)].sort();
}

const scanFullHistory = process.argv.includes("--history");
const findings = scanFullHistory ? scanHistory() : scanTrackedFiles();
if (findings.length > 0) {
  const scope = scanFullHistory ? "reachable history" : "tracked file(s)";
  throw new Error(`Private-key literal detected in ${scope}: ${findings.join(", ")}`);
}

console.log(scanFullHistory
  ? "No private-key literals found in reachable Git history."
  : "No private-key literals found in tracked text files.");
