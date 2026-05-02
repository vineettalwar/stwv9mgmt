import PDFDocument from "pdfkit";

export function pdfToBuffer(
  build: (doc: InstanceType<typeof PDFDocument>) => Promise<void>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc).then(() => doc.end()).catch(reject);
  });
}
