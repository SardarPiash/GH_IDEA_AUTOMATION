import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

type InlineNode = TextRun | ExternalHyperlink;

// Nirmala UI covers Latin + Bengali. Calibri/default Word fonts do not,
// which is why Bangla was rendering as empty boxes.
const DOC_FONT = {
  ascii: "Nirmala UI",
  hAnsi: "Nirmala UI",
  cs: "Nirmala UI",
  eastAsia: "Nirmala UI",
  hint: "cs" as const,
};

const thinBorder = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: "CCCCCC",
};

function run(
  text: string,
  extras: { bold?: boolean; size?: number; italics?: boolean; style?: string } = {}
) {
  return new TextRun({
    text,
    font: DOC_FONT,
    size: extras.size ?? 22,
    bold: extras.bold,
    italics: extras.italics,
    style: extras.style,
  });
}

function cell(text: string, bold = false) {
  return new TableCell({
    width: { size: bold ? 30 : 70, type: WidthType.PERCENTAGE },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    borders: {
      top: thinBorder,
      bottom: thinBorder,
      left: thinBorder,
      right: thinBorder,
    },
    children: [
      new Paragraph({
        children: [run(text, { bold, size: 20 })],
      }),
    ],
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

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel], size: number) {
  return new Paragraph({
    heading: level,
    spacing: level === HeadingLevel.HEADING_1
      ? { after: 200 }
      : level === HeadingLevel.HEADING_2
        ? { before: 240, after: 120 }
        : { before: 160, after: 80 },
    children: [run(text, { bold: true, size })],
  });
}

function markdownToChildren(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const children: Array<Paragraph | Table> = [];
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
      if (rows.length) {
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: rows.map(
              (cols, rowIndex) =>
                new TableRow({
                  children: cols.map((col, colIndex) =>
                    cell(col, rowIndex === 0 || colIndex === 0)
                  ),
                })
            ),
          })
        );
      }
      continue;
    }

    if (line.startsWith("# ")) {
      children.push(heading(line.slice(2).trim(), HeadingLevel.HEADING_1, 32));
      i += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      children.push(heading(line.slice(3).trim(), HeadingLevel.HEADING_2, 26));
      i += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      children.push(heading(line.slice(4).trim(), HeadingLevel.HEADING_3, 24));
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
    styles: {
      default: {
        document: {
          run: {
            font: DOC_FONT,
            size: 22,
          },
        },
        heading1: { run: { font: DOC_FONT, size: 32, bold: true } },
        heading2: { run: { font: DOC_FONT, size: 26, bold: true } },
        heading3: { run: { font: DOC_FONT, size: 24, bold: true } },
        hyperlink: { run: { font: DOC_FONT, underline: {} } },
      },
    },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
