import { dispatch } from "@/lib/api/dispatch";

type Ctx = { params: Promise<{ path?: string[] }> };

async function run(method: string, request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return dispatch(method, request, path ?? []);
}

export const GET = (request: Request, ctx: Ctx) => run("GET", request, ctx);
export const POST = (request: Request, ctx: Ctx) => run("POST", request, ctx);
export const PATCH = (request: Request, ctx: Ctx) => run("PATCH", request, ctx);
export const DELETE = (request: Request, ctx: Ctx) => run("DELETE", request, ctx);
