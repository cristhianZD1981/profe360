import * as ExcelJSModule from "exceljs";

// ExcelJS is CommonJS; native ESM exposes its API through default.
const ExcelJS = (ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default || ExcelJSModule;

type LeccionDia = {
  id: string;
  fecha: string;
  leccion: string;
  horaInicio?: string | null;
  horaFin?: string | null;
  materia: string;
  profesor: string;
  estado: string;
  envioWhatsApp: string;
  envioCorreo: string;
};

const estados: Record<string, string> = {
  PRESENTE: "Presente",
  AUSENTE_JUSTIFICADA: "Ausencia justificada",
  AUSENTE_INJUSTIFICADA: "Ausencia injustificada",
  TARDIA_MENOR_10: "Tardía menor de 10 minutos",
  TARDIA_MAYOR_10: "Tardía mayor de 10 minutos",
  SIN_REGISTRAR: "Sin registrar"
};

export function crearExcelAsistenciaDia(
  alumno: { alumno: string; identificacion: string; seccion: string; detalleDia: LeccionDia[] },
  desde: string | null,
  fechaCorte: string
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Asistencia por día", {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      horizontalCentered: true,
      margins: { left: 0.25, right: 0.25, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 }
    }
  });
  sheet.columns = [14, 22, 18, 30, 34, 29, 27, 27].map((width) => ({ width }));
  const titulo = (text: string, height: number) => {
    const row = sheet.addRow([text]);
    sheet.mergeCells(row.number, 1, row.number, 8);
    row.height = height;
    row.getCell(1).alignment = { vertical: "middle", wrapText: true };
    return row;
  };
  titulo("Reporte de asistencia por día", 28).getCell(1).font = { name: "Calibri", size: 16, bold: true, color: { argb: "FF17365D" } };
  titulo(`Alumno: ${alumno.alumno}   Identificación: ${alumno.identificacion}   Sección: ${alumno.seccion}`, 32);
  titulo(`Desde: ${desde || "Inicio de los registros"}   Hasta: ${fechaCorte}`, 22);
  titulo("Envíos por lección. Enviado indica envío registrado; no confirma entrega ni lectura.", 24);
  const header = sheet.addRow(["Fecha", "Lección", "Horario", "Materia", "Profesor", "Estado de asistencia", "Envío de WhatsApp", "Envío de correo"]);
  header.height = 30;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { wrapText: true, vertical: "middle" };
  });

  const lecciones = alumno.detalleDia.filter((item) => item.fecha <= fechaCorte && (!desde || item.fecha >= desde));
  for (const item of lecciones) {
    const row = sheet.addRow([
      new Date(`${item.fecha}T00:00:00Z`), item.leccion,
      item.horaInicio && item.horaFin ? `${item.horaInicio}–${item.horaFin}` : "Sin horario",
      item.materia, item.profesor, estados[item.estado] || item.estado.replace(/_/g, " "),
      item.envioWhatsApp, item.envioCorreo
    ]);
    row.getCell(1).numFmt = "dd/mm/yyyy";
    let lines = 2;
    row.eachCell((cell, col) => {
      const width = sheet.getColumn(col).width || 20;
      const text = cell.value instanceof Date ? "00/00/0000" : String(cell.value || "");
      lines = Math.max(lines, ...text.split("\n").map((line) => Math.ceil(line.length / (width * 0.8))));
      cell.font = { name: "Calibri", size: 11 };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.number % 2 ? "FFF0F5FA" : "FFFFFFFF" } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFD9E2F3" } } };
    });
    row.height = lines * 15;
  }
  if (!lecciones.length) titulo("No hay lecciones para mostrar hasta la fecha del reporte.", 28);
  sheet.autoFilter = `A5:H${Math.max(5, 5 + lecciones.length)}`;
  sheet.pageSetup.printArea = `A1:H${sheet.rowCount}`;
  return workbook;
}
