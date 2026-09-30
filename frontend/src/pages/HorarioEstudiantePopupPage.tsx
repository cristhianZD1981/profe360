import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../lib/http";

type Day = { numero: number; nombre: string };
type Row = { bloqueHorarioId: number; leccion: string; horaInicio: string; horaFin: string; [day: string]: any };
type Schedule = {
  vista: "seccion";
  encabezado: { grupo?: string; nivel?: string; anioLectivo?: string; periodo?: string };
  dias: Day[];
  filas: Row[];
};
type StudentSchedule = { vista: "estudiante"; horario: Schedule };

function isBreak(label: string) {
  return /recreo|almuerzo/i.test(label);
}

export default function HorarioEstudiantePopupPage() {
  const { id } = useParams();
  const [schedule, setSchedule] = useState<StudentSchedule | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api.get(`/horarios/estudiante/${Number(id)}`)
      .then((response) => setSchedule(response.data?.data || null))
      .catch((reason: any) => setError(reason?.response?.data?.message || "No se pudo cargar el horario de la sección."));
  }, [id]);

  if (error) return <main className="schedule-popup-error">{error}</main>;
  if (!schedule) return <main className="schedule-popup-error">Cargando horario…</main>;

  const data = schedule.horario;
  const subtitle = [data.encabezado.anioLectivo, data.encabezado.periodo].filter(Boolean).join(" / ");

  return (
    <main className="schedule-popup">
      <style>{`
        *{box-sizing:border-box}html,body,#root{margin:0;min-width:320px;min-height:100%;background:#eef3f8;color:#10253a;font-family:Arial,Helvetica,sans-serif}
        .schedule-popup{min-height:100vh;padding:22px;background:#eef3f8}.schedule-print-action{max-width:1500px;margin:0 auto 12px;display:flex;justify-content:flex-end}.schedule-print-action button{border:0;border-radius:8px;padding:10px 16px;background:#174d78;color:#fff;font-weight:800;cursor:pointer;box-shadow:0 3px 10px #18334d24}.schedule-print-action button:hover{background:#103b60}
        .schedule-sheet{max-width:1500px;margin:0 auto;background:white;border:1px solid #cad6e2;border-radius:14px;overflow:hidden;box-shadow:0 16px 40px #18334d1c}
        .schedule-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 22px;background:#102b3c;color:#fff}
        .schedule-heading h1{margin:0;font-size:22px;line-height:1.2;font-weight:800}.schedule-heading p{margin:5px 0 0;color:#c4d7e5;font-size:13px;font-weight:600}.schedule-period{white-space:nowrap;font-size:14px;font-weight:700;color:#e4edf4}
        .schedule-table-wrap{overflow:auto}.schedule-table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed;font-size:12px}.schedule-table th,.schedule-table td{border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:6px;text-align:center;vertical-align:middle}.schedule-table thead th{position:sticky;top:0;background:#dce6f1;color:#1d3449;font-weight:800}.schedule-table th:first-child{width:112px}.schedule-table tbody th{background:#f4f7fa;color:#111827;font-weight:900}.schedule-time{display:block;margin-top:3px;color:#263748;font-size:10px;font-weight:800}.schedule-cell{min-height:36px;padding:7px 6px;border:1px solid #7da5e6;border-radius:6px;background:#f7faff;color:#142b43;font-weight:700;white-space:pre-line;line-height:1.25}.schedule-free{color:#66788b;font-weight:500;background:#fafbfd;border-color:#d5dde6}.schedule-break{padding:8px!important;background:#fff4c2;color:#92400e;font-weight:800}.schedule-break.lunch{background:#d8f5e8;color:#116149}
        .schedule-popup-error{padding:24px;color:#334155;font:600 15px Arial,sans-serif}
        @media(max-width:760px){.schedule-popup{padding:8px}.schedule-heading{align-items:flex-start;flex-direction:column;padding:14px}.schedule-heading h1{font-size:18px}.schedule-table{min-width:850px}.schedule-table th:first-child{width:100px}}
        @page{size:A4 landscape;margin:5mm}
        @media print{html,body,#root{width:100%;height:100%;margin:0!important;background:#fff}.schedule-popup{width:100%;height:200mm;min-height:0;padding:0;background:#fff}.schedule-print-action{display:none}.schedule-sheet{width:100%;height:200mm;max-width:none;border:0;border-radius:0;box-shadow:none;overflow:hidden;break-inside:avoid;page-break-inside:avoid}.schedule-heading{height:18mm;padding:3mm 5mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}.schedule-heading h1{font-size:13pt}.schedule-heading p,.schedule-period{font-size:8pt}.schedule-table-wrap{height:182mm;overflow:hidden}.schedule-table{width:100%;height:100%;font-size:6.5pt;table-layout:fixed}.schedule-table thead{height:7mm}.schedule-table tbody{height:175mm}.schedule-table tr{break-inside:avoid;page-break-inside:avoid}.schedule-table th,.schedule-table td{padding:.7mm .5mm;line-height:1.05}.schedule-table th:first-child{width:22mm;color:#111827}.schedule-time{margin-top:.5mm;font-size:6pt;color:#111827}.schedule-cell{min-height:0;height:100%;padding:.8mm .5mm;border-radius:.7mm;font-size:6pt;line-height:1.05;overflow-wrap:anywhere;-webkit-print-color-adjust:exact;print-color-adjust:exact}.schedule-break{padding:.8mm!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      `}</style>
      <div className="schedule-print-action"><button type="button" onClick={() => window.print()}>Imprimir horario</button></div>
      <section className="schedule-sheet" aria-label="Horario de la sección">
        <header className="schedule-heading">
          <div>
            <h1>Sección {data.encabezado.grupo || ""}{data.encabezado.nivel ? ` · ${data.encabezado.nivel}` : ""}</h1>
            <p>Horario por día y lección</p>
          </div>
          {subtitle && <div className="schedule-period">{subtitle}</div>}
        </header>
        <div className="schedule-table-wrap">
          <table className="schedule-table">
            <thead><tr><th>Lección</th>{data.dias.map(day => <th key={day.numero}>{day.nombre}</th>)}</tr></thead>
            <tbody>
              {data.filas.map(row => {
                const pause = isBreak(row.leccion);
                return <tr key={row.bloqueHorarioId}>
                  <th>{row.leccion}<span className="schedule-time">{row.horaInicio}–{row.horaFin}</span></th>
                  {pause ? <td colSpan={data.dias.length} className={`schedule-break ${/almuerzo/i.test(row.leccion) ? "lunch" : ""}`}>{row.leccion} ({row.horaInicio}–{row.horaFin})</td> : data.dias.map(day => {
                    const value = String(row[day.nombre] || "Libre");
                    return <td key={day.numero}><div className={`schedule-cell ${value.trim().toLowerCase() === "libre" ? "schedule-free" : ""}`}>{value}</div></td>;
                  })}
                </tr>;
              })}
              {!data.filas.length && <tr><td colSpan={data.dias.length + 1}>No hay horario registrado para esta sección.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
