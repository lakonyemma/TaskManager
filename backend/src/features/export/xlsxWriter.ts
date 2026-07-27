import ExcelJS from "exceljs";

export type Sheet = { name: string; columns: { header: string; key: string; width?: number }[]; rows: Record<string, unknown>[] };

// Builds a multi-sheet workbook and returns it as a Buffer — used for both
// the flat task/workspace exports (single sheet) and the richer productivity
// report export (Summary / By Assignee / By Workspace / By Priority sheets).
export const buildWorkbook = async (sheets: Sheet[]): Promise<Buffer> => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Taskly";
    workbook.created = new Date();

    for (const sheet of sheets) {
        const ws = workbook.addWorksheet(sheet.name.slice(0, 31));
        ws.columns = sheet.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
        ws.getRow(1).font = { bold: true };
        for (const row of sheet.rows) ws.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
};
