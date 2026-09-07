import * as ExcelJSModule from "exceljs";
import type { RegistroGuiaMateria } from "../components/ReportesProfeGuia";
const ExcelJS = (ExcelJSModule as unknown as { default?: typeof ExcelJSModule }).default || ExcelJSModule;

export async function exportarRegistroGuia(resultados: RegistroGuiaMateria[], grupo: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Registro de notas", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 }, views: [{ state: "frozen", ySplit: 3 }] });
  sheet.columns = [32, 18, 26, 30, 24, 15, 15, 15, 30, 40, 24, 15].map((width) => ({ width }));
  sheet.addRow([`Registro de notas del grupo ${grupo}`]); sheet.mergeCells("A1:L1");
  sheet.addRow(["Consulta de solo lectura por alumno, materia y profesor"]); sheet.mergeCells("A2:L2");
  sheet.addRow(["Alumno", "Identificación", "Materia", "Profesor", "Componente", "% valor", "% evaluado", "% obtenido", "Actividad / lección", "Detalle", "Estado", "Nota"]);
  for (const { materia, alumnos } of resultados) for (const alumno of alumnos) {
    for (const c of alumno.componentes) {
      sheet.addRow([alumno.nombre, alumno.identificacion, materia.MateriaNombre, materia.ProfesorNombre, c.nombre, c.porcentajeComponente / 100, c.porcentajeEvaluado / 100, c.porcentajeGanado / 100, "", c.resumen]);
      for (const d of c.detalles) sheet.addRow([alumno.nombre, alumno.identificacion, materia.MateriaNombre, materia.ProfesorNombre, c.nombre, null, null, d.porcentaje / 100, d.titulo, d.subtitulo, d.estado, d.nota]);
    }
    sheet.addRow([alumno.nombre, alumno.identificacion, materia.MateriaNombre, materia.ProfesorNombre, "Promedio final", null, alumno.totalEvaluado / 100, alumno.totalGanado / 100]);
  }
  sheet.eachRow((row, index) => {
    row.height = index <= 3 ? 28 : 45;
    row.eachCell((cell, col) => {
      cell.font = { name: "Calibri", size: 11, bold: index <= 3 };
      cell.alignment = { wrapText: true, vertical: "middle" };
      if (index === 3) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };
      if (index > 3 && col >= 6 && col <= 8) cell.numFmt = "0.00%";
    });
  });
  sheet.pageSetup.printArea = `A1:L${sheet.rowCount}`;
  sheet.pageSetup.printTitlesRow = "1:3";
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a"); link.href = url; link.download = "registro-notas-profe-guia.xlsx";
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
