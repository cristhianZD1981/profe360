import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth";
import api from "../lib/http";

type HighlightSlide = {
  id: string;
  badge: string;
  title: string;
  description: string;
  image: string;
  accent: string;
};

const slides: HighlightSlide[] = [
  {
    id: "ensenanza",
    badge: "Ense\u00f1anza",
    title: "Menos carga operativa. M\u00e1s tiempo para educar.",
    description:
      "Centralice procesos clave y devuelva tiempo real al trabajo docente y al liderazgo institucional.",
    image:
      "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80",
    accent: "linear-gradient(90deg, #10b7a4 0%, #0f6c86 100%)"
  },
  {
    id: "analitica",
    badge: "Anal\u00edtica",
    title: "Datos claros para decidir mejor.",
    description:
      "Convierta la gesti\u00f3n acad\u00e9mica en informaci\u00f3n \u00fatil, visible y accionable para tomar mejores decisiones.",
    image:
      "https://images.unsplash.com/photo-1529390079861-591de354faf5?auto=format&fit=crop&w=900&q=80",
    accent: "linear-gradient(90deg, #0f6c86 0%, #10b7a4 100%)"
  },
  {
    id: "acompanamiento",
    badge: "Acompa\u00f1amiento",
    title: "Gesti\u00f3n educativa con visi\u00f3n de futuro.",
    description:
      "Una plataforma cercana, estable y lista para crecer con su instituci\u00f3n sin complicar la operaci\u00f3n diaria.",
    image:
      "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=900&q=80",
    accent: "linear-gradient(90deg, #f2b544 0%, #10b7a4 100%)"
  },
  {
    id: "planificacion",
    badge: "Planificaci\u00f3n",
    title: "Procesos ordenados para trabajar con m\u00e1s claridad.",
    description:
      "Organice tareas, evidencias y seguimiento institucional en una experiencia m\u00e1s visual y fluida.",
    image:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
    accent: "linear-gradient(90deg, #0f6c86 0%, #f2b544 100%)"
  },
  {
    id: "reportes",
    badge: "Reportes",
    title: "Informaci\u00f3n lista para actuar sin perder tiempo.",
    description:
      "Visualice datos relevantes y reduzca tareas repetitivas en la gesti\u00f3n diaria.",
    image:
      "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=900&q=80",
    accent: "linear-gradient(90deg, #10b7a4 0%, #f2b544 100%)"
  }
];

const trustPoints = [
  {
    icon: "\u2713",
    title: "Seguro, estable y confiable",
    description: "Protegemos la informaci\u00f3n institucional, docente y acad\u00e9mica con una experiencia estable."
  },
  {
    icon: "\u25d4",
    title: "Disponibilidad y asistencia 24/7",
    description: "Acceda desde cualquier lugar con una experiencia consistente y acompa\u00f1amiento cercano."
  },
  {
    icon: "\u2726",
    title: "Hecho por educadores para educadores",
    description: "Herramientas pensadas para simplificar el d\u00eda a d\u00eda y responder a necesidades reales."
  }
];

const storySections = [
  {
    eyebrow: "Qui\u00e9nes somos",
    title: "Hecho por educadores. Potenciado por ingenier\u00eda de software.",
    description:
      "Unimos experiencia educativa real y desarrollo tecnol\u00f3gico para crear una plataforma confiable, pr\u00e1ctica y lista para responder a las exigencias del d\u00eda a d\u00eda institucional.",
    bullets: [
      "M\u00e1s de 20 a\u00f1os de trayectoria combinada",
      "Visi\u00f3n educativa con enfoque tecnol\u00f3gico",
      "Compromiso con Costa Rica y la regi\u00f3n"
    ]
  },
  {
    eyebrow: "Misi\u00f3n",
    title: "Optimizar tiempo, procesos y capacidad de respuesta.",
    description:
      "Desarrollamos soluciones tecnol\u00f3gicas que simplifican la gesti\u00f3n acad\u00e9mica y administrativa para liberar tiempo, reducir carga operativa y generar valor tangible.",
    bullets: [
      "Menos operaci\u00f3n manual",
      "M\u00e1s eficiencia institucional",
      "Mejores decisiones"
    ]
  },
  {
    eyebrow: "Visi\u00f3n",
    title: "Convertirnos en la referencia regional en tecnolog\u00eda educativa.",
    description:
      "Avanzamos para liderar en Costa Rica y la regi\u00f3n con una propuesta de servicio cercana, estable e innovadora, orientada a resultados concretos para las instituciones.",
    bullets: [
      "Innovaci\u00f3n aplicada",
      "Cercan\u00eda en el servicio",
      "Escalabilidad regional"
    ]
  }
];

