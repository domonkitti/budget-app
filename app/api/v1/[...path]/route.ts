import { NextRequest, NextResponse } from "next/server"

const UPSTREAM = (process.env.API_INTERNAL_URL ?? "http://localhost:8080") + "/api/v1"

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const url = `${UPSTREAM}/${path.join("/")}${req.nextUrl.search}`
  const init: RequestInit = { method: req.method }
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text()
    init.headers = { "content-type": req.headers.get("content-type") ?? "application/json" }
  }
  const upstream = await fetch(url, init)
  const body = upstream.status === 204 ? null : await upstream.text()
  return new NextResponse(body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  })
}

type Ctx = { params: Promise<{ path: string[] }> }

export async function GET(req: NextRequest, ctx: Ctx) { return proxy(req, (await ctx.params).path) }
export async function POST(req: NextRequest, ctx: Ctx) { return proxy(req, (await ctx.params).path) }
export async function PUT(req: NextRequest, ctx: Ctx) { return proxy(req, (await ctx.params).path) }
export async function PATCH(req: NextRequest, ctx: Ctx) { return proxy(req, (await ctx.params).path) }
export async function DELETE(req: NextRequest, ctx: Ctx) { return proxy(req, (await ctx.params).path) }
