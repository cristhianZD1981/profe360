import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth";
import api from "../lib/http";

type Message = {
  id: string;
  role: "assistant" | "user";
  text: string;
  actions?: Array<{ label: string; type: "navigate" | "ask"; target: string }>;
  feedback?: "useful" | "needs-improvement";
  feedbackError?: string;
};

type ScreenSnapshot = {
  routeLabel: string;
  documentTitle: string;
  headings: string[];
  buttons: string[];
  fields: string[];
  labels: string[];
  alerts: string[];
  tableHeaders: string[];
  rowCount: number;
};

function getRouteLabel(pathname: string) {
  if (pathname.startsWith("/estudiantes/") && pathname.includes("/carnet")) return "Carnet / QR";
  if (pathname.startsWith("/horario-estudiante/")) return "Horario del estudiante";
  if (pathname.startsWith("/boletas/matricula/")) return "Boleta de matrícula";
  if (pathname.startsWith("/boletas/conducta/")) return "Boleta de conducta";
  if (pathname.startsWith("/gestion-profe")) return "Gestión del Profe";
  if (pathname.startsWith("/administrativo")) return "Administrativo";
  if (pathname.startsWith("/estudiantes-matricula")) return "Estudiantes + Matrícula";
  if (pathname.startsWith("/matricula")) return "Matrícula";
  if (pathname.startsWith("/estudiantes")) return "Estudiantes";
  if (pathname === "/estudiante" || pathname.startsWith("/estudiante/")) return "Estudiante";
  if (pathname.startsWith("/usuarios")) return "Usuarios";
  if (pathname.startsWith("/instituciones")) return "Instituciones";
  if (pathname.startsWith("/grupos-clase")) return "Grupos de clase";
  if (pathname.startsWith("/assistant-admin")) return "Margarita";
  if (pathname.startsWith("/reportes/certificaciones")) return "Certificaciones";
  if (pathname.startsWith("/reportes")) return "Reporte y Certificaciones";
  if (pathname.startsWith("/asistencia")) return "Asistencia";
  if (pathname.startsWith("/horarios")) return "Horarios";
  if (pathname.startsWith("/seguimiento-notas")) return "Seguimiento de Notas";
  if (pathname.startsWith("/planeamiento-ia")) return "Planeamiento con IA";
  if (pathname.startsWith("/parametrizaciones")) return "Parametrizaciones";
  return "PROFE360";
}

