import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
} from "docx";

export async function buildIdeaDocx(
  title: string,
  summary: string,
  rawSubmission: string
): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            text: summary,
          }),
          new Paragraph({
            border: {
              bottom: {
                color: "999999",
                space: 1,
                style: BorderStyle.SINGLE,
                size: 12,
              },
            },
            spacing: { after: 200 },
          }),
          new Paragraph({
            text: "Original submission",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: rawSubmission,
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
