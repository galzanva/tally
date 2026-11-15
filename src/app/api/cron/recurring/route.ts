import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { runDailyJobs, runMonthlyReviews } from "@/lib/maintenance";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "unauthorized", message: "That cron secret doesn't match." } }, { status: 401 });
  }
  return null;
}

export async function GET(request: Request) {
  const denied = authorized(request);
  if (denied) return denied;
  try {
    const result = await runDailyJobs();
    return NextResponse.json({ data: result, warnings: [] });
  } catch (error) {
    const message = error instanceof AppError ? error.message : "The daily job failed.";
    return NextResponse.json({ error: { code: "server", message } }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}

export async function monthly(request: Request) {
  const denied = authorized(request);
  if (denied) return denied;
  const results = await runMonthlyReviews();
  return NextResponse.json({ data: results, warnings: [] });
}
