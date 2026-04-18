import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function AttendancePage() {
  const [grupoId, setGrupoId] = useState<number>(1);
  const [selected, setSelected] = useState<Record<number, number>>({});

  const groups = useQuery({
    queryKey: ["groups"],
    queryFn: async () => (await api.get("/groups")).data
  });

  const states = useQuery({
    queryKey: ["attendance-states"],
    queryFn: async () => (await api.get("/attendance/catalogs/states")).data
  });

  const students = useQuery({
    queryKey: ["students"],
    queryFn: async () => (await api.get("/students")).data
  });

  const save = useMutation({
    mutationFn: async (payload: any) => api.post("/attendance/session", payload)
  });

  const activeStudents = useMemo(() => students.data ?? [], [students.data]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const details = activeStudents.map((student: any) => ({
      estudianteId: student.EstudianteId,
      estadoAsistenciaId: selected[student.EstudianteId] || states.data?.[0]?.EstadoAsistenciaId,
      observacion: ""
    }));

    await save.mutateAsync({
      grupoId,
      detalles: details
    });

    alert("Asistencia registrada");
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Asistencia</h1>

      <form onSubmit={handleSubmit}>
        <label>Grupo</label>
        <select value={grupoId} onChange={(e) => setGrupoId(Number(e.target.value))} style={{ display: "block", marginBottom: 16 }}>
          {(groups.data ?? []).map((group: any) => (
            <option key={group.GrupoId} value={group.GrupoId}>
              {group.Nombre}
            </option>
          ))}
        </select>

        <table width="100%" cellPadding={8}>
          <thead>
            <tr>
              <th>Estudiante</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {activeStudents.map((student: any) => (
              <tr key={student.EstudianteId}>
                <td>{student.Nombre} {student.PrimerApellido}</td>
                <td>
                  <select
                    value={selected[student.EstudianteId] || states.data?.[0]?.EstadoAsistenciaId || ""}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [student.EstudianteId]: Number(e.target.value) }))}
                  >
                    {(states.data ?? []).map((state: any) => (
                      <option key={state.EstadoAsistenciaId} value={state.EstadoAsistenciaId}>
                        {state.Nombre}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button type="submit" style={{ marginTop: 16 }}>
          Guardar asistencia
        </button>
      </form>
    </div>
  );
}
