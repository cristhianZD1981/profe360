import { useEffect, useState } from "react";
import api from "../lib/http";

export default function ReportesPage() {
  const [academico, setAcademico] = useState<any[]>([]);
  const [padres, setPadres] = useState<any[]>([]);
  useEffect(() => {
    Promise.all([api.get("/reportes/academico"), api.get("/reportes/padres")]).then(([a, p]) => {
      setAcademico(a.data.data);
      setPadres(p.data.data);
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
        <h3>Encargados principales</h3>
        <div className="table-wrap">
          <table><thead><tr><th>Estudiante</th><th>Encargado</th><th>Correo</th><th>Teléfono</th></tr></thead><tbody>
            {padres.map((item, index) => <tr key={index}><td>{item.Nombre} {item.PrimerApellido}</td><td>{item.Encargado}</td><td>{item.Correo}</td><td>{item.Telefono}</td></tr>)}
          </tbody></table>
        </div>
      </section>
    </div>
  );
}
