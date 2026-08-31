#!/usr/bin/env node
// Issues a sequential SNCF credential from a `certification` issue.
// Multi-program: each program has its own serial prefix and its own running counter,
// all recorded in one shared registry. Serial = <PREFIX> + 6-digit zero-padded seq.
// The registry lives in registry/ so it is browsable on GitHub *and* served on Pages.
// Serialized by the workflow `concurrency` group, so the counters are race-free.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const REGISTRY_DIR = "registry";
const INDEX_JSON = `${REGISTRY_DIR}/index.json`;
const INDEX_MD = `${REGISTRY_DIR}/index.md`;
const PAGES_BASE = "https://sncfoundation.github.io";

// Certification programs. Key must match the exam page's `program` prefill value.
const PROGRAMS = {
  "sheeternetes":            { prefix: "SFE", name: "Certified Sheeternetes Fundamentals Engineer (CSFE)", rank: "SheetCadet" },
  "sheetlux-cd":             { prefix: "SLX", name: "Certified Sheet-Native Delivery Engineer (Sheetlux CD)", rank: "SheetCadet" },
  "sheetlium":               { prefix: "SLM", name: "Certified Sheet-Native Networking Engineer (Sheetlium)", rank: "SheetCadet" },
  "sheetstor":               { prefix: "STO", name: "Certified Sheet-Native Storage Engineer (Sheetstor)", rank: "SheetCadet" },
  "sheethub":                { prefix: "SHB", name: "Certified Sheet-Native Platform Engineer (SheetHub)", rank: "SheetCadet" },
  "sheetos":                 { prefix: "SOS", name: "Certified Sheet-Native OS Engineer (SheetOS)", rank: "SheetCadet" },
  "sheetmesh":               { prefix: "SMH", name: "Certified Sheet-Native Mesh Engineer (Sheetmesh)", rank: "SheetCadet" },
  "sheetelligence":          { prefix: "SEL", name: "Certified Sheet-Native AI Engineer (Sheetelligence)", rank: "SheetCadet" },
  "sheetaiops":              { prefix: "SAO", name: "Certified Sheet-Native AIOps Engineer (SheetAIOps)", rank: "SheetCadet" },
  "sheetassembly":           { prefix: "SAS", name: "Certified Sheet-Native WebAssembly Engineer (SheetAssembly)", rank: "SheetCadet" },
  "skctl-wasm":              { prefix: "SKW", name: "Certified Sheet-Native WASM CLI Engineer (skctl-wasm)", rank: "SheetCadet" },
  "sheetfinops":             { prefix: "SFO", name: "Certified Sheet-Native FinOps Engineer (SheetFinOps)", rank: "SheetCadet" },
  "cloud-connectors":        { prefix: "SCC", name: "Certified Sheet-Native Cloud Connector Engineer (Cloud connectors)", rank: "SheetCadet" },
  "sheeternetes-powershell": { prefix: "SPS", name: "Certified Sheet-Native PowerShell Engineer", rank: "SheetCadet" },
  "sheeternetes-lisp":       { prefix: "SLP", name: "Certified Sheet-Native Lisp Engineer", rank: "SheetCadet" },
  "sheeternetes-brainfuck":  { prefix: "SBF", name: "Certified Sheet-Native Brainfuck Engineer", rank: "SheetCadet" },
};
const DEFAULT_PROGRAM = "sheeternetes";

const { ISSUE_NUMBER, HOLDER, ISSUE_URL, ISSUE_BODY = "", RELEASE_TAG = "" } = process.env;
if (!ISSUE_NUMBER || !HOLDER) { console.error("Missing ISSUE_NUMBER or HOLDER"); process.exit(1); }

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

// --- parse issue-form fields --------------------------------------------------
function parseField(body, label) {
  const m = body.match(new RegExp(`#+\\s*${label}\\s*\\n+([^\\n]+)`, "i"));
  if (!m) return "";
  const v = m[1].trim();
  return /^_no response_$/i.test(v) ? "" : v;
}
const score = parseField(ISSUE_BODY, "Exam score").slice(0, 20);
let programKey = parseField(ISSUE_BODY, "Program").toLowerCase().trim();
if (!PROGRAMS[programKey]) programKey = DEFAULT_PROGRAM;
const prog = PROGRAMS[programKey];

// --- load registry ------------------------------------------------------------
let index = { certificates: [] };
if (existsSync(INDEX_JSON)) {
  try { index = JSON.parse(readFileSync(INDEX_JSON, "utf8")); } catch { index = { certificates: [] }; }
}
if (!Array.isArray(index.certificates)) index.certificates = [];

const holderLc = HOLDER.toLowerCase();
const inProgram = (c) => String(c.serial || "").startsWith(prog.prefix);

