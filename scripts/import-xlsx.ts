import { importWorkbook } from "../src/lib/import/xlsx";

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const file = process.argv.slice(2).find((value) => !value.startsWith("--"));
const email = arg("--user");
if (!file || !email) {
  console.error("Usage: pnpm import:xlsx <file> --user <email> [--dry-run] [--create-recurring]");
  process.exit(1);
}

const source: string = file;
const userEmail: string = email;

async function main() {
const report = await importWorkbook(source, {
  email: userEmail,
  dryRun: process.argv.includes("--dry-run"),
  createRecurring: process.argv.includes("--create-recurring"),
});

console.log(`Rows read: ${report.read}`);
console.log(`Imported: ${report.imported}`);
console.log(`Flagged: ${report.flagged}`);
console.log(`Skipped: ${report.skipped}`);
console.log(`Imported + flagged + skipped = ${report.imported + report.flagged + report.skipped}`);
console.log("");
console.log("Tab totals (cents)");
for (const tab of report.tabs) {
  const match = tab.sheetCents === tab.importedCents ? "match" : "diff";
  console.log(`${tab.tab}: sheet ${tab.sheetCents} imported ${tab.importedCents} ${match}`);
}
if (report.unmapped.length) {
  console.log("\nUnmapped categories");
  for (const row of report.unmapped) console.log(`${row.count}\t${row.value}`);
}
if (report.recurring) console.log(`\nRecurring templates: ${report.recurring}`);
}

main();
