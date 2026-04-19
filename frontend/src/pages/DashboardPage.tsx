import { useEffect, useState } from "react";
import api from "../lib/http";
import Card from "../components/Card";

type Summary = {
  usuarios: number;
  estudiantes: number;
  grupos: number;
  tareas: number;
  incidencias: number;
  modulos: string[];
};

export default function DashboardPage() {
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    api
      .get("/dashboard/resumen")
      .then((response) => setData(response.data.data));
  }, []);

  return (
    <div>
      <section className="hero">
        <div>
          <h2>Panel principal</h2>
          <p>
            Vista ejecutiva para operación académica, administrativa y comercial
          </p>
        </div>
      </section>

      <section className="grid cards">
        <Card title="Usuarios" value={data?.usuarios ?? "..."} />
        <Card title="Estudiantes" value={data?.estudiantes ?? "..."} />
        <Card title="Grupos" value={data?.grupos ?? "..."} />
        <Card title="Tareas" value={data?.tareas ?? "..."} />
        <Card title="Incidencias" value={data?.incidencias ?? "..."} />
      </section>

      <section className="card">
        <h3>Módulos base activos</h3>
        <div className="chips">
          {data?.modulos?.map((item) => (
            <span key={item} className="chip">
              {item}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}