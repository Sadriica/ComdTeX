// A tiny valid PDF (ASCII only, so it survives the fake vault's text storage):
// `pages` US-letter pages with a heading, a few lines of body text and a rule.

export function tinyPdf(pages = 2): string {
  const objects: string[] = []
  const add = (body: string) => objects.push(body)
  const pageIds: number[] = []
  // 1 catalog, 2 pages root, 3 font, then (page, content) pairs.
  add("<< /Type /Catalog /Pages 2 0 R >>")
  add("") // patched below once the page ids are known
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>")
  for (let i = 0; i < pages; i++) {
    const pageId = objects.length + 1
    const contentId = pageId + 1
    pageIds.push(pageId)
    const lines = [
      "BT /F1 22 Tf 72 700 Td (Spectral gaps and mixing times) Tj ET",
      "BT /F1 12 Tf 72 670 Td (Page " +
        (i + 1) +
        ": the spectral gap controls the mixing time.) Tj ET",
      "BT /F1 12 Tf 72 652 Td (A graph with a large gap is a good expander.) Tj ET",
      "72 640 m 540 640 l S",
      "BT /F1 12 Tf 72 620 Td (See the Cheeger inequality for the converse direction.) Tj ET",
    ].join("\n")
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    )
    add(`<< /Length ${lines.length} >>\nstream\n${lines}\nendstream`)
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages} >>`
  let out = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return out
}
