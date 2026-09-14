// Exact-line exceptions prevent deprecated compatibility from spreading into product code.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const pattern = /voxa/gi;
const exceptions = JSON.parse(
  fs.readFileSync(path.join(__dirname, "naming-exceptions.json"), "utf8"),
);
const files = [
  ...new Set(
    execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\0")
      .filter(Boolean),
  ),
];
const findings = [],
  failures = [],
  counts = new Map();
for (const file of files) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
  const bytes = fs.readFileSync(absolute);
  if (bytes.includes(0)) continue;
  const lines = bytes.toString().split("\n");
  lines.forEach((context, index) => {
    const matches = context.match(pattern);
    if (!matches) return;
    const hash = createHash("sha256").update(context.trim()).digest("hex");
    const exception = exceptions.find((entry) => entry.file === file && entry.hash === hash);
    const key = `${file}:${hash}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const finding = {
      file,
      line: index + 1,
      occurrences: matches.length,
      context: context.trim(),
      reason: exception?.reason ?? "UNEXPECTED legacy name",
    };
    findings.push(finding);
    if (!exception || counts.get(key) > exception.count) failures.push(finding);
  });
  if (pattern.test(file)) failures.push({ file, reason: "Legacy filename" });
  pattern.lastIndex = 0;
}
for (const exception of exceptions) {
  if ((counts.get(`${exception.file}:${exception.hash}`) ?? 0) !== exception.count)
    failures.push({ file: exception.file, reason: "Stale naming exception: review and remove it" });
}
if (process.argv.includes("--report")) console.log(JSON.stringify(findings, null, 2));
const reportAt = process.argv.indexOf("--report-file");
if (reportAt !== -1) {
  const localFiles = [
    "AGENTS.md",
    "CLAUDE.md",
    "synq/supabase-room-schema.sql",
    "synq/supabase-participant-sync-policies.sql",
  ];
  const local = [];
  for (const file of localFiles) {
    if (!fs.existsSync(path.join(root, file))) continue;
    fs.readFileSync(path.join(root, file), "utf8")
      .split("\n")
      .forEach((context, index) => {
        if (!context.match(pattern)) return;
        local.push({
          file,
          line: index + 1,
          context: context.trim(),
          reason:
            "Ignored local historical memory/schema, not deployable source; restore/audit separately before dormant room rollout",
        });
      });
  }
  fs.writeFileSync(
    process.argv[reportAt + 1],
    JSON.stringify(
      {
        findings,
        ignoredLocalHistory: local,
        scope:
          "Tracked/non-ignored source and known local memory/schema. Private env, vendor, build output and caches excluded. No infrastructure was contacted.",
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  JSON.stringify({
    filesScanned: files.length,
    retainedLines: findings.length,
    retainedOccurrences: findings.reduce((n, f) => n + f.occurrences, 0),
    unexpected: failures.length,
  }),
);
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exitCode = 1;
}
