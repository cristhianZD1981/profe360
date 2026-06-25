import { useEffect, useMemo, useState } from "react";
import api from "../lib/http";
import { useAuth } from "../context/auth";

type Summary = {
  usuarios: number;
  estudiantes: number;
  grupos: number;
  correosEnviados: number;
  whatsappEnviados: number;
  modulos: string[];
};

type DashboardBucket = {
  Label?: string | null;
  label?: string | null;
  Total?: number | null;
  total?: number | null;
};

type StudentDashboard = {
  totalActivos: number;
  totalInactivos: number;
  totalGeneral: number;
  totalMatriculados: number;
  porGrupo: DashboardBucket[];
  porSeccion: DashboardBucket[];
  porGenero: DashboardBucket[];
  porEspecialidad: DashboardBucket[];
  porNacionalidad: DashboardBucket[];
  porTipo: DashboardBucket[];
  otros: DashboardBucket[];
};

function getBucketLabel(item: DashboardBucket) {
  return String(item.Label ?? item.label ?? "Sin dato").trim() || "Sin dato";
}

function getBucketTotal(item: DashboardBucket) {
  return Number(item.Total ?? item.total ?? 0);
}

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("es-CR").format(Number(value || 0));
}

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getAcademicOrderParts(label: string) {
  const normalized = normalizeText(label);
  const sectionMatch = normalized.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
  if (sectionMatch) {
    return { grade: Number(sectionMatch[1]), section: Number(sectionMatch[2]), text: normalized };
  }

  const gradeRules = [
    { grade: 7, keys: ["septimo", "setimo", "sptimo"] },
    { grade: 8, keys: ["octavo", "ictavo"] },
    { grade: 9, keys: ["noveno"] },
    { grade: 10, keys: ["decimo"] },
    { grade: 11, keys: ["undecimo", "onceavo"] },
    { grade: 12, keys: ["duodecimo", "doceavo"] }
  ];

  for (const rule of gradeRules) {
    if (rule.keys.some((key) => normalized.includes(key))) {
      return { grade: rule.grade, section: 0, text: normalized };
    }
  }

  const numericGrade = normalized.match(/\b(7|8|9|10|11|12)\b/);
  if (numericGrade) {
    return { grade: Number(numericGrade[1]), section: 0, text: normalized };
  }

  return { grade: 999, section: 999, text: normalized };
}

function sortBucketsAcademic(data?: DashboardBucket[]) {
  return [...(data || [])].sort((a, b) => {
    const pa = getAcademicOrderParts(getBucketLabel(a));
    const pb = getAcademicOrderParts(getBucketLabel(b));
    if (pa.grade !== pb.grade) return pa.grade - pb.grade;
    if (pa.section !== pb.section) return pa.section - pb.section;
    return pa.text.localeCompare(pb.text, "es");
  });
}

function MetricCard({
  title,
  value,
  subtitle,
  accent = "#22c55e"
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        borderRadius: "18px",
        padding: "18px",
        background: "linear-gradient(180deg, rgba(15, 23, 42, 0.88), rgba(15, 23, 42, 0.72))",
        border: "1px solid rgba(148, 163, 184, 0.18)",
        boxShadow: "0 16px 40px rgba(2, 6, 23, 0.22)",
        position: "relative",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "0 auto auto 0",
          width: "100%",
          height: "4px",
          background: accent
        }}
      />
      <div style={{ color: "#cbd5e1", fontSize: "12px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {title}
      </div>
      <div style={{ marginTop: "10px", fontSize: "32px", lineHeight: 1, fontWeight: 900, color: "#f8fafc" }}>{value}</div>
      {subtitle ? (
        <div style={{ marginTop: "10px", color: "#94a3b8", fontWeight: 600, fontSize: "13px" }}>{subtitle}</div>
      ) : null}
    </div>
  );
}

