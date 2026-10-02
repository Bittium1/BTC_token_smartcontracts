const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.join(__dirname, "..");
const textExtensions = new Set([".cjs", ".env", ".js", ".json", ".md", ".ts", ".yml", ".yaml"]);
const privateKeyLiteral = /(?:["']?private(?:Key|_key)[A-Za-z0-9_]*["']?\s*[:=]\s*["'](?:0x)?[0-9a-fA-F]{1,64}["']|(?:^|\n)\s*(?:TRON_)?PRIVATE_KEY\s*=\s*(?:0x)?[0-9a-fA-F]{64}\s*(?:$|\n))/g;

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).split("\0").filter(Boolean);

const findings = [];
for (const relativePath of trackedFiles) {
  const extension = path.extname(relativePath).toLowerCase();
  if (!textExtensions.has(extension) && !path.basename(relativePath).startsWith(".env")) {
    continue;
  }

  const absolutePath = path.join(repositoryRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    continue;
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  privateKeyLiteral.lastIndex = 0;
  if (privateKeyLiteral.test(content)) {
    findings.push(relativePath);
  }
}

if (findings.length > 0) {
  throw new Error(`Private-key literal detected in tracked file(s): ${findings.join(", ")}`);
}

console.log("No private-key literals found in tracked text files.");
