import { getSession } from "@/lib/auth";
import { forUser } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { contentTypeForUpload, openStored, publicReceipt, saveReceipt } from "@/lib/receipts";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: { code: "unauthorized", message: "Sign in first." } }, { status: 401 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: { code: "validation", message: "Choose a receipt file." } }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return Response.json({ error: { code: "payload_too_large", message: "That file is over the 10 MB limit." } }, { status: 413 });
    const receipt = await saveReceipt(session.user.id, { bytes: Buffer.from(await file.arrayBuffer()), contentType: contentTypeForUpload(file.type, file.name) });
    return Response.json(publicReceipt(receipt));
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    console.error(error);
    return Response.json({ error: { code: "server", message: "The receipt didn't upload." } }, { status: 500 });
  }
}

export async function GET() {
  return new Response("Not found", { status: 404 });
}

export async function streamReceipt(id: string) {
  const session = await getSession();
  if (!session) return new Response("Sign in first.", { status: 401 });
  const db = forUser(session.user.id);
  const receipt = await db.receipt.findFirst({ where: { id } });
  if (!receipt) return new Response("That receipt doesn't exist.", { status: 404 });
  const file = await openStored(receipt.blobPathname, receipt.contentType);
  if (!file) return new Response("That receipt file is gone.", { status: 404 });
  return file;
}
