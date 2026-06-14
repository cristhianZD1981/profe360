import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

const PUBLIC_CHAT_ROUTES = ["/login"];
const DEFAULT_WHATSAPP_TEXT =
  "Hola, quiero informacion sobre Profe360 para empezar cuanto antes.";
const DEFAULT_WHATSAPP_NUMBER = "50686435071";

function buildWhatsAppHref() {
  const env = (import.meta as any).env || {};
  const configuredUrl = String(env.VITE_PROFE360_WHATSAPP_URL || "").trim();
  if (configuredUrl) return configuredUrl;

  const configuredNumber = String(env.VITE_PROFE360_WHATSAPP_NUMBER || DEFAULT_WHATSAPP_NUMBER).replace(/\D/g, "");
  const text = encodeURIComponent(DEFAULT_WHATSAPP_TEXT);
  return `https://api.whatsapp.com/send?phone=${configuredNumber}&text=${text}`;
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
      <path
        fill="#ffffff"
        d="M20.52 3.48A11.78 11.78 0 0 0 12.02 0C5.46 0 .13 5.33.13 11.89c0 2.1.55 4.15 1.6 5.96L0 24l6.32-1.66a11.86 11.86 0 0 0 5.7 1.46h.01c6.56 0 11.89-5.33 11.89-11.89 0-3.18-1.24-6.16-3.4-8.43Zm-8.5 18.33h-.01a9.7 9.7 0 0 1-4.95-1.35l-.36-.21-3.75.98 1-3.66-.24-.38a9.67 9.67 0 0 1-1.48-5.1c0-5.36 4.36-9.72 9.73-9.72 2.6 0 5.04 1.02 6.87 2.84a9.6 9.6 0 0 1 2.85 6.88c0 5.36-4.36 9.72-9.66 9.72Zm5.64-7.49c-.31-.16-1.82-.9-2.1-1s-.48-.16-.68.16-.77 1-.95 1.2-.35.23-.66.08a7.84 7.84 0 0 1-2.31-1.42 8.6 8.6 0 0 1-1.6-1.99c-.17-.3-.02-.47.13-.62.14-.14.31-.35.47-.53.16-.18.21-.31.32-.52.11-.21.06-.39-.03-.55-.1-.16-.68-1.64-.93-2.24-.24-.57-.48-.49-.67-.5h-.57c-.2 0-.53.08-.8.39s-1.04 1.01-1.04 2.48 1.06 2.9 1.2 3.1c.14.2 2.08 3.18 5.04 4.46.7.3 1.25.48 1.68.62.71.23 1.36.2 1.87.12.57-.08 1.82-.74 2.08-1.45.26-.71.26-1.32.18-1.45-.08-.13-.29-.21-.6-.37Z"
      />
    </svg>
  );
}

function MargaritaBadge() {
  return (
    <span
      style={{
        position: "relative",
        width: "78px",
        height: "78px",
        borderRadius: "999px",
        background: "#ffffff",
        padding: "4px",
        flex: "0 0 auto",
        boxShadow: "0 10px 24px rgba(15, 23, 42, 0.20)",
        border: "1px solid rgba(255,255,255,0.95)"
      }}
    >
      <img
        src="/margarita-avatar.png"
        alt="Margarita"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          borderRadius: "999px",
          background: "#ffffff"
        }}
      />
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          right: "-1px",
          top: "4px",
          width: "22px",
          height: "22px",
          borderRadius: "999px",
          background: "#25D366",
          border: "2px solid #ffffff",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 6px 12px rgba(37, 211, 102, 0.30)"
        }}
      >
        <WhatsAppIcon />
      </span>
    </span>
  );
}

export default function ExternalChatWidget() {
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const shouldRender = useMemo(() => PUBLIC_CHAT_ROUTES.includes(location.pathname), [location.pathname]);
  const whatsappHref = useMemo(() => buildWhatsAppHref(), []);

  if (!shouldRender || dismissed) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: "18px",
        bottom: "18px",
        zIndex: 1000,
        display: "grid",
        justifyItems: "end",
        gap: "8px",
        pointerEvents: "none"
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          pointerEvents: "none"
        }}
      >
        <div
          style={{
            opacity: hovered ? 1 : 0,
            transform: hovered ? "translateX(0)" : "translateX(8px)",
            transition: "opacity 160ms ease, transform 160ms ease",
            background: "#ffffff",
            color: "#111827",
            borderRadius: "999px",
            padding: "10px 14px",
            boxShadow: "0 14px 28px rgba(15, 23, 42, 0.16)",
            border: "1px solid rgba(226, 232, 240, 0.95)",
            fontSize: "13px",
            fontWeight: 800,
            whiteSpace: "nowrap",
            pointerEvents: "none"
          }}
        >
          Habla con Margarita por WhatsApp
        </div>

        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          aria-label="Habla con Margarita por WhatsApp"
          title="Habla con Margarita por WhatsApp"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          style={{
            pointerEvents: "auto",
            display: "grid",
            placeItems: "center",
            width: "78px",
            height: "78px",
            borderRadius: "999px",
            textDecoration: "none",
            background: "transparent",
            border: "none",
            boxShadow: "none",
            flex: "0 0 auto"
          }}
        >
          <MargaritaBadge />
        </a>
      </div>
    </div>
  );
}