function looksLikeGreeting(text: string) {
  const key = String(text || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  return ["HOLA", "BUENAS", "BUEN DIA", "BUENAS TARDES", "BUENAS NOCHES", "HEY", "HOLI"].includes(key);
}

function getIntroducedName(text: string) {
  const match = String(text || "").trim().match(/^(?:soy|me llamo|mi nombre es)\s+([\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,3})[.!?]?$/iu);
  if (!match) return "";
  const candidate = match[1].trim();
  const key = candidate.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (/\b(COMO|DONDE|QUE|QUIERO|NECESITO|BUSCAR|VER|HORARIO|ESTUDIANTE|ALUMNO|PROFESOR|ADMINISTRADOR|AYUDA|HACER|GENERAR|CREAR|REVISAR)\b/.test(key)) return "";
  return candidate;
}

function getAssistantRoleLabel(roles: string[]) {
  if (roles.includes("SUPER_ADMIN")) return "Super Admin";
  if (roles.includes("ADMIN_INSTITUCIONAL") || roles.includes("ADMINISTRATIVO")) return "Admin";
  if (roles.includes("PROFESOR") || roles.includes("PROFESOR_GUIA")) return "Profe";
  return "";
}

function getRoleStarterQuestions(roles: string[]) {
  if (roles.some((role) => ["SUPER_ADMIN", "ADMIN_INSTITUCIONAL", "ADMINISTRATIVO"].includes(role))) {
    return ["¿Cómo matriculo a un estudiante?", "¿Cómo creo un usuario?", "¿Qué puedo hacer en esta pantalla?"];
  }
  if (roles.includes("PROFESOR") || roles.includes("PROFESOR_GUIA")) {
    return ["¿Cómo registro asistencia?", "¿Cómo reviso las notas?", "¿Qué puedo hacer en esta pantalla?"];
  }
  return ["¿Qué módulos puedo usar?", "¿Qué puedo hacer en esta pantalla?"];
}

function buildDisplayName(name: string, roles: string[]) {
  const cleanName = String(name || "").trim();
  const firstName = cleanName.split(/\s+/).filter(Boolean)[0] || cleanName;
  const roleLabel = getAssistantRoleLabel(Array.isArray(roles) ? roles : []);
  return roleLabel && firstName ? `${roleLabel} ${firstName}` : firstName || "";
}

function renderAssistantText(text: string) {
  return String(text || "").split(/(\*\*[^*\n]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={`bold-${index}`}>{part.slice(2, -2)}</strong>
      : part
  );
}

function buildWelcomeMessage(displayName: string) {
  if (displayName) {
    return `Hola ${displayName}! Soy Margarita, tu asistente virtual, y con mucho gusto te ayudare a resolver cualquier consulta relacionada con el uso de los modulos de PROFE360.\n\nDecime que necesitas hacer en la plataforma y te guio paso a paso.`;
  }

  return "Hola! Bienvenido a PROFE360. Soy Margarita, tu asistente virtual, y con mucho gusto te ayudare a resolver cualquier consulta relacionada con el uso de los modulos de la plataforma.\n\nDecime que necesitas hacer en la plataforma y te guio paso a paso.";
}

function collectScreenSnapshot(routeLabel: string): ScreenSnapshot {
  if (typeof document === "undefined") {
    return {
      routeLabel,
      documentTitle: "",
      headings: [],
      buttons: [],
      fields: [],
      labels: [],
      alerts: [],
      tableHeaders: [],
      rowCount: 0
    };
  }

  const cleanText = (value: unknown, max = 140) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);

  const readTexts = (selector: string, limit: number) =>
    Array.from(document.querySelectorAll(selector))
      .filter((node) => isVisible(node))
      .map((node) => cleanText((node as HTMLElement).innerText || (node as HTMLInputElement).value || ""))
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index)
      .slice(0, limit);

  const isVisible = (node: Element) => {
    const element = node as HTMLElement;
    if (!element.getClientRects().length) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse";
  };

  const controls = Array.from(document.querySelectorAll("button, [role='button'], [role='tab'], a[href^='/']"))
    .filter((node) => isVisible(node))
    .filter((node) => !node.closest("table tbody"))
    .map((node) => cleanText(node.textContent || node.getAttribute("aria-label") || node.getAttribute("title") || node.querySelector("img")?.getAttribute("alt") || ""))
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 20);

  const fields = Array.from(document.querySelectorAll("input:not([type='hidden']), select, textarea"))
    .filter((node) => isVisible(node))
    .map((node) => {
      const field = node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const associatedLabel = Array.from(field.labels || []).map((label) => cleanText(label.textContent)).find(Boolean);
      const name = cleanText(field.getAttribute("aria-label") || associatedLabel || field.getAttribute("placeholder") || "").replace(/\s*\*$/, "");
      const required = field.required || field.getAttribute("aria-required") === "true" || /\*$/.test(associatedLabel || "");
      return name ? `${name}${required ? " *" : ""}` : "";
    })
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 16);

  return {
    routeLabel,
    documentTitle: String(document.title || "").trim(),
    headings: readTexts("h1, h2, h3, [data-assistant-heading='true']", 8),
    buttons: controls,
    fields,
    labels: readTexts("label, th, .card strong", 14),
    alerts: readTexts("[role='alert'], .alert, .error, .error-message, .success-message, .message, .toast", 8),
    tableHeaders: readTexts("table th", 16),
    rowCount: Array.from(document.querySelectorAll("tbody tr")).filter((row) => isVisible(row)).length
  };
}

