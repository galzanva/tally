import assert from "node:assert/strict";
import test from "node:test";
import { formatMoney, parseDollarsToCents } from "../src/lib/money";
import { luhnValid, maskCardNumbers, matchCategoryName, normalizeMerchant } from "../src/lib/text";
import { planRecurring, type RecurringCharge } from "../src/lib/recurring/plan";
import { monthStillAhead } from "../src/lib/recurring";
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

test("this month's bar counts automatic bills still ahead", () => {
  const bill = (day: number, autoPost: boolean, frequency: "MONTHLY" | "YEARLY" = "MONTHLY", monthOfYear: number | null = null) => ({
    status: "ACTIVE",
    autoPost,
    frequency,
    dayOfMonth: day,
    monthOfYear,
    startOn: "2026-01-01",
    endOn: null,
    amountCents: 1000,
    rates: [{ amountCents: 1000, effectiveFrom: "2026-01-01" }],
  });
  const variable = {
    ...bill(21, false),
    amountCents: 5000,
    rates: [
      { amountCents: 5000, effectiveFrom: "2026-01-09" },
      { amountCents: 6819, effectiveFrom: "2026-10-09" },
    ],
  };
  const result = monthStillAhead([bill(6, true), bill(20, true), bill(25, false), bill(20, true, "YEARLY", 2), variable], "2026-11-17");
  assert.equal(result.confirmed.monthCents, 2000);
  assert.equal(result.confirmed.leftCents, 1000);
  assert.equal(result.confirmed.leftCount, 1);
  assert.equal(result.estimated.leftCents, 1000 + 6819);
  assert.equal(result.estimated.leftCount, 2);
  assert.equal(result.leftCents, 1000 + 1000 + 6819);
  assert.equal(result.pastCents, result.monthCents - result.leftCents);
});

test("recurring plans follow recent charges", () => {
  const charge = (occurredOn: string, amountCents: number, merchantName: string, description: string, categoryName: string): RecurringCharge => ({
    occurredOn,
    amountCents,
    description,
    merchantName,
    merchantKey: merchantName.toLowerCase(),
    categoryId: categoryName,
    categoryName,
    entityId: "personal",
    entityName: "Personal",
    paymentMethodId: null,
    essential: true,
  });
  const plans = planRecurring(
    [
      charge("2026-01-05", 1799, "Netflix", "Streaming", "Subscriptions & Streaming"),
      charge("2026-05-05", 1999, "Netflix", "Streaming", "Subscriptions & Streaming"),
      charge("2026-09-05", 1999, "Netflix", "Streaming", "Subscriptions & Streaming"),
      charge("2026-10-05", 1999, "Netflix", "Streaming", "Subscriptions & Streaming"),
      charge("2026-05-10", 34423, "Upstart", "Loan payment", "Debt Payments"),
      charge("2026-06-10", 34423, "Upstart", "Loan payment", "Debt Payments"),
      charge("2026-08-10", 34423, "Upstart", "Loan payment", "Debt Payments"),
      charge("2026-08-29", 37962, "Tesla Finance", "Tesla lease", "Auto"),
      charge("2026-09-29", 37962, "Tesla Finance", "Tesla lease", "Auto"),
      charge("2026-10-29", 37962, "Tesla Finance", "Tesla lease", "Auto"),
      charge("2026-09-02", 203290, "Bilt", "Rent payment", "Housing"),
      charge("2026-10-01", 201583, "Bilt", "Rent payment", "Housing"),
      charge("2026-11-02", 201519, "Bilt", "Rent payment", "Housing"),
      charge("2026-01-12", 2999, "ESPN", "ESPN subscription", "Subscriptions & Streaming"),
      charge("2026-04-10", 1199, "ESPN", "ESPN subscription", "Subscriptions & Streaming"),
    ],
    "2026-11-15",
  );
  const netflix = plans.find((plan) => plan.name === "Netflix");
  assert.equal(netflix?.status, "ACTIVE");
  assert.equal(netflix?.amountType, "FIXED");
  assert.equal(netflix?.rates.at(-1)?.amountCents, 1999);
  assert.equal(netflix?.rates.some((rate) => rate.amountCents === 1799), true);
  const upstart = plans.find((plan) => plan.merchantName === "Upstart");
  assert.equal(upstart?.status, "ACTIVE");
  assert.equal(upstart?.rates.length, 3);
  const lease = plans.find((plan) => plan.name === "Tesla lease");
  assert.equal(lease?.status, "ACTIVE");
  assert.equal(lease?.amountType, "FIXED");
  assert.equal(lease?.rates.length, 3);
  assert.equal(lease?.rates.at(-1)?.amountCents, 37962);
  const rent = plans.find((plan) => plan.name === "Rent");
  assert.equal(rent?.amountType, "VARIABLE");
  assert.equal(rent?.rates.at(-1)?.amountCents, 201519);
  const espn = plans.find((plan) => plan.name === "ESPN");
  assert.equal(espn?.status, "ENDED");
  assert.deepEqual(espn?.rates.map((rate) => rate.amountCents), [2999, 1199]);
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
