import { streamReceipt } from "@/app/api/receipts/route";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return streamReceipt(id);
}
