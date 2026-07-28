import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getAdecuacionRowStyle } from "../utils/adecuacionStyles";

export function StudentsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    identificacion: "",
    nombre: "",
    primerApellido: "",
    segundoApellido: "",
    correo: "",
    telefono: "",
    sexo: ""
  });

  const { data, isLoading } = useQuery({
    queryKey: ["students"],
    queryFn: async () => (await api.get("/students")).data
  });

  const createStudent = useMutation({
    mutationFn: async () => (await api.post("/students", form)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      setForm({
        identificacion: "",
        nombre: "",
        primerApellido: "",
        segundoApellido: "",
        correo: "",
        telefono: "",
        sexo: ""
      });
    }
  });

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <div style={{ padding: 24 }}>
      <h1>Estudiantes</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 24 }}>
        <input placeholder="Identificación" value={form.identificacion} onChange={(e) => setForm({ ...form, identificacion: e.target.value })} />
        <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <input placeholder="Primer apellido" value={form.primerApellido} onChange={(e) => setForm({ ...form, primerApellido: e.target.value })} />
        <input placeholder="Segundo apellido" value={form.segundoApellido} onChange={(e) => setForm({ ...form, segundoApellido: e.target.value })} />
        <input placeholder="Correo" value={form.correo} onChange={(e) => setForm({ ...form, correo: e.target.value })} />
        <input placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
        <input placeholder="Sexo" value={form.sexo} onChange={(e) => setForm({ ...form, sexo: e.target.value })} />
      </div>

      <button onClick={() => createStudent.mutate()} disabled={createStudent.isPending}>
        {createStudent.isPending ? "Guardando..." : "Crear estudiante"}
      </button>

      {isLoading && <p>Cargando...</p>}

      <table className="adecuacion-zebra-list" width="100%" cellPadding={8} style={{ marginTop: 24 }}>
        <thead>
          <tr>
            <th>Identificación</th>
            <th>Nombre</th>
            <th>Grupo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((student: any) => (
            <tr key={student.EstudianteId} style={getAdecuacionRowStyle(student.Adecuacion)}>
              <td>{student.Identificacion}</td>
              <td>{student.Nombre} {student.PrimerApellido} {student.SegundoApellido ?? ""}</td>
              <td>{student.matriculas?.[0]?.grupo?.Nombre ?? "Sin grupo"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}



