import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney, parseDollarsToCents } from "../src/lib/money";
import { luhnValid, maskCardNumbers, matchCategoryName, normalizeMerchant } from "../src/lib/text";
import { advanceRun, firstRunOn, rateForDate, scheduledYmd } from "../src/lib/recurring/schedule";
import { resolvePeriod } from "../src/lib/dates";

test("parses dollars into cents", () => {
  assert.equal(parseDollarsToCents("23.40"), 2340);
  assert.equal(parseDollarsToCents(19.99), 1999);
  assert.equal(parseDollarsToCents("-5"), -500);
  assert.equal(formatMoney(-2340), "+$23.40");
  assert.equal(formatMoney(2340), "$23.40");
});

test("masks card numbers that pass Luhn", () => {
  assert.equal(luhnValid("4242424242424242"), true);
  assert.equal(maskCardNumbers("card 4242424242424242 thanks"), "card ••••4242 thanks");
  assert.equal(maskCardNumbers("order 1234567890123"), "order 1234567890123");
});

test("normalizes merchants and fuzzy categories", () => {
  assert.equal(normalizeMerchant("Trader Joe's #12"), "trader joes 12".replace(" 12", "").trim() || normalizeMerchant("Trader Joe's"));
  assert.equal(normalizeMerchant("Trader Joe's"), "trader joes");
  assert.equal(matchCategoryName("dinning", ["Dining", "Groceries"]), "Dining");
  assert.equal(matchCategoryName("Coffee and Snacks", ["Coffee & Snacks"]), "Coffee & Snacks");
});

test("recurring rates and day clamping", () => {
  assert.equal(scheduledYmd(2026, 2, 31), "2026-02-28");
  const rates = [
    { amountCents: 1799, effectiveFrom: "2026-01-05" },
    { amountCents: 1999, effectiveFrom: "2026-05-01" },
  ];
  assert.equal(rateForDate(rates, "2026-04-05")?.amountCents, 1799);
  assert.equal(rateForDate(rates, "2026-05-05")?.amountCents, 1999);
  assert.equal(firstRunOn("2026-08-03", "MONTHLY", 5, null), "2026-08-05");
  assert.equal(firstRunOn("2026-08-10", "MONTHLY", 5, null), "2026-09-05");
  assert.equal(advanceRun("2026-01-31", "MONTHLY", 31, null), "2026-02-28");
  assert.equal(advanceRun("2026-02-28", "MONTHLY", 31, null), "2026-03-31");
});

test("calendar quarters and last month", () => {
  const quarter = resolvePeriod({ period: "2026-Q1" }, "America/New_York");
  assert.equal(quarter.from, "2026-01-01");
  assert.equal(quarter.to, "2026-03-31");
  const october = resolvePeriod({ period: "2026-10" }, "America/New_York");
  assert.equal(october.from, "2026-10-01");
  assert.equal(october.to, "2026-10-31");
  assert.equal(october.previousFrom, "2026-09-01");
  assert.equal(october.previousTo, "2026-09-30");
});