const differentiators = [
  {
    title: "Ahorro real de tiempo",
    description:
      "Procesos m\u00e1s \u00e1giles para enfocar el esfuerzo institucional donde realmente importa."
  },
  {
    title: "IA al servicio de la educaci\u00f3n",
    description:
      "Tecnolog\u00eda aplicada para apoyar gesti\u00f3n, an\u00e1lisis y productividad diaria."
  },
  {
    title: "Plataforma estable y cercana",
    description:
      "Una soluci\u00f3n confiable con acompa\u00f1amiento, evoluci\u00f3n y mejora continua."
  }
];

const impactStats = [
  {
    value: "20+",
    label: "a\u00f1os de experiencia combinada",
    detail: "Educaci\u00f3n, consultor\u00eda y desarrollo de software en una sola visi\u00f3n."
  },
  {
    value: "24/7",
    label: "disponibilidad y asistencia",
    detail: "Una soluci\u00f3n pensada para responder cuando la instituci\u00f3n la necesita."
  },
  {
    value: "IA",
    label: "tecnolog\u00eda aplicada",
    detail: "Herramientas que apoyan productividad, an\u00e1lisis y toma de decisiones."
  },
  {
    value: "CR + Regi\u00f3n",
    label: "proyecci\u00f3n de liderazgo",
    detail: "Comprometidos con crecer desde Costa Rica hacia la regi\u00f3n."
  }
];

const ctaPoints = [
  "Modernice su gesti\u00f3n acad\u00e9mica y administrativa",
  "Ahorre tiempo con procesos m\u00e1s claros, visibles y ordenados",
  "Impulse su instituci\u00f3n con tecnolog\u00eda e inteligencia artificial"
];

const topSignals = [
  "Costa Rica",
  "IA aplicada a educaci\u00f3n",
  "Soporte y acompa\u00f1amiento",
  "Hecho por educadores"
];

const socialLinks = [
  {
    label: "TikTok",
    url: "https://www.tiktok.com/@profe.360?_r=1&_t=ZS-97Jguo77J7Q",
    icon: "https://cdn.simpleicons.org/tiktok/FFFFFF"
  },
  {
    label: "Facebook",
    url: "https://www.facebook.com/share/1EDRa9w5La/",
    icon: "https://cdn.simpleicons.org/facebook/1877F2"
  },
  {
    label: "Instagram",
    url: "https://www.instagram.com/profe360cr?igsh=MXFnaGhmYnUwa3V0YQ==",
    icon: "https://cdn.simpleicons.org/instagram/E4405F"
  }
];

function LoginIconMail() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="m5 8 7 5 7-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LoginIconLock() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7.5 10V8a4.5 4.5 0 1 1 9 0v2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" />
    </svg>
  );
}

