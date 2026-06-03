import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/auth";
import api from "../lib/http";

type Message = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

function getRouteLabel(pathname: string) {
  if (pathname.startsWith("/gestion-profe")) return "Gestión del Profe";
  if (pathname.startsWith("/administrativo")) return "Administrativo";
  if (pathname.startsWith("/matricula")) return "Matrícula";
  if (pathname.startsWith("/reportes")) return "Reportes";
  if (pathname.startsWith("/asistencia")) return "Asistencia";
  if (pathname.startsWith("/horarios")) return "Horarios";
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

function getAssistantRoleLabel(roles: string[]) {
  if (roles.includes("PROFESOR") || roles.includes("PROFESOR_GUIA")) return "Profe";
  if (roles.includes("SUPER_ADMIN")) return "Super Admin";
  if (roles.includes("ADMIN_INSTITUCIONAL") || roles.includes("ADMINISTRATIVO")) return "Admin";
  return "";
}

function buildDisplayName(name: string, roles: string[]) {
  const cleanName = String(name || "").trim();
  const firstName = cleanName.split(/\s+/).filter(Boolean)[0] || cleanName;
  const roleLabel = getAssistantRoleLabel(Array.isArray(roles) ? roles : []);
  return roleLabel && firstName ? `${roleLabel} ${firstName}` : firstName || "";
}

function buildWelcomeMessage(displayName: string) {
  if (displayName) {
    return `Hola ${displayName}! Soy Margarita, tu asistente virtual, y con mucho gusto te ayudare a resolver cualquier consulta relacionada con el uso de los modulos de PROFE360.\n\nDecime que necesitas hacer en la plataforma y te guio paso a paso.`;
  }

  return "Hola! Bienvenido a PROFE360. Soy Margarita, tu asistente virtual, y con mucho gusto te ayudare a resolver cualquier consulta relacionada con el uso de los modulos de la plataforma.\n\nDecime que necesitas hacer en la plataforma y te guio paso a paso.";
}

export default function FloatingAssistant() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const loggedUserName = useMemo(() => String(user?.nombre || "").trim(), [user?.nombre]);
  const userRoles = useMemo(() => (Array.isArray(user?.roles) ? user.roles : []), [user?.roles]);
  const displayName = useMemo(() => buildDisplayName(loggedUserName, userRoles), [loggedUserName, userRoles]);
  const userRoleLabel = useMemo(() => getAssistantRoleLabel(userRoles), [userRoles]);
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

  async function handleSend() {
    const question = String(input || "").trim();
    if (!question || loading) return;
    let nextUserName = userName;

    if (!loggedUserName && !userName) {
      const maybeName = question
        .replace(/^(soy|me llamo|mi nombre es)\s+/i, "")
        .trim();
      if (maybeName && !looksLikeGreeting(maybeName) && maybeName.split(/\s+/).length <= 4 && maybeName.length <= 40 && !/\d/.test(maybeName)) {
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
      const response = await api.post("/assistant/chat", {
        question,
        currentPath: location.pathname,
        userName: nextUserName || undefined,
        userDisplayName: displayName || nextUserName || undefined,
        userRoleLabel: userRoleLabel || undefined,
        history: nextHistory.map((item) => ({ role: item.role, text: item.text }))
      });
      const data = response.data?.data || response.data;
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: String(data?.reply || "No pude responder en este momento.")
        }
      ]);
      window.setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 50);
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
              <span style={{ fontSize: "12px", opacity: 0.9 }}>Conectado a {routeLabel}</span>
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
                {message.text}
              </div>
            ))}
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