// --- idempotency: one credential per (account, program) -----------------------
const existing = index.certificates.find((c) => (c.holder || "").toLowerCase() === holderLc && inProgram(c));
if (existing) {
  const verify = `${PAGES_BASE}/verify.html?id=${existing.serial}`;
  writeFileSync("comment.md", [
    `**@${HOLDER} already holds this credential.** ✅`,
    ``,
    `Program: **${prog.name}**`,
    `Credential ID: \`${existing.serial}\` — issued ${existing.date}.`,
    `One account gets one credential per program. Verify: ${verify}`,
    ``,
    `_The Spreadsheet does not reconcile duplicates._`,
  ].join("\n"));
  run(`gh issue comment ${ISSUE_NUMBER} --body-file comment.md`);
  run(`gh issue edit ${ISSUE_NUMBER} --add-label duplicate`);
  run(`gh issue close ${ISSUE_NUMBER} --reason completed`);
  console.log(`Duplicate: ${HOLDER} already holds ${existing.serial} (${programKey})`);
  process.exit(0);
}

// --- assign next sequential serial within this program ------------------------
const maxSeq = index.certificates.reduce((max, c) => {
  if (!inProgram(c)) return max;
  const n = parseInt(String(c.serial).slice(prog.prefix.length), 10);
  return Number.isFinite(n) && n > max ? n : max;
}, 0);
const seq = maxSeq + 1;
const serial = prog.prefix + String(seq).padStart(6, "0");
const date = new Date().toISOString().slice(0, 10); // UTC, runners are UTC

const record = {
  serial, seq, holder: HOLDER, date, score,
  program: prog.name,
  program_key: programKey,
  release: RELEASE_TAG || null,
  issue: ISSUE_URL,
  issue_number: Number(ISSUE_NUMBER),
};

// --- write per-certificate file + update index --------------------------------
writeFileSync(`${REGISTRY_DIR}/${serial}.json`, JSON.stringify(record, null, 2) + "\n");
index.certificates.push(record);
index.certificates.sort((a, b) => (a.serial < b.serial ? -1 : a.serial > b.serial ? 1 : 0));
index.count = index.certificates.length;
index.updated = date;
writeFileSync(INDEX_JSON, JSON.stringify(index, null, 2) + "\n");

// --- regenerate the human-readable table --------------------------------------
const rows = index.certificates
  .map((c) => `| \`${c.serial}\` | [@${c.holder}](https://github.com/${c.holder}) | ${c.program || "CSFE"} | ${c.date} | ${c.score || "—"} | [#${c.issue_number}](${c.issue}) |`)
  .join("\n");
writeFileSync(INDEX_MD, `# SNCF Certificate Registry

The public, tamper-evident registry of everyone certified by the
**Sheet-Native Computing Foundation**.

- **${index.certificates.length}** credentials issued to date, across ${Object.keys(PROGRAMS).length} programs.
- Verify a holder here or at [${PAGES_BASE}/verify.html](${PAGES_BASE}/verify.html).
- Each credential is a JSON file in this folder and a row below. Serials are assigned by an
  automated workflow, per program (SFE / SLX / SLM …) — they cannot be self-minted.

| Serial | Holder | Program | Issued | Score | Request |
|--------|--------|---------|--------|-------|---------|
${rows}
`);

// --- commit & push (serialized by workflow concurrency group) -----------------
run(`git config user.name "sheeternetes-bot"`);
run(`git config user.email "actions@users.noreply.github.com"`);
run(`git add ${REGISTRY_DIR}`);
run(`git commit -m "cert: issue ${serial} to @${HOLDER} (${programKey})"`);
try { run(`git pull --rebase origin master`); } catch { /* nothing to rebase */ }
run(`git push origin HEAD:master`);

// --- notify the requester and close ------------------------------------------
const verify = `${PAGES_BASE}/verify.html?id=${serial}`;
writeFileSync("comment.md", [
  `# 🎉 Certified. Welcome to the Spreadsheet, @${HOLDER}.`,
  ``,
  `You are now a **${prog.name}** — rank 🚀 **${prog.rank}**.`,
  ``,
  `| Field | Value |`,
  `|-------|-------|`,
  `| **Credential ID** | \`${serial}\` |`,
  `| **Program** | ${prog.name} |`,
  `| **Holder** | @${HOLDER} |`,
  `| **Issued** | ${date} |`,
  `| **Score** | ${score || "—"} |`,
  ``,
  `**Verify / download your certificate:** ${verify}`,
  ``,
  `Your entry is now permanently recorded in the [public registry](${PAGES_BASE}/registry/). It reconciles.`,
].join("\n"));
run(`gh issue comment ${ISSUE_NUMBER} --body-file comment.md`);
run(`gh issue edit ${ISSUE_NUMBER} --add-label issued`);
run(`gh issue close ${ISSUE_NUMBER} --reason completed`);

console.log(`Issued ${serial} to ${HOLDER} (${programKey})`);