function LoginIconEye({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="2.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 3 21 21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M10.8 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.2 3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M6.3 7.8A17.5 17.5 0 0 0 2.5 12s3.5 6 9.5 6a10.7 10.7 0 0 0 3-.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M10.4 10.4A2.3 2.3 0 1 0 13.6 13.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { login, logout, setUser } = useAuth();
  const navigate = useNavigate();

  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [recordarme, setRecordarme] = useState(true);
  const [mostrarClave, setMostrarClave] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  const [mostrarCambioClave, setMostrarCambioClave] = useState(false);
  const [claveActual, setClaveActual] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const [confirmarClave, setConfirmarClave] = useState("");

  const [mostrarRecuperacion, setMostrarRecuperacion] = useState(false);
  const [loadingRecuperacion, setLoadingRecuperacion] = useState(false);
  const slide = slides[slideIndex];

  const sideSlides = useMemo(() => {
    const prev = slides[(slideIndex + slides.length - 1) % slides.length];
    const next = slides[(slideIndex + 1) % slides.length];
    return { prev, next };
  }, [slideIndex]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % slides.length);
    }, 3600);

    return () => window.clearInterval(intervalId);
  }, []);

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMensaje("");
    setLoading(true);

    try {
      const result = await login(correo, password);

      if (result?.requiereCambioClave) {
        setMostrarCambioClave(true);
        setClaveActual(password);
        setNuevaClave("");
        setConfirmarClave("");
        setMensaje("Deb\u00e9s cambiar la clave en el primer ingreso");
        return;
      }

      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo iniciar sesi\u00f3n");
    } finally {
      setLoading(false);
    }
  }

  async function handleCambiarClaveInicial(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMensaje("");

    if (!nuevaClave || !confirmarClave) {
      setError("Deb\u00e9s completar la nueva clave y su confirmaci\u00f3n");
      return;
    }

    if (nuevaClave !== confirmarClave) {
      setError("La nueva clave y su confirmaci\u00f3n deben coincidir");
      return;
    }

    try {
      const response = await api.post("/auth/change-password", {
        currentPassword: claveActual,
        newPassword: nuevaClave
      });

      const data = response.data?.data || response.data;

      if (data?.user) {
        setUser(data.user);
      }

      setMostrarCambioClave(false);
      setMensaje("Clave actualizada correctamente");
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo cambiar la clave");
    }
  }

  async function handleForgotPassword() {
    setError("");
    setMensaje("");

    const correoRecuperacion = correo.trim();

    if (!correoRecuperacion) {
      setError("Primero deb\u00e9s indicar el correo del usuario");
      return;
    }

    setLoadingRecuperacion(true);

    try {
      const response = await api.post("/auth/forgot-password", {
        correo: correoRecuperacion
      });

      const backendMessage =
        response.data?.message ||
        "Si el correo existe, se enviar\u00e1 un enlace de recuperaci\u00f3n";

      setMensaje(backendMessage);
      setMostrarRecuperacion(false);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          "No se pudo procesar la recuperaci\u00f3n"
      );
    } finally {
      setLoadingRecuperacion(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-shell__noise" />
      <div className="login-shell__glow login-shell__glow--left" />
      <div className="login-shell__glow login-shell__glow--right" />

      <div className="login-layout">
        <div className="login-topbar">
          <div className="login-topbar__brandline">
            <span className="login-topbar__label">Profe360</span>
            <p>Tecnolog&iacute;a educativa para una gesti&oacute;n m&aacute;s clara, &aacute;gil y confiable.</p>
          </div>

          <div className="login-topbar__signals">
            {topSignals.map((signal) => (
              <span key={signal} className="login-topbar__chip">
                {signal}
              </span>
            ))}
          </div>

          <div className="login-social-links" aria-label="Redes sociales de Profe360">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                className="login-social-link"
                href={social.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Abrir ${social.label} de Profe360`}
                title={social.label}
              >
                <img src={social.icon} alt="" aria-hidden="true" />
                <span>{social.label}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="login-hero">
          <section className="login-panel" id="login-access">
          <div className="login-panel__brand">
            <div className="login-brand-card">
              <img
                src="/logo.png"
                alt="Profe360"
                className="login-logo login-logo--landing"
              />
            </div>
            <span className="login-kicker">Menos carga, m&aacute;s ense&ntilde;anza.</span>
          </div>

          <div className="login-panel__heading">
            <h1>La plataforma que ordena, agiliza y fortalece su gesti&oacute;n educativa.</h1>
            <p>Ingrese a Profe360 y convierta tiempo operativo en valor real para su instituci&oacute;n.</p>
          </div>

          <div className="login-panel__visual" aria-hidden="true">
            <div
              className="login-panel__photo login-panel__photo--back"
              style={{ backgroundImage: `url(${sideSlides.prev.image})` }}
            />
            <div
              key={`hero-photo-${slide.id}`}
              className="login-panel__photo login-panel__photo--main"
              style={{ backgroundImage: `url(${slide.image})` }}
            >
              <span>{slide.badge}</span>
            </div>
            <div
              className="login-panel__photo login-panel__photo--front"
              style={{ backgroundImage: `url(${sideSlides.next.image})` }}
            />
          </div>

          </section>

          <aside className="login-access-stack">
            <form onSubmit={handleSubmit} className="login-form-panel">
              <label className="login-field">
                <span>Correo electr&oacute;nico</span>
                <div className="login-field__control">
                  <div className="login-field__icon">
                    <LoginIconMail />
                  </div>
                  <input
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    placeholder="Ingresa tu correo electr\u00f3nico"
                    autoComplete="username"
                  />
                </div>
              </label>

              <label className="login-field">
                <span>Contrase&ntilde;a</span>
                <div className="login-field__control">
                  <div className="login-field__icon">
                    <LoginIconLock />
                  </div>
                  <input
                    type={mostrarClave ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ingresa tu contrase\u00f1a"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="login-field__toggle"
                    onClick={() => setMostrarClave((value) => !value)}
                    aria-label={mostrarClave ? "Ocultar contrase\u00f1a" : "Mostrar contrase\u00f1a"}
                  >
                    <LoginIconEye open={mostrarClave} />
                  </button>
                </div>
              </label>

              <div className="login-row">
                <label className="login-check">
                  <input
                    type="checkbox"
                    checked={recordarme}
                    onChange={(e) => setRecordarme(e.target.checked)}
                  />
                  <span>Recordarme</span>
                </label>

                <button
                  type="button"
                  className="login-link-btn"
                  onClick={() => {
                    setMostrarRecuperacion((value) => !value);
                    setError("");
                    setMensaje("");
                  }}
                >
                  {mostrarRecuperacion ? "Ocultar recuperaci\u00f3n" : "\u00bfOlvidaste tu contrase\u00f1a?"}
                </button>
              </div>

              {error ? <div className="alert login-alert">{error}</div> : null}

              {mensaje ? (
                <div className="alert login-alert login-alert--success">{mensaje}</div>
              ) : null}

              <button className="login-submit-btn" disabled={loading}>
                <span>{loading ? "Ingresando..." : "Ingresar"}</span>
                <strong>&rarr;</strong>
              </button>
            </form>

            {mostrarRecuperacion ? (
              <div className="login-aux-card">
                <div>
                  <h3>Recuperar clave</h3>
                  <p>
                    Si el correo existe, enviaremos un enlace de recuperaci&oacute;n al usuario.
                  </p>
                </div>

                <label className="login-field">
                  <span>Correo del usuario</span>
                  <div className="login-field__control login-field__control--readonly">
                    <div className="login-field__icon">
                      <LoginIconMail />
                    </div>
                    <input value={correo} readOnly disabled />
                  </div>
                </label>

                <div className="login-aux-card__actions">
                  <button
                    type="button"
                    className="login-submit-btn login-submit-btn--compact"
                    onClick={handleForgotPassword}
                    disabled={loadingRecuperacion || !correo.trim()}
                  >
                    <span>
                      {loadingRecuperacion
                        ? "Enviando..."
                        : "Enviar enlace de recuperaci\u00f3n"}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="ghost-btn login-ghost-btn"
                    onClick={() => setMostrarRecuperacion(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}

            {mostrarCambioClave ? (
              <form onSubmit={handleCambiarClaveInicial} className="login-aux-card">
                <div>
                  <h3>Cambio de clave inicial</h3>
                  <p>Completa este paso antes de ingresar por primera vez.</p>
                </div>

                <label className="login-field">
                  <span>Clave actual</span>
                  <div className="login-field__control">
                    <div className="login-field__icon">
                      <LoginIconLock />
                    </div>
                    <input
                      type="password"
                      value={claveActual}
                      onChange={(e) => setClaveActual(e.target.value)}
                    />
                  </div>
                </label>

                <label className="login-field">
                  <span>Nueva clave</span>
                  <div className="login-field__control">
                    <div className="login-field__icon">
                      <LoginIconLock />
                    </div>
                    <input
                      type="password"
                      value={nuevaClave}
                      onChange={(e) => setNuevaClave(e.target.value)}
                    />
                  </div>
                </label>

                <label className="login-field">
                  <span>Confirmar nueva clave</span>
                  <div className="login-field__control">
                    <div className="login-field__icon">
                      <LoginIconLock />
                    </div>
                    <input
                      type="password"
                      value={confirmarClave}
                      onChange={(e) => setConfirmarClave(e.target.value)}
                    />
                  </div>
                </label>

                <div className="login-aux-card__actions">
                  <button className="login-submit-btn login-submit-btn--compact">
                    <span>Guardar nueva clave</span>
                  </button>

                  <button
                    type="button"
                    className="ghost-btn login-ghost-btn"
                    onClick={() => {
                      setMostrarCambioClave(false);
                      logout();
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : null}
          </aside>
          <aside className="login-hero__side">
            <div className="login-hero__side-card">
              <span className="login-story__eyebrow">Acceso guiado</span>
              <h2>Una vista compacta, clara y lista para entrar.</h2>
              <p>
                Todo lo importante queda al alcance: iniciar sesi&oacute;n, recuperar acceso y ajustar la clave inicial.
              </p>
            </div>

            <div className="login-hero__side-list">
              {trustPoints.map((point) => (
                <article key={point.title} className="login-hero__side-point">
                  <span className="login-hero__side-icon">{point.icon}</span>
                  <div>
                    <strong>{point.title}</strong>
                    <p>{point.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </aside>

        <div className="login-story-hero login-story-hero--lifted">
          <div className="login-story-hero__copy">
            <span className="login-story__eyebrow">Profe360</span>
            <h2>Tecnolog&iacute;a educativa que simplifica la gesti&oacute;n y eleva resultados.</h2>
            <p>
              Profe360 integra experiencia docente, ingenier&iacute;a de software e inteligencia
              artificial para ofrecer una gesti&oacute;n m&aacute;s &aacute;gil, clara y rentable para cada
              instituci&oacute;n educativa.
            </p>
          </div>

          <div className="login-story-hero__panel">
            <div className="login-story-hero__metric">
              <strong>20+</strong>
              <span>A&ntilde;os de experiencia en educaci&oacute;n, consultor&iacute;a y tecnolog&iacute;a.</span>
            </div>
            <div className="login-story-hero__metric">
              <strong>IA</strong>
              <span>Potenciada para apoyar decisiones, an&aacute;lisis y productividad diaria.</span>
            </div>
            <div className="login-story-hero__metric">
              <strong>CR + Regi&oacute;n</strong>
              <span>Visi&oacute;n de liderazgo en Costa Rica y crecimiento regional sostenido.</span>
            </div>
          </div>
        </div>

        </div>

      </div>

      <section className="login-story" id="profe360-story">
        <div className="login-impact-band">
          {impactStats.map((item) => (
            <article key={item.label} className="login-impact-band__item">
              <strong>{item.value}</strong>
              <span>{item.label}</span>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>

        <div className="login-story__grid login-story__grid--compact">
          {storySections.map((section) => (
            <article key={section.eyebrow} className="login-story-card">
              <span className="login-story-card__eyebrow">{section.eyebrow}</span>
              <h3>{section.title}</h3>
              <p>{section.description}</p>
              <ul className="login-story-card__list">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="login-diff">
          <div className="login-diff__intro">
            <span className="login-story__eyebrow">Por qu&eacute; elegir Profe360</span>
            <h3>M&aacute;s que un sistema, un aliado estrat&eacute;gico para transformar la gesti&oacute;n educativa</h3>
          </div>

          <div className="login-diff__grid">
            {differentiators.map((item) => (
              <article key={item.title} className="login-diff-card">
                <h4>{item.title}</h4>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="login-cta">
        <div className="login-cta__copy">
          <span className="login-story__eyebrow">Llamado a la acci&oacute;n</span>
          <h2>Modernice su gesti&oacute;n educativa con Profe360.</h2>
          <p>
            Lleve su instituci&oacute;n a una operaci&oacute;n m&aacute;s ordenada, eficiente y preparada para
            los retos actuales de la educaci&oacute;n con una plataforma pensada para generar
            resultados reales.
          </p>
          <ul className="login-cta__list">
            {ctaPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>

        <div className="login-cta__actions">
          <button
            type="button"
            className="login-submit-btn"
            onClick={() => scrollToSection("login-access")}
          >
            <span>Iniciar sesi&oacute;n</span>
            <strong>&rarr;</strong>
          </button>

          <button
            type="button"
            className="ghost-btn login-ghost-btn login-cta__ghost"
            onClick={() => scrollToSection("profe360-story")}
          >
            Ver propuesta de valor
          </button>
        </div>
      </section>
    </div>
  );
}
