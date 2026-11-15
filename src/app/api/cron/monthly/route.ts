import { monthly } from "@/app/api/cron/recurring/route";

export async function GET(request: Request) {
  return monthly(request);
}

export async function POST(request: Request) {
  return monthly(request);
}
