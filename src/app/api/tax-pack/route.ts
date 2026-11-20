import { getSession } from "@/lib/auth";
import { todayYmd, yearKey } from "@/lib/dates";
import { taxPackZip } from "@/lib/tax";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Sign in first.", { status: 401 });
  const year = Number(new URL(request.url).searchParams.get("year") ?? yearKey(todayYmd(session.user.timezone)));
  const pack = await taxPackZip(session.user.id, year);
  return new Response(new Uint8Array(pack.bytes), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${pack.filename}"`, "Cache-Control": "private" },
  });
}
