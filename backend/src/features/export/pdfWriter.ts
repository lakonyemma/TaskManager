import PDFDocument from "pdfkit";

export type ReportData = {
    title: string;
    range: { from: string | null; to: string | null };
    summary: { total: number; completed: number; inProgress: number; overdue: number; completionRate: number };
    byAssignee: { name: string; total: number; completed: number; completionRate: number }[];
    byWorkspace: { name: string; total: number; completed: number; completionRate: number }[];
};

const drawTable = (
    doc: PDFKit.PDFDocument,
    headers: string[],
    rows: (string | number)[][],
    startX: number,
    colWidths: number[],
) => {
    let y = doc.y;
    doc.font("Helvetica-Bold").fontSize(10);
    headers.forEach((h, i) => {
        doc.text(h, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: colWidths[i] });
    });
    y += 16;
    doc.moveTo(startX, y - 4).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), y - 4).strokeColor("#cccccc").stroke();

    doc.font("Helvetica").fontSize(10);
    for (const row of rows) {
        if (y > doc.page.height - 80) {
            doc.addPage();
            y = doc.y;
        }
        row.forEach((cell, i) => {
            doc.text(String(cell), startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, { width: colWidths[i] });
        });
        y += 16;
    }
    doc.y = y + 10;
};

export const buildReportPdf = (report: ReportData): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 40, size: "A4" });
        const chunks: Buffer[] = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        doc.font("Helvetica-Bold").fontSize(20).fillColor("#1e1b4b").text("Taskly", { continued: false });
        doc.fontSize(16).fillColor("#000").text(report.title);
        doc.font("Helvetica").fontSize(9).fillColor("#666")
            .text(`Generated ${new Date().toLocaleString()}${report.range.from ? ` · Range: ${report.range.from} to ${report.range.to ?? "now"}` : ""}`);
        doc.moveDown();

        doc.font("Helvetica-Bold").fontSize(13).fillColor("#000").text("Summary");
        doc.moveDown(0.3);
        doc.font("Helvetica").fontSize(11);
        doc.text(`Total tasks: ${report.summary.total}`);
        doc.text(`Completed: ${report.summary.completed} (${report.summary.completionRate}% completion rate)`);
        doc.text(`In progress: ${report.summary.inProgress}`);
        doc.text(`Overdue: ${report.summary.overdue}`);
        doc.moveDown();

        if (report.byAssignee.length > 0) {
            doc.font("Helvetica-Bold").fontSize(13).text("By team member");
            doc.moveDown(0.3);
            drawTable(
                doc,
                ["Name", "Total", "Completed", "Rate"],
                report.byAssignee.map((a) => [a.name, a.total, a.completed, `${a.completionRate}%`]),
                40,
                [220, 80, 100, 80],
            );
        }

        if (report.byWorkspace.length > 0) {
            doc.font("Helvetica-Bold").fontSize(13).text("By workspace");
            doc.moveDown(0.3);
            drawTable(
                doc,
                ["Workspace", "Total", "Completed", "Rate"],
                report.byWorkspace.map((w) => [w.name, w.total, w.completed, `${w.completionRate}%`]),
                40,
                [220, 80, 100, 80],
            );
        }

        doc.end();
    });
};
