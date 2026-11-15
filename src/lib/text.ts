export function normalizeMerchant(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/\b(inc|llc|ltd|co|corp)\b/g, " ")
    .replace(/#\s*\d+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = Array.from({ length: cols }, (_, i) => i);
  for (let i = 1; i < rows; i++) {
    const next = [i];
    let rowMin = next[0] ?? 0;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min((prev[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      next[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > 1) return 2;
    prev = next;
  }
  return prev[cols - 1] ?? 2;
}

export function matchCategoryName(input: string, names: string[]) {
  const wanted = normalizeLabel(input);
  if (!wanted) return null;
  const exact = names.find((name) => normalizeLabel(name) === wanted);
  if (exact) return exact;
  let best: { name: string; distance: number } | null = null;
  for (const name of names) {
    const distance = levenshtein(wanted, normalizeLabel(name));
    if (distance <= 1 && (!best || distance < best.distance)) best = { name, distance };
  }
  return best?.name ?? null;
}

export function luhnValid(digits: string) {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function maskCardNumbers(notes: string) {
  return notes.replace(/\d{13,19}/g, (run) => (luhnValid(run) ? `••••${run.slice(-4)}` : run));
}

export function canonicalMerchantName(raw: string) {
  const normalized = normalizeMerchant(raw);
  const known: Record<string, string> = {
    "trader joes": "Trader Joe's",
    "traders joes": "Trader Joe's",
    "mamas taste": "Mama's Taste",
    wendys: "Wendy's",
    "five percent online": "Five Percent Online Ltd",
    "five percent online lt": "Five Percent Online Ltd",
    "five percent online ltd": "Five Percent Online Ltd",
    topstep: "Topstep",
  };
  return known[normalized] ?? raw.trim().replace(/\s+/g, " ");
}

export function slugPart(value: string) {
  const clean = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return clean || "receipt";
}
