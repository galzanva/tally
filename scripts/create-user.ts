import { prisma, forUser } from "../src/lib/db";
import { hash } from "@node-rs/argon2";
import { DEFAULT_CATEGORIES, DEFAULT_ENTITIES, DEFAULT_PAYMENT_METHODS } from "../src/lib/seed";

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const email = (arg("--email") ?? process.env.USER_EMAIL ?? "").trim().toLowerCase();
const password = arg("--password") ?? process.env.USER_PASSWORD ?? "";
const name = arg("--name") ?? "G";

if (!email || !email.includes("@") || password.length < 10) {
  console.error("Usage: pnpm user:create -- --email you@example.com --password 'at-least-10' --name G");
  process.exit(1);
}

async function main() {
const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  console.error(`A user already exists for ${email}.`);
  process.exit(1);
}

const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
const user = await prisma.user.create({ data: { email, passwordHash, name } });
const db = forUser(user.id);
await db.category.createMany({
  data: DEFAULT_CATEGORIES.map((category, index) => ({
    name: category.name,
    essentialDefault: category.essentialDefault,
    taxTagDefault: category.taxTagDefault ?? null,
    sortOrder: index,
  })),
});
await db.paymentMethod.createMany({ data: DEFAULT_PAYMENT_METHODS.map((method) => ({ ...method })) });
await db.entity.createMany({ data: DEFAULT_ENTITIES.map((entity) => ({ ...entity })) });
console.log(`Created ${email} (${user.id}) with categories, payment methods, and entities.`);
}

main();