export default function FloatingAssistant() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingFeedbackFor, setSavingFeedbackFor] = useState("");
  const [feedbackErrorFor, setFeedbackErrorFor] = useState("");
  const loggedUserName = useMemo(() => String(user?.nombre || "").trim(), [user?.nombre]);
  const userRoles = useMemo(() => (Array.isArray(user?.roles) ? user.roles : []), [user?.roles]);
  const displayName = useMemo(() => buildDisplayName(loggedUserName, userRoles), [loggedUserName, userRoles]);
  const userRoleLabel = useMemo(() => getAssistantRoleLabel(userRoles), [userRoles]);
  const roleStarterQuestions = useMemo(() => getRoleStarterQuestions(userRoles), [userRoles]);
  const [userName, setUserName] = useState(loggedUserName);
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: buildWelcomeMessage(buildDisplayName(String(user?.nombre || "").trim(), Array.isArray(user?.roles) ? user.roles : []))
    }
  ]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const routeLabel = useMemo(() => getRouteLabel(location.pathname), [location.pathname]);

  useEffect(() => {
    if (loggedUserName) {
      setUserName(loggedUserName);
    }
  }, [loggedUserName]);

  useEffect(() => {
    setMessages((prev) => {
      if (!prev.length) {
        return [{ id: "welcome", role: "assistant", text: buildWelcomeMessage(displayName) }];
      }
      if (prev[0]?.id !== "welcome") return prev;
      return [{ ...prev[0], text: buildWelcomeMessage(displayName) }, ...prev.slice(1)];
    });
  }, [displayName]);

  useEffect(() => {
    if (!open) return;
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  async function sendQuestion(rawQuestion: string) {
    const question = String(rawQuestion || "").trim();
    if (!question || loading) return;
    let nextUserName = userName;

    if (!loggedUserName && !userName) {
      const maybeName = getIntroducedName(question);
      if (maybeName && !looksLikeGreeting(maybeName) && maybeName.length <= 40) {
        setUserName(maybeName);
        nextUserName = maybeName;
      }
    }

    const nextUserMessage: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      text: question
    };

    const nextHistory = [...messages, nextUserMessage];
    setMessages(nextHistory);
    setInput("");
    setLoading(true);

    try {
      const screenSnapshot = collectScreenSnapshot(routeLabel);
      const response = await api.post("/assistant/chat", {
        question,
        currentPath: location.pathname,
        screenSnapshot,
        userName: nextUserName || undefined,
        userDisplayName: loggedUserName || nextUserName || undefined,
        history: nextHistory.map((item) => ({ role: item.role, text: item.text }))
      });
      const data = response.data?.data || response.data || {};
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: String(data?.reply || "No pude responder en este momento."),
          actions: Array.isArray(data?.suggestedActions) ? data.suggestedActions : []
        }
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          text: error?.response?.data?.message || "No pude procesar la consulta del asistente."
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    await sendQuestion(input);
  }

  async function handleAction(action: { label: string; type: "navigate" | "ask"; target: string }) {
    if (action.type === "navigate") {
      navigate(action.target);
      setOpen(false);
      return;
    }
    await sendQuestion(action.target);
  }

  async function rateAnswer(messageId: string, rating: "useful" | "needs-improvement") {
    if (savingFeedbackFor) return;
    setSavingFeedbackFor(messageId);
    setFeedbackErrorFor("");
    try {
      await api.post("/assistant/feedback", { responseId: messageId, rating, currentPath: location.pathname });
      setMessages((prev) => prev.map((item) => item.id === messageId ? { ...item, feedback: rating } : item));
    } catch (error: any) {
      setFeedbackErrorFor(messageId);
      const message = String(error?.response?.data?.message || "").trim();
      if (message) setMessages((prev) => prev.map((item) => item.id === messageId ? { ...item, feedbackError: message } : item));
    } finally {
      setSavingFeedbackFor("");
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Hablar con Margarita"
        aria-label="Hablar con Margarita"
        style={{
          position: "fixed",
          right: "22px",
          bottom: "22px",
          zIndex: 1000,
          width: "64px",
          height: "64px",
          borderRadius: "999px",
          border: "none",
          cursor: "pointer",
          background: "linear-gradient(135deg, #2563eb 0%, #22c55e 100%)",
          color: "#ffffff",
          boxShadow: "0 18px 36px rgba(37, 99, 235, 0.30)"
        }}
      >
        <img
          src="/margarita-avatar.svg"
          alt="Margarita"
          style={{ width: "64px", height: "64px", borderRadius: "999px", display: "block" }}
        />
      </button>

      {open ? (
        <div
          style={{
            position: "fixed",
            right: "22px",
            bottom: "98px",
            width: "380px",
            maxWidth: "calc(100vw - 28px)",
            height: "72vh",
            maxHeight: "720px",
            zIndex: 999,
            background: "#ffffff",
            border: "1px solid #bfdbfe",
            borderRadius: "20px",
            overflow: "hidden",
            boxShadow: "0 24px 60px rgba(15, 23, 42, 0.22)",
            display: "grid",
            gridTemplateRows: "auto 1fr auto"
          }}
        >
          <div
            style={{
              padding: "14px 16px",
              background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px"
            }}
          >
            <div style={{ display: "grid", gap: "3px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <img
                  src="/margarita-avatar.svg"
                  alt="Margarita"
                  style={{ width: "36px", height: "36px", borderRadius: "999px", border: "2px solid rgba(255,255,255,0.35)", background: "#ffffff" }}
                />
                <strong style={{ fontSize: "16px" }}>Margarita</strong>
              </div>
              <span style={{ fontSize: "12px", opacity: 0.9 }}>{userRoleLabel ? `${userRoleLabel} · ` : ""}{routeLabel}</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                border: "1px solid rgba(255,255,255,0.32)",
                background: "rgba(255,255,255,0.12)",
                color: "#ffffff",
                borderRadius: "10px",
                padding: "6px 10px",
                cursor: "pointer",
                fontWeight: 700
              }}
            >
              Cerrar
            </button>
          </div>

          <div
            ref={scrollRef}
            style={{
              overflowY: "auto",
              padding: "14px",
              background: "#f8fafc",
              display: "grid",
              gap: "10px",
              alignContent: "start"
            }}
          >
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  justifySelf: message.role === "user" ? "end" : "start",
                  maxWidth: "88%",
                  padding: "10px 12px",
                  borderRadius: "14px",
                  background: message.role === "user" ? "#dbeafe" : "#ffffff",
                  border: message.role === "user" ? "1px solid #93c5fd" : "1px solid #e2e8f0",
                  color: "#0f172a",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.45
                }}
              >
                <div>{message.role === "assistant" ? renderAssistantText(message.text) : message.text}</div>
                {message.role === "assistant" && Array.isArray(message.actions) && message.actions.length ? (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                    {message.actions.map((action, index) => (
                      <button
                        key={`${message.id}-action-${index}`}
                        type="button"
                        onClick={() => void handleAction(action)}
                        style={{
                          border: "1px solid #93c5fd",
                          background: action.type === "navigate" ? "#dbeafe" : "#ecfeff",
                          color: "#0f172a",
                          borderRadius: "999px",
                          padding: "7px 10px",
                          cursor: "pointer",
                          fontWeight: 700,
                          fontSize: "12px"
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
                {message.role === "assistant" && message.id.startsWith("a-") ? (
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginTop: "9px", color: "#64748b", fontSize: "11px" }}>
                    {message.feedback ? (
                      <span>Gracias por ayudarme a mejorar.</span>
                    ) : (
                      <>
                        <span>¿Te sirvió?</span>
                        <button type="button" onClick={() => void rateAnswer(message.id, "useful")} disabled={Boolean(savingFeedbackFor)} style={{ border: "1px solid #cbd5e1", borderRadius: "999px", background: "#fff", color: "#334155", padding: "4px 8px", cursor: "pointer", fontSize: "11px" }}>
                          Sí
                        </button>
                        <button type="button" onClick={() => void rateAnswer(message.id, "needs-improvement")} disabled={Boolean(savingFeedbackFor)} style={{ border: "1px solid #cbd5e1", borderRadius: "999px", background: "#fff", color: "#334155", padding: "4px 8px", cursor: "pointer", fontSize: "11px" }}>
                          Hay que mejorarla
                        </button>
                      </>
                    )}
                    {feedbackErrorFor === message.id ? <span role="alert">{message.feedbackError || "No se guardó la valoración. Inténtalo otra vez."}</span> : null}
                  </div>
                ) : null}
              </div>
            ))}
            {messages.length === 1 && !loading ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "2px" }}>
                {roleStarterQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void sendQuestion(question)}
                    style={{
                      border: "1px solid #bfdbfe",
                      background: "#eff6ff",
                      color: "#1e3a8a",
                      borderRadius: "999px",
                      padding: "7px 10px",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: "12px"
                    }}
                  >
                    {question}
                  </button>
                ))}
              </div>
            ) : null}
            {loading ? (
              <div
                style={{
                  justifySelf: "start",
                  maxWidth: "88%",
                  padding: "10px 12px",
                  borderRadius: "14px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  color: "#475569",
                  fontWeight: 700
                }}
              >
                Pensando...
              </div>
            ) : null}
          </div>

          <div style={{ padding: "12px", borderTop: "1px solid #e2e8f0", background: "#ffffff", display: "grid", gap: "8px" }}>
            <textarea
              rows={3}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Escribi tu consulta. Ej: Como creo un grupo? o Donde asigno un docente a una materia?"
              style={{
                width: "100%",
                resize: "none",
                border: "1px solid #94a3b8",
                borderRadius: "12px",
                padding: "10px 12px",
                color: "#0f172a",
                background: "#ffffff"
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", alignItems: "center" }}>
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || !String(input || "").trim()}
                style={{
                  border: "none",
                  borderRadius: "12px",
                  padding: "10px 14px",
                  background: loading || !String(input || "").trim() ? "#cbd5e1" : "linear-gradient(135deg, #2563eb 0%, #22c55e 100%)",
                  color: "#ffffff",
                  fontWeight: 800,
                  cursor: loading || !String(input || "").trim() ? "not-allowed" : "pointer"
                }}
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}