function BarBoard({
  title,
  data,
  accent,
  emptyText = "Sin datos disponibles",
  scrollable = false
}: {
  title: string;
  data?: DashboardBucket[];
  accent: string;
  emptyText?: string;
  scrollable?: boolean;
}) {
  const prepared = useMemo(() => {
    const rows = (data || [])
      .map((item) => ({ label: getBucketLabel(item), total: getBucketTotal(item) }))
      .filter((item) => item.total > 0);
    return title === "Por grupo" || title === "Por seccion"
      ? sortBucketsAcademic(rows.map((item) => ({ label: item.label, total: item.total })))
          .map((item) => ({ label: getBucketLabel(item), total: getBucketTotal(item) }))
      : rows.sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "es"));
  }, [data, title]);

  const rows = scrollable ? prepared : prepared.slice(0, 6);
  const max = Math.max(...prepared.map((item) => item.total), 1);
  const allowWrapLabels = title === "Por especialidad";

  return (
    <div
      style={{
        borderRadius: "18px",
        padding: "18px",
        background: "linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.68))",
        border: scrollable ? `1px solid ${accent}55` : "1px solid rgba(148, 163, 184, 0.16)",
        display: "grid",
        gap: "12px",
        minHeight: scrollable ? "340px" : "240px",
        boxShadow: scrollable ? `inset 0 0 0 1px ${accent}22, 0 14px 30px rgba(2, 6, 23, 0.22)` : "0 14px 30px rgba(2, 6, 23, 0.22)"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
        <strong style={{ color: "#f8fafc", fontSize: "16px" }}>{title}</strong>
        <span style={{ color: accent, fontWeight: 800, fontSize: "12px" }}>{prepared.length} items</span>
      </div>

      {rows.length ? (
        <div
          style={{
            display: "grid",
            gap: "10px",
            maxHeight: scrollable ? "260px" : undefined,
            overflowY: scrollable ? "auto" : undefined,
            paddingRight: scrollable ? "8px" : undefined,
            paddingLeft: scrollable ? "4px" : undefined,
            borderRadius: scrollable ? "14px" : undefined,
            background: scrollable ? "linear-gradient(180deg, rgba(15, 23, 42, 0.72), rgba(15, 23, 42, 0.52))" : undefined,
            border: scrollable ? "1px solid rgba(148, 163, 184, 0.18)" : undefined,
            boxShadow: scrollable ? "inset 0 0 0 1px rgba(255,255,255,0.02)" : undefined,
            scrollbarWidth: scrollable ? "thin" : undefined,
            scrollbarColor: scrollable ? `${accent} rgba(148, 163, 184, 0.18)` : undefined
          }}
        >
          {rows.map((item) => (
            <div key={`${title}-${item.label}`} style={{ display: "grid", gap: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
                <span
                  style={{
                    color: "#e2e8f0",
                    fontSize: "13px",
                    fontWeight: 700,
                    overflow: "hidden",
                    textOverflow: allowWrapLabels ? "clip" : "ellipsis",
                    whiteSpace: allowWrapLabels ? "normal" : "nowrap",
                    wordBreak: allowWrapLabels ? "break-word" : "normal",
                    lineHeight: allowWrapLabels ? 1.35 : undefined,
                    maxWidth: allowWrapLabels ? "calc(100% - 64px)" : undefined
                  }}
                >
                  {item.label}
                </span>
                <span style={{ color: "#f8fafc", fontWeight: 900, fontSize: "13px", flexShrink: 0 }}>{formatNumber(item.total)}</span>
              </div>
              <div style={{ height: "10px", borderRadius: "999px", background: "rgba(148, 163, 184, 0.16)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max(8, (item.total / max) * 100)}%`,
                    borderRadius: "999px",
                    background: `linear-gradient(90deg, ${accent}, rgba(255,255,255,0.92))`
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", placeItems: "center", color: "#94a3b8", fontWeight: 700 }}>
          {emptyText}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [studentDashboard, setStudentDashboard] = useState<StudentDashboard | null>(null);
  const [loadingGeneral, setLoadingGeneral] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadDashboardData() {
      setLoadingGeneral(true);
      setLoadingStudents(true);

      const [generalResult, studentResult] = await Promise.allSettled([
        api.get("/dashboard/resumen"),
        api.get("/estudiantes/dashboard")
      ]);

      if (!active) return;

      if (generalResult.status === "fulfilled") {
        setData(generalResult.value.data?.data || null);
      } else {
        console.error("Error cargando resumen general del dashboard:", generalResult.reason);
      }

      if (studentResult.status === "fulfilled") {
        setStudentDashboard(studentResult.value.data?.data || null);
      } else {
        console.error("Error cargando dashboard de estudiantes:", studentResult.reason);
      }

      setLoadingGeneral(false);
      setLoadingStudents(false);
    }

    void loadDashboardData();
    return () => {
      active = false;
    };
  }, []);

  const resumenEstudiantil = useMemo(() => {
    const otrosMap = new Map(
      (studentDashboard?.otros || []).map((item) => [normalizeText(getBucketLabel(item)), getBucketTotal(item)])
    );

    return {
      conAdecuacion: otrosMap.get("con adecuacion") || 0,
      conDiscapacidad: otrosMap.get("con discapacidad") || 0,
      conCondicionMedica: otrosMap.get("con condicion medica") || 0,
      whatsappAutorizado: otrosMap.get("whatsapp autorizado") || 0,
      conRuta: otrosMap.get("con ruta de transporte") || 0
    };
  }, [studentDashboard]);

  const loadingResumen = loadingGeneral && !data;
  const loadingResumenEstudiantes = loadingStudents && !studentDashboard;
  const institucionNombre = user?.institucionNombreComercial || user?.institucionNombre || "";

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <section
        className="card"
        style={{
          background: "radial-gradient(circle at top left, rgba(34, 197, 94, 0.16), transparent 26%), radial-gradient(circle at top right, rgba(59, 130, 246, 0.16), transparent 24%), linear-gradient(180deg, rgba(15,23,42,0.96), rgba(15,23,42,0.88))"
        }}
      >
        <div style={{ maxWidth: "920px" }}>
          <h2 style={{ margin: "0 0 10px", fontSize: "32px", lineHeight: 1.05 }}>
            Dashboard ejecutivo
            {institucionNombre ? (
              <span style={{ display: "inline-block", marginLeft: "12px", color: "#67e8f9", fontSize: "20px", fontWeight: 700 }}>
                {institucionNombre}
              </span>
            ) : null}
          </h2>
          <p style={{ margin: 0, color: "#cbd5e1", fontSize: "15px", lineHeight: 1.65 }}>
            Vista consolidada para ver la operacion general del sistema, la radiografia estudiantil y los puntos que mas requieren seguimiento.
          </p>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "14px" }}>
        <MetricCard title="Usuarios" value={loadingResumen ? "..." : formatNumber(data?.usuarios)} subtitle="Cuentas registradas en la plataforma" accent="#22c55e" />
        <MetricCard title="Estudiantes" value={loadingResumen ? "..." : formatNumber(data?.estudiantes)} subtitle="Total general operativo" accent="#38bdf8" />
        <MetricCard title="Grupos" value={loadingResumen ? "..." : formatNumber(data?.grupos)} subtitle="Secciones y grupos configurados" accent="#f59e0b" />
        <MetricCard title="Correos enviados" value={loadingResumen ? "..." : formatNumber(data?.correosEnviados)} subtitle="Notificaciones enviadas por correo" accent="#a78bfa" />
        <MetricCard title="WhatsApp enviados" value={loadingResumen ? "..." : formatNumber(data?.whatsappEnviados)} subtitle="Mensajes enviados por WhatsApp" accent="#22c55e" />
        <MetricCard title="Matriculados" value={loadingResumenEstudiantes ? "..." : formatNumber(studentDashboard?.totalMatriculados)} subtitle="Estudiantes con matricula activa" accent="#14b8a6" />
        <MetricCard title="Con adecuacion" value={loadingResumenEstudiantes ? "..." : formatNumber(resumenEstudiantil.conAdecuacion)} subtitle="Casos identificados para apoyo educativo" accent="#f97316" />
        <MetricCard title="WhatsApp autorizado" value={loadingResumenEstudiantes ? "..." : formatNumber(resumenEstudiantil.whatsappAutorizado)} subtitle="Canales habilitados para seguimiento" accent="#eab308" />
      </section>

      <section className="card" style={{ display: "grid", gap: "18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <h3 style={{ margin: "0 0 6px" }}>Panorama de estudiantes</h3>
            <p style={{ margin: 0, color: "#cbd5e1" }}>
              El cuadro de resumen de estudiantes ahora vive en el dashboard para que se puedan ver mas metricas y tableros con graficos.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px" }}>
          <MetricCard title="Activos" value={loadingResumenEstudiantes ? "..." : formatNumber(studentDashboard?.totalActivos)} accent="#22c55e" />
          <MetricCard title="Inactivos" value={loadingResumenEstudiantes ? "..." : formatNumber(studentDashboard?.totalInactivos)} accent="#ef4444" />
          <MetricCard title="Total general" value={loadingResumenEstudiantes ? "..." : formatNumber(studentDashboard?.totalGeneral)} accent="#38bdf8" />
          <MetricCard title="Con discapacidad" value={loadingResumenEstudiantes ? "..." : formatNumber(resumenEstudiantil.conDiscapacidad)} accent="#f59e0b" />
          <MetricCard title="Condicion medica" value={loadingResumenEstudiantes ? "..." : formatNumber(resumenEstudiantil.conCondicionMedica)} accent="#a78bfa" />
          <MetricCard title="Con ruta de transporte" value={loadingResumenEstudiantes ? "..." : formatNumber(resumenEstudiantil.conRuta)} accent="#14b8a6" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
          <BarBoard title="Por grupo" data={studentDashboard?.porGrupo} accent="#22c55e" />
          <BarBoard title="Por seccion" data={studentDashboard?.porSeccion} accent="#38bdf8" scrollable />
          <BarBoard title="Por genero" data={studentDashboard?.porGenero} accent="#f97316" />
          <BarBoard title="Por especialidad" data={studentDashboard?.porEspecialidad} accent="#a78bfa" />
          <BarBoard title="Por nacionalidad" data={studentDashboard?.porNacionalidad} accent="#14b8a6" />
          <BarBoard title="Por tipo" data={studentDashboard?.porTipo} accent="#eab308" />
        </div>
      </section>
    </div>
  );
}
