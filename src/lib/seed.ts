import type { PaymentType, TaxTag } from "@prisma/client";

export const SCOPES = [
  "expenses:read",
  "expenses:write",
  "receipts:read",
  "receipts:write",
  "recurring:read",
  "recurring:write",
  "insights:read",
] as const;

export type Scope = (typeof SCOPES)[number];

export const DEFAULT_CATEGORIES: {
  name: string;
  essentialDefault: boolean | null;
  taxTagDefault?: TaxTag;
}[] = [
  { name: "Housing", essentialDefault: true },
  { name: "Utilities", essentialDefault: true },
  { name: "Groceries", essentialDefault: true },
  { name: "Dining", essentialDefault: false },
  { name: "Coffee & Snacks", essentialDefault: false },
  { name: "Transportation", essentialDefault: true },
  { name: "Auto", essentialDefault: true },
  { name: "Subscriptions & Streaming", essentialDefault: false },
  { name: "Software & AI", essentialDefault: false },
  { name: "Trading", essentialDefault: false },
  { name: "Health & Medical", essentialDefault: true },
  { name: "Supplements & Personal Care", essentialDefault: false },
  { name: "Shopping", essentialDefault: false },
  { name: "Gifts", essentialDefault: false },
  { name: "Family Support", essentialDefault: true },
  { name: "Travel", essentialDefault: false },
  { name: "Entertainment & Outings", essentialDefault: false },
  { name: "Taxes", essentialDefault: true, taxTagDefault: "TAX_PAYMENT" },
  { name: "Debt Payments", essentialDefault: true },
  { name: "Other", essentialDefault: null },
];

export const DEFAULT_PAYMENT_METHODS: { name: string; type: PaymentType; last4?: string }[] = [
  { name: "BofA debit", type: "DEBIT", last4: "2392" },
  { name: "Capital One credit", type: "CREDIT", last4: "6602" },
  { name: "Zelle", type: "TRANSFER" },
  { name: "Cash", type: "CASH" },
];

export const DEFAULT_ENTITIES = [
  { name: "Personal", isDefault: true },
  { name: "Galzan VA LLC", isDefault: false },
  { name: "Trading", isDefault: false },
];

export const KEYWORD_RULES: { category: string; words: string[] }[] = [
  { category: "Groceries", words: ["grocery", "groceries", "safeway", "trader joe", "whole foods", "kroger", "aldi", "wegmans", "food lion", "h mart"] },
  { category: "Dining", words: ["restaurant", "dining", "chick-fil-a", "chick fil a", "doordash", "uber eats", "grubhub", "mcdonald", "wendy", "chipotle", "pizza", "sushi", "cafe"] },
  { category: "Coffee & Snacks", words: ["coffee", "starbucks", "dunkin", "snack"] },
  { category: "Subscriptions & Streaming", words: ["netflix", "spotify", "hulu", "disney+", "youtube premium", "hbo", "apple tv"] },
  { category: "Software & AI", words: ["openai", "chatgpt", "anthropic", "claude", "cursor", "github", "vercel", "aws", "google cloud", "domain", "hosting", "vpn"] },
  { category: "Transportation", words: ["uber", "lyft", "metro", "transit", "parking", "shell", "exxon", "gas station"] },
  { category: "Auto", words: ["geico", "progressive", "state farm", "lease", "oil change", "tire", "property tax"] },
  { category: "Utilities", words: ["electric", "dominion", "water bill", "internet", "verizon", "comcast", "xfinity", "utility"] },
  { category: "Housing", words: ["rent", "mortgage", "hoa"] },
  { category: "Health & Medical", words: ["pharmacy", "cvs", "walgreens", "dental", "doctor", "hospital", "medical", "clinic"] },
  { category: "Supplements & Personal Care", words: ["supplement", "vitamin", "barber", "salon", "personal care"] },
  { category: "Trading", words: ["topstep", "prop firm", "tradovate", "ninjatrader", "tradingview", "apex"] },
  { category: "Travel", words: ["airbnb", "hotel", "airline", "flight", "tsa"] },
  { category: "Entertainment & Outings", words: ["movie", "concert", "ticketmaster", "bowling"] },
  { category: "Gifts", words: ["gift"] },
  { category: "Taxes", words: ["irs", "tax payment", "estimated tax"] },
  { category: "Debt Payments", words: ["loan payment", "student loan", "credit card payment"] },
  { category: "Family Support", words: ["family support", "allowance"] },
  { category: "Shopping", words: ["amazon", "target", "walmart", "clothing", "electronics"] },
];

export function keywordCategory(text: string) {
  const hay = text.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.words.some((word) => (word.length <= 3 ? new RegExp(`\\b${word}\\b`, "i").test(hay) : hay.includes(word)))) {
      return rule.category;
    }
  }
  return null;
}

export async function seedUserDefaults(userId: string, db: {
  category: { createMany: (args: { data: unknown[] }) => Promise<unknown> };
  paymentMethod: { createMany: (args: { data: unknown[] }) => Promise<unknown> };
  entity: { createMany: (args: { data: unknown[] }) => Promise<unknown> };
}) {
  await db.category.createMany({
    data: DEFAULT_CATEGORIES.map((category, index) => ({
      userId,
      name: category.name,
      essentialDefault: category.essentialDefault,
      taxTagDefault: category.taxTagDefault ?? null,
      sortOrder: index,
    })),
  });
  await db.paymentMethod.createMany({
    data: DEFAULT_PAYMENT_METHODS.map((method) => ({ userId, ...method })),
  });
  await db.entity.createMany({
    data: DEFAULT_ENTITIES.map((entity) => ({ userId, ...entity })),
  });
}
