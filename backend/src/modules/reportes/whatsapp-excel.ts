import ExcelJS from "exceljs";

export async function crearExcelWhatsApp(rows: any[], desde: string, hasta: string) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Envíos WhatsApp", { views: [{ state: "frozen", ySplit: 3 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  sheet.columns = [16, 24, 35, 22, 15, 32, 22, 22, 20, 45].map(width => ({ width }));
  sheet.addRow(["Reporte de envíos de WhatsApp"]); sheet.mergeCells("A1:J1");
  sheet.addRow([`${desde} al ${hasta} · Hora de Costa Rica · ${rows.length} registros`]); sheet.mergeCells("A2:J2");
  sheet.addRow(["ID", "Fecha y hora", "Colegio", "Tipo", "Sección", "Profesor", "Destino", "Origen", "Estado", "Motivo / resultado"]);
  for (const r of rows) sheet.addRow([
    String(r.WhatsAppEnvioId), new Date(r.CreatedAt).toLocaleString("es-CR", { timeZone: "America/Costa_Rica" }),
    r.InstitucionNombre || "", r.TipoMensaje || "", r.Seccion || "", r.Profesor || "",
    String(r.TelefonoDestino || ""), `${r.NumeroOrigenSnapshot || ""}${r.EsFallback ? " (Profe360)" : ""}`, r.Estado || "", r.MotivoError || ""
  ]);
  sheet.eachRow((row, index) => row.eachCell(cell => {
    cell.font = { name: "Calibri", size: 11, bold: index <= 3, color: { argb: "FF0F172A" } };
    cell.alignment = { wrapText: true, vertical: "top" };
    if (index === 3 || (index > 3 && index % 2 === 0)) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  }));
  sheet.autoFilter = "A3:J3";
  sheet.pageSetup.printTitlesRow = "1:3";
  return book.xlsx.writeBuffer();
}
