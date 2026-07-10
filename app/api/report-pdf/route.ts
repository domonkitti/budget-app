import { NextRequest } from "next/server"
import { chromium, type Page } from "playwright"

export const runtime = "nodejs"

// PowerPoint widescreen slide size at 96 CSS px/inch — must match SLIDE_WIDTH_PX/
// SLIDE_HEIGHT_PX in components/report/ReportView.tsx, since each .page-card-body
// is captured at its live on-screen size and dropped onto exactly one PDF page.
const SLIDE_WIDTH_PX = 1280
const SLIDE_HEIGHT_PX = 720

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

async function generate(req: NextRequest, groupId: string, reportId: string, preset?: string) {
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
    await page.goto(`${req.nextUrl.origin}/report/${groupId}/${reportId}`, { waitUntil: "networkidle" })
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

export async function GET(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get("groupId")
  const reportId = req.nextUrl.searchParams.get("reportId")
  if (!groupId || !reportId) return new Response("Missing groupId or reportId", { status: 400 })
  return generate(req, groupId, reportId)
}

export async function POST(req: NextRequest) {
  const groupId = req.nextUrl.searchParams.get("groupId")
  const reportId = req.nextUrl.searchParams.get("reportId")
  if (!groupId || !reportId) return new Response("Missing groupId or reportId", { status: 400 })
  const body = await req.json().catch(() => ({} as { preset?: string }))
  return generate(req, groupId, reportId, body.preset)
}
