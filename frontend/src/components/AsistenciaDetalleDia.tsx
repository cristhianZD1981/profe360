import { Fragment } from "react";

export type AsistenciaLeccionDia = {
  id: string;
  fecha: string;
  leccion: string;
  horaInicio: string | null;
  horaFin: string | null;
  materia: string;
  profesor: string;
  estado: string;
  envioCorreo: string;
  envioWhatsApp: string;
};

const estados: Record<string, string> = {
  PRESENTE: "Presente",
  AUSENTE_JUSTIFICADA: "Ausencia justificada",
  AUSENTE_INJUSTIFICADA: "Ausencia injustificada",
  TARDIA_MENOR_10: "Tardía menor de 10 minutos",
  TARDIA_MAYOR_10: "Tardía mayor de 10 minutos",
  SIN_REGISTRAR: "Sin registrar"
};

export default function AsistenciaDetalleDia({ lecciones, alumno, onExportar, exportando }: {
  lecciones: AsistenciaLeccionDia[];
  alumno: string;
  onExportar: () => void;
  exportando: boolean;
}) {
  const dias = new Map<string, AsistenciaLeccionDia[]>();
  for (const leccion of lecciones) {
    const items = dias.get(leccion.fecha) || [];
    items.push(leccion);
    dias.set(leccion.fecha, items);
  }
  const cell = { padding: "10px", borderBottom: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", textAlign: "left" as const };
  return (
    <div style={{ padding: 14, background: "#f1f5f9", color: "#0f172a", overflowX: "auto" }}>
      <strong>Detalle de asistencia por día — {alumno}</strong>
      <div style={{ marginTop: 10 }}>
        <button type="button" onClick={onExportar} disabled={exportando}
          style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", cursor: exportando ? "wait" : "pointer" }}>
          {exportando ? "Exportando…" : "Exportar detalle x día a Excel"}
        </button>
      </div>
      <p style={{ margin: "8px 0", fontSize: 13 }}>
        Lecciones del período consultado hasta la fecha del reporte. Los envíos corresponden a cada lección.
        Enviado indica envío registrado; no confirma entrega ni lectura.
      </p>
      {!lecciones.length ? <p>No hay lecciones para mostrar hasta la fecha del reporte.</p> : (
        <table style={{ width: "100%", borderCollapse: "collapse" }} aria-label={`Asistencia por día de ${alumno}`}>
          <thead><tr>
            {["Lección", "Horario", "Materia", "Profesor", "Estado de asistencia", "Envío de WhatsApp", "Envío de correo"].map((titulo) => (
              <th key={titulo} scope="col" style={{ ...cell, background: "#e2e8f0" }}>{titulo}</th>
            ))}
          </tr></thead>
          <tbody>
            {[...dias].map(([fecha, items]) => (
              <Fragment key={fecha}>
                <tr><th colSpan={7} scope="rowgroup" style={{ ...cell, background: "#dbeafe" }}>
                  {new Intl.DateTimeFormat("es-CR", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${fecha}T12:00:00Z`))}
                </th></tr>
                {items.map((item) => <tr key={item.id}>
                  <td style={cell}>{item.leccion}</td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>{item.horaInicio && item.horaFin ? `${item.horaInicio}–${item.horaFin}` : "Sin horario"}</td>
                  <td style={cell}>{item.materia}</td>
                  <td style={cell}>{item.profesor}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>{estados[item.estado] || item.estado.replace(/_/g, " ")}</td>
                  <td style={cell}>{item.envioWhatsApp}</td>
                  <td style={cell}>{item.envioCorreo}</td>
                </tr>)}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
