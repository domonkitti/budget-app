import { NextRequest } from "next/server"
import { chromium, type Page } from "playwright"

export const runtime = "nodejs"

// A4 landscape page at 96 CSS px/inch (297mm x 210mm) — must match SLIDE_WIDTH_PX/
// SLIDE_HEIGHT_PX in components/report/ReportView.tsx, since each .page-card-body
// is captured at its live on-screen size and dropped onto exactly one PDF page.
const SLIDE_WIDTH_PX = 1123
const SLIDE_HEIGHT_PX = 794

async function captureSlides(page: Page): Promise<Buffer[]> {
  const boxes = await page.$$eval(".page-card-body", (els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { top: r.top, left: r.left, width: r.width, height: r.height }
    }),
  )

  const buffers: Buffer[] = []
  for (const box of boxes) {
    const png = await page.screenshot({
      clip: { x: box.left, y: box.top, width: box.width, height: box.height },
    })
    buffers.push(png)
  }
  return buffers
}

async function assemblePdf(page: Page, slides: Buffer[]): Promise<Buffer> {
  const html = `<!DOCTYPE html><html><head><style>
    @page { size: ${SLIDE_WIDTH_PX / 96}in ${SLIDE_HEIGHT_PX / 96}in; margin: 0; }
    html, body { margin: 0; padding: 0; }
    .slide { width: ${SLIDE_WIDTH_PX / 96}in; height: ${SLIDE_HEIGHT_PX / 96}in; box-sizing: border-box; padding-bottom: 0.3in; display: flex; align-items: center; justify-content: center; page-break-after: always; }
    .slide img { max-width: 100%; max-height: 100%; object-fit: contain; }
  </style></head><body>
    ${slides.map((buf) => `<div class="slide"><img src="data:image/png;base64,${buf.toString("base64")}" /></div>`).join("")}
  </body></html>`

  await page.setContent(html)
  await page.emulateMedia({ media: "print" })
  return page.pdf({
    width: `${SLIDE_WIDTH_PX / 96}in`,
    height: `${SLIDE_HEIGHT_PX / 96}in`,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
    printBackground: true,
  })
}

// Playwright runs in this same container/process — it must navigate back to this very server,
// not to whatever origin the inbound request appears to have. req.nextUrl.origin reflects the
// original request's (possibly proxied — ngrok, a reverse proxy, etc.) Host/X-Forwarded-Proto
// headers, which can come back mismatched (e.g. "https://0.0.0.0:3000") and break page.goto.
// Same self-referencing-internal-URL pattern as API_INTERNAL_URL in app/api/v1/[...path]/route.ts.
const SELF_URL = process.env.SELF_URL ?? "http://localhost:3000"

async function generate(groupId: string, reportId: string, preset?: string) {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: SLIDE_WIDTH_PX, height: 4000 } })
    if (preset) {
      await context.addInitScript(
        ({ key, value }) => { window.localStorage.setItem(key, value) },
        { key: `report-preset-${reportId}`, value: preset },
      )
    }

    const page = await context.newPage()
    await page.emulateMedia({ media: "print" })
    await page.goto(`${SELF_URL}/report/${groupId}/${reportId}`, { waitUntil: "networkidle" })
    await page.waitForSelector(".page-card-body")

    const slides = await captureSlides(page)
    const pdf = await assemblePdf(page, slides)

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report-${reportId}.pdf"`,
      },
    })
  } finally {
    await browser.close()
  }
}

// Route handlers otherwise swallow a thrown error into a bare, bodyless 500 — the client then
// has nothing to show the user beyond the status code. Surface the real message instead.
async function safeGenerate(...args: Parameters<typeof generate>) {
  try {
    return await generate(...args)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(message, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get("groupId")
  const reportId = req.nextUrl.searchParams.get("reportId")
  if (!groupId || !reportId) return new Response("Missing groupId or reportId", { status: 400 })
  return safeGenerate(groupId, reportId)
}

export async function POST(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get("groupId")
  const reportId = req.nextUrl.searchParams.get("reportId")
  if (!groupId || !reportId) return new Response("Missing groupId or reportId", { status: 400 })
  const body = await req.json().catch(() => ({} as { preset?: string }))
  return safeGenerate(groupId, reportId, body.preset)
}
