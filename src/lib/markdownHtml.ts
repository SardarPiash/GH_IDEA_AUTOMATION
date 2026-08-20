function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInlines(text: string) {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
    );
}

function stripInlines(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .trim();
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
    .map((cell) => cell.trim().replace(/^\*\*|\*\*$/g, ""));
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      html.push("<hr />");
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
        const body = rows
          .map((cols, rowIndex) => {
            const tag = rowIndex === 0 ? "th" : "td";
            return `<tr>${cols
              .map((col) => `<${tag}>${formatInlines(col)}</${tag}>`)
              .join("")}</tr>`;
          })
          .join("");
        html.push(`<table>${body}</table>`);
      }
      continue;
    }

    if (line.startsWith("# ")) {
      html.push(`<h1>${formatInlines(line.slice(2).trim())}</h1>`);
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      html.push(`<h2>${formatInlines(line.slice(3).trim())}</h2>`);
      i += 1;
      continue;
    }
    if (line.startsWith("### ")) {
      html.push(`<h3>${formatInlines(line.slice(4).trim())}</h3>`);
      i += 1;
      continue;
    }

    html.push(`<p>${formatInlines(line.trim())}</p>`);
    i += 1;
  }

  return html.join("\n");
}

export function markdownToPlainText(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || /^---+$/.test(line.trim())) {
      i += 1;
      continue;
    }

    if (isTableLine(line)) {
      while (i < lines.length && isTableLine(lines[i])) i += 1;
      continue;
    }

    const text = stripInlines(line.replace(/^#{1,6}\s+/, ""));
    if (text && !/^\d+\.\s+idea submission information$/i.test(text)) {
      parts.push(text);
    }
    i += 1;
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}
