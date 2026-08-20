import { readFileSync } from "fs";
import path from "path";
import { markdownToHtml } from "@/lib/markdownHtml";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

function fontDataUrl(filename: string) {
  const buf = readFileSync(path.join(FONT_DIR, filename));
  return `data:font/ttf;base64,${buf.toString("base64")}`;
}

const BENGALI_RANGE =
  "U+0980-09FF,U+09E6-09EF,U+200C,U+200D,U+25CC";

function docStyles() {
  const regular = fontDataUrl("NotoSansBengali-Regular.ttf");
  const bold = fontDataUrl("NotoSansBengali-Bold.ttf");

  return `
@font-face {
  font-family: "Doc Bengali";
  src: url("${regular}") format("truetype");
  font-weight: 400;
  font-style: normal;
  unicode-range: ${BENGALI_RANGE};
}
@font-face {
  font-family: "Doc Bengali";
  src: url("${bold}") format("truetype");
  font-weight: 700;
  font-style: normal;
  unicode-range: ${BENGALI_RANGE};
}
* { box-sizing: border-box; }
body {
  margin: 0;
  color: #0f172a;
  font-family: "Doc Bengali", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 15px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
.doc-paper {
  max-width: 760px;
  margin: 0 auto;
  background: #fff;
  padding: 48px 56px 64px;
}
.doc-meta {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 28px;
}
.doc-body h1 {
  font-size: 26px;
  margin: 0 0 18px;
  letter-spacing: -0.03em;
  font-weight: 700;
}
.doc-body h2 {
  font-size: 18px;
  margin: 28px 0 10px;
  font-weight: 700;
}
.doc-body h3 {
  font-size: 16px;
  margin: 22px 0 8px;
  font-weight: 700;
}
.doc-body p {
  margin: 0 0 12px;
  line-height: 1.65;
  font-size: 15px;
}
.doc-body hr {
  border: none;
  border-top: 1px solid #e2e8f0;
  margin: 24px 0;
}
.doc-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 16px;
  font-size: 14px;
}
.doc-body th,
.doc-body td {
  border: 1px solid #e2e8f0;
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
.doc-body th {
  background: #f8fafc;
  font-weight: 700;
}
.doc-body a {
  color: #1e3a8a;
}
.doc-body strong {
  font-weight: 700;
}
`;
}

export function buildIdeaDocumentHtml({
  markdown,
  meta,
  title,
}: {
  markdown: string;
  meta?: string;
  title?: string;
}): string {
  const bodyHtml = markdownToHtml(markdown);
  const metaBlock = meta ? `<div class="doc-meta">${meta}</div>` : "";
  const pageTitle = (title || "Idea proposal").trim();

  return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${pageTitle
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")}</title>
  <style>${docStyles()}</style>
</head>
<body>
  <article class="doc-paper">
    ${metaBlock}
    <div class="doc-body">${bodyHtml}</div>
  </article>
</body>
</html>`;
}
