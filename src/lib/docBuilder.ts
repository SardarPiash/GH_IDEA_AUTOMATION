import { readFileSync } from "fs";
import path from "path";
import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

type InlineNode = TextRun | ExternalHyperlink;

const FONT_NAME = "Noto Sans Bengali";
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

const DOC_FONT = {
  ascii: FONT_NAME,
  hAnsi: FONT_NAME,
  cs: FONT_NAME,
  eastAsia: FONT_NAME,
  hint: "cs" as const,
};

const LANG = { value: "bn-BD", eastAsia: "bn-BD" };

function loadFont(filename: string): Buffer {
  return readFileSync(path.join(FONT_DIR, filename));
}

function normalizeBangla(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200B\u2060]/g, "")
    .replace(/([\u0980-\u09FF])\s+(?=[\u09BC\u09BE-\u09CD\u09D7\u09FE])/g, "$1");
}

function run(
  text: string,
  extras: { bold?: boolean; size?: number; italics?: boolean; style?: string } = {}
) {
  const size = extras.size ?? 22;
  return new TextRun({
    text: normalizeBangla(text),
    font: DOC_FONT,
    size,
    sizeComplexScript: size,
    bold: extras.bold,
    boldComplexScript: extras.bold,
    italics: extras.italics,
    italicsComplexScript: extras.italics,
    style: extras.style,
    language: LANG,
  });
}

function parseInlines(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  const token =
    /(\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(text))) {
    if (match.index > last) {
      nodes.push(run(text.slice(last, match.index)));
    }
    if (match[2]) {
      nodes.push(run(match[2], { bold: true }));
    } else if (match[3] && match[4]) {
      nodes.push(
        new ExternalHyperlink({
          children: [run(match[3], { style: "Hyperlink" })],
          link: match[4],
        })
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    nodes.push(run(text.slice(last)));
  }
  return nodes.length ? nodes : [run(text)];
}

function isTableLine(line: string) {
  return /^\|.+\|$/.test(line.trim());
}

function isTableDivider(line: string) {
  return /^\|[\s:|-]+\|$/.test(line.trim());
}

function tableCells(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cellText) => cellText.trim().replace(/^\*\*|\*\*$/g, ""));
}

function isHeaderRow(cols: string[]) {
  const joined = cols.join(" ").toLowerCase();
  return /^(field|information|ক্ষেত্র|তথ্য)/i.test(cols[0] || "") || joined.includes("information");
}

function tableToParagraphs(rows: string[][]): Paragraph[] {
  const body = rows.filter((cols, index) => {
    if (index === 0 && isHeaderRow(cols)) return false;
    return cols.some((col) => col.trim());
  });

  return body.map((cols) => {
    const label = (cols[0] || "").trim();
    const value = cols.slice(1).join(" ").trim();
    const children: InlineNode[] = [];
    if (label) {
      children.push(...parseInlines(`**${label.replace(/^\*\*|\*\*$/g, "")}:**`));
      if (value) children.push(run(" "));
    }
    if (value) children.push(...parseInlines(value));
    return new Paragraph({
      children: children.length ? children : [run("")],
      spacing: { after: 80 },
    });
  });
}

function heading(text: string, size: number) {
  return new Paragraph({
    spacing: size >= 32 ? { after: 200 } : size >= 26 ? { before: 240, after: 120 } : { before: 160, after: 80 },
    children: [run(text, { bold: true, size })],
  });
}

function markdownToChildren(markdown: string) {
  const lines = normalizeBangla(markdown).replace(/\r\n/g, "\n").split("\n");
  const children: Paragraph[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      children.push(
        new Paragraph({
          border: {
            bottom: { color: "999999", space: 1, style: BorderStyle.SINGLE, size: 12 },
          },
          spacing: { before: 120, after: 200 },
        })
      );
      i += 1;
      continue;
    }

    if (isTableLine(line)) {
      const rows: string[][] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        if (!isTableDivider(lines[i])) rows.push(tableCells(lines[i]));
        i += 1;
      }
      if (rows.length) children.push(...tableToParagraphs(rows));
      continue;
    }

    if (line.startsWith("# ")) {
      children.push(heading(line.slice(2).trim(), 32));
      i += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      children.push(heading(line.slice(3).trim(), 26));
      i += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      children.push(heading(line.slice(4).trim(), 24));
      i += 1;
      continue;
    }

    children.push(
      new Paragraph({
        children: parseInlines(line.trim()),
        spacing: { after: 120 },
      })
    );
    i += 1;
  }

  return children;
}

export async function buildIdeaDocx(
  title: string,
  summary: string,
  _rawSubmission?: string
): Promise<Buffer> {
  const markdown = summary?.trim()
    ? summary
    : `# Idea Proposal: ${title}\n\n${title}`;
  const children = markdownToChildren(markdown);
  const doc = new Document({
    fonts: [
      { name: FONT_NAME, data: loadFont("NotoSansBengali-Regular.ttf") },
      { name: `${FONT_NAME} Bold`, data: loadFont("NotoSansBengali-Bold.ttf") },
    ],
    styles: {
      default: {
        document: {
          run: {
            font: DOC_FONT,
            size: 22,
            language: LANG,
          },
        },
        hyperlink: { run: { font: DOC_FONT, underline: {}, language: LANG } },
      },
    },
    hyphenation: { autoHyphenation: false },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
