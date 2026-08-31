#!/usr/bin/env node
// Evaluates a RANK application. A rank is an achievement earned by holding enough
// per-program exam credentials. The Action reads the holder's real credentials from
// the public registry (on GitHub), checks the threshold, and — if met — issues a
// rank credential (serial RNK…). Verified by evidence, not self-declared.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const REGISTRY_DIR = "registry";
const INDEX_JSON = `${REGISTRY_DIR}/index.json`;
const PAGES_BASE = "https://sncfoundation.github.io";

// Ranks, ascending. `min` = number of distinct exam credentials required.
const RANKS = [
  { key: "sheetcadet",     name: "SheetCadet",     emoji: "🚀", min: 1 },
  { key: "sheetastronaut", name: "SheetAstronaut", emoji: "👨‍🚀", min: 3 },
  { key: "sheetcommander", name: "SheetCommander", emoji: "🛰️", min: 6 },
  { key: "sheetadmiral",   name: "SheetAdmiral",   emoji: "🌌", min: 10 },
];

const { ISSUE_NUMBER, HOLDER, ISSUE_URL } = process.env;
if (!ISSUE_NUMBER || !HOLDER) { console.error("Missing ISSUE_NUMBER or HOLDER"); process.exit(1); }
const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const holderLc = HOLDER.toLowerCase();

let index = { certificates: [] };
if (existsSync(INDEX_JSON)) { try { index = JSON.parse(readFileSync(INDEX_JSON, "utf8")); } catch {} }
if (!Array.isArray(index.certificates)) index.certificates = [];

const mine = index.certificates.filter((c) => (c.holder || "").toLowerCase() === holderLc);
const examCreds = mine.filter((c) => c.type !== "rank");                 // per-program exam credentials
const examSerials = examCreds.map((c) => c.serial);
const count = new Set(examCreds.map((c) => c.program_key || c.serial)).size;

// highest rank the holder qualifies for
let earned = null;
for (const r of RANKS) if (count >= r.min) earned = r;

const closeWith = (body, label) => {
  writeFileSync("comment.md", body);
  run(`gh issue comment ${ISSUE_NUMBER} --body-file comment.md`);
  if (label) run(`gh issue edit ${ISSUE_NUMBER} --add-label ${label}`);
  run(`gh issue close ${ISSUE_NUMBER} --reason completed`);
};

if (!earned) {
  closeWith([
    `**Not yet, @${HOLDER}.** You hold **0** exam credentials.`,
    ``,
    `Ranks are earned by passing exams. Start with the`,
    `[Sheeternetes Fundamentals exam](${PAGES_BASE}/certify-sheeternetes.html) — it makes you a 🚀 SheetCadet.`,
    ``,
    `Rank thresholds: ${RANKS.map((r) => `${r.emoji} ${r.name} (${r.min})`).join(" · ")}`,
  ].join("\n"), "duplicate");
  console.log(`Rank: ${HOLDER} has 0 credentials`);
  process.exit(0);
}

// already holds this rank (or higher)?
const heldRankKeys = new Set(mine.filter((c) => c.type === "rank").map((c) => c.rank_key));
const earnedIdx = RANKS.findIndex((r) => r.key === earned.key);
const alreadyHasEqualOrHigher = RANKS.some((r, i) => i >= earnedIdx && heldRankKeys.has(r.key));
if (alreadyHasEqualOrHigher) {
  const held = mine.filter((c) => c.type === "rank").sort((a, b) => a.serial < b.serial ? 1 : -1)[0];
  closeWith([
    `**@${HOLDER} already holds this rank.** ✅`,
    ``,
    `Current rank: ${earned.emoji} **${earned.name}** (\`${held?.serial}\`), on **${count}** exam credentials.`,
    `Pass more exams to reach the next rank. Verify: ${PAGES_BASE}/verify.html?id=${held?.serial}`,
  ].join("\n"), "duplicate");
  console.log(`Rank duplicate: ${HOLDER} already ${earned.key}`);
  process.exit(0);
}

// --- issue the rank credential ------------------------------------------------
const maxSeq = index.certificates.reduce((max, c) => {
  if (!String(c.serial || "").startsWith("RNK")) return max;
  const n = parseInt(String(c.serial).slice(3), 10);
  return Number.isFinite(n) && n > max ? n : max;
}, 0);
const serial = "RNK" + String(maxSeq + 1).padStart(6, "0");
const date = new Date().toISOString().slice(0, 10);

const record = {
  serial, type: "rank",
  rank: earned.name, rank_key: earned.key,
  holder: HOLDER, date,
  program: `Rank: ${earned.name}`,
  credentials: count,
  based_on: examSerials,
  issue: ISSUE_URL,
  issue_number: Number(ISSUE_NUMBER),
};
writeFileSync(`${REGISTRY_DIR}/${serial}.json`, JSON.stringify(record, null, 2) + "\n");
index.certificates.push(record);
index.certificates.sort((a, b) => (a.serial < b.serial ? -1 : a.serial > b.serial ? 1 : 0));
index.count = index.certificates.length;
index.updated = date;
writeFileSync(INDEX_JSON, JSON.stringify(index, null, 2) + "\n");

run(`git config user.name "sheeternetes-bot"`);
run(`git config user.email "actions@users.noreply.github.com"`);
run(`git add ${REGISTRY_DIR}`);
run(`git commit -m "rank: award ${earned.name} to @${HOLDER} (${serial})"`);
try { run(`git pull --rebase origin master`); } catch {}
run(`git push origin HEAD:master`);

closeWith([
  `# ${earned.emoji} Rank awarded: ${earned.name}`,
  ``,
  `@${HOLDER}, the registry confirms you hold **${count}** exam credential${count === 1 ? "" : "s"}:`,
  examSerials.map((s) => `- \`${s}\``).join("\n"),
  ``,
  `You are hereby recognized as ${earned.emoji} **${earned.name}**.`,
  ``,
  `| Field | Value |`,
  `|-------|-------|`,
  `| **Rank ID** | \`${serial}\` |`,
  `| **Rank** | ${earned.name} |`,
  `| **Earned on** | ${count} credentials |`,
  ``,
  `**Verify:** ${PAGES_BASE}/verify.html?id=${serial}`,
  ``,
  `Verified by evidence, not belief. (Belief is also fine.) It reconciles.`,
].join("\n"), "issued");
console.log(`Rank issued ${serial} (${earned.key}) to ${HOLDER} on ${count} creds`);
