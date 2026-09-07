import * as ExcelJSModule from "exceljs";
const ExcelJS = (ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default || ExcelJSModule;

export async function exportarComunicadosGuia(titulo: string, periodo: string, headers: string[], rows: string[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Comunicados", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, views: [{ state: "frozen", ySplit: 3 }] });
  sheet.columns = [22, 32, 18, 14, 25, 30, 65, 55, 55].map(width => ({ width }));
  sheet.addRow([titulo]); sheet.mergeCells("A1:I1");
  sheet.addRow([periodo]); sheet.mergeCells("A2:I2");
  sheet.addRow(headers);
  rows.forEach(r => sheet.addRow(r));
  sheet.eachRow((row, i) => {
    row.eachCell(cell => {
      cell.font = { name: "Calibri", size: 11, bold: i <= 3, color: { argb: "FF0F172A" } };
      cell.alignment = { wrapText: true, vertical: "top" };
      if (i === 3 || (i > 3 && i % 2 === 0)) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    });
  });
  sheet.pageSetup.printTitlesRow = "1:3"; sheet.pageSetup.printArea = `A1:I${sheet.rowCount}`;
  const buffer = await book.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = "comunicados-profe-guia.xlsx";
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
