import { useEffect, useState } from "react";
import api from "../lib/http";

export default function ReportesPage() {
  const [academico, setAcademico] = useState<any[]>([]);
  const [padres, setPadres] = useState<any[]>([]);
  const [boletasConducta, setBoletasConducta] = useState<any[]>([]);
  useEffect(() => {
    Promise.all([api.get("/reportes/academico"), api.get("/reportes/padres"), api.get("/reportes/boletas-conducta")]).then(([a, p, b]) => {
      setAcademico(a.data.data);
      setPadres(p.data.data);
      setBoletasConducta(b.data.data || []);
    });
  }, []);

  return (
    <div className="stack">
      <section className="card">
        <h3>Reporte académico</h3>
        <div className="table-wrap">
          <table><thead><tr><th>Grupo</th><th>Materia</th><th>Estudiantes</th></tr></thead><tbody>
            {academico.map((item, index) => <tr key={index}><td>{item.Grupo}</td><td>{item.Materia}</td><td>{item.Estudiantes}</td></tr>)}
          </tbody></table>
        </div>
      </section>
      <section className="card">
        <h3>Boletas de conducta</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>N°</th>
                <th>Fecha</th>
                <th>Estudiante</th>
                <th>Sección</th>
                <th>Funcionario</th>
                <th>Envíos correo</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {boletasConducta.map((item, index) => (
                <tr key={item.BoletaConductaId || index}>
                  <td>{String(Number(item.Consecutivo || 0)).padStart(4, "0")}</td>
                  <td>{String(item.Fecha || "").slice(0, 10)}</td>
                  <td>{[item.PrimerApellido || "", item.SegundoApellido || "", item.Nombre || ""].join(" ").replace(/\s+/g, " ").trim()}</td>
                  <td>{item.Seccion || ""}</td>
                  <td>{item.NombreFuncionario || ""}</td>
                  <td>{Number(item.TotalEnviosExitosos || 0)} / {Number(item.TotalEnviosCorreo || 0)}</td>
                  <td>
                    <button
                      type="button"
                      className="primary-btn"
                      style={{ padding: "6px 10px" }}
                      onClick={() => window.open(`/boletas/conducta/${item.BoletaConductaId}`, "_blank")}
                    >
                      Reimprimir
                    </button>
                  </td>
                </tr>
              ))}
              {!boletasConducta.length && (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: "12px" }}>No hay boletas registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h3>Encargados principales</h3>
        <div className="table-wrap">
          <table><thead><tr><th>Estudiante</th><th>Encargado</th><th>Correo</th><th>Teléfono</th></tr></thead><tbody>
            {padres.map((item, index) => <tr key={index}><td>{[item.PrimerApellido || "", item.SegundoApellido || "", item.Nombre].join(" ").replace(/\s+/g, " ").trim()}</td><td>{item.Encargado}</td><td>{item.Correo}</td><td>{item.Telefono}</td></tr>)}
          </tbody></table>
        </div>
      </section>
    </div>
  );
}



