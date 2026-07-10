export async function exportReportPdf(groupId: string, reportId: string) {
  const preset = localStorage.getItem(`report-preset-${reportId}`)
  const res = await fetch(`/api/report-pdf?groupId=${groupId}&reportId=${reportId}`, {
    method: preset ? 'POST' : 'GET',
    headers: preset ? { 'Content-Type': 'application/json' } : undefined,
    body: preset ? JSON.stringify({ preset }) : undefined,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Export failed (${res.status}): ${body.slice(0, 300)}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `report-${reportId}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
