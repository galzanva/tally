import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

async function main() {
  const root = path.join(process.cwd(), "src", "app");
  const files = await walk(root);
  const bad: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const stripped = text.replace(/import type[\s\S]*?from\s+["'][^"']+["'];?/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    if (/new PrismaClient|\bprisma\.|import\s*\{[^}]*\bprisma\b|from ["']@prisma\/client["']/.test(stripped)) bad.push(path.relative(process.cwd(), file));
  }
  if (bad.length) {
    console.error("Owned data in src/app must go through db.forUser in lib, not Prisma directly:");
    for (const file of bad) console.error(` - ${file}`);
    process.exit(1);
  }
  console.log("Scope check passed.");
}

main();
