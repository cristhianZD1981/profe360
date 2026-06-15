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
    badge: "Enseñanza",
    title: "Menos carga operativa. Más tiempo para educar.",
    description:
      "Centralice procesos clave y devuelva tiempo real al trabajo docente y al liderazgo institucional.",
    image:
      "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80",
    accent: "linear-gradient(90deg, #10b7a4 0%, #0f6c86 100%)"
  },
  {
    id: "analitica",
    badge: "Analítica",
    title: "Datos claros para decidir mejor.",
    description:
      "Convierta la gestión académica en información útil, visible y accionable para tomar mejores decisiones.",
    image:
      "https://images.unsplash.com/photo-1529390079861-591de354faf5?auto=format&fit=crop&w=900&q=80",
    accent: "linear-gradient(90deg, #0f6c86 0%, #10b7a4 100%)"
  },
  {
    id: "acompanamiento",
    badge: "Acompañamiento",
    title: "Gestión educativa con visión de futuro.",
    description:
      "Una plataforma cercana, estable y lista para crecer con su institución sin complicar la operación diaria.",
    image:
      "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=900&q=80",
    accent: "linear-gradient(90deg, #f2b544 0%, #10b7a4 100%)"
  }
];

const trustPoints = [
  {
    icon: "✓",
    title: "Seguro, estable y confiable",
    description: "Protegemos la información institucional, docente y académica con una experiencia estable."
  },
  {
    icon: "◔",
    title: "Disponibilidad y asistencia 24/7",
    description: "Acceda desde cualquier lugar con una experiencia consistente y acompañamiento cercano."
  },
  {
    icon: "✦",
    title: "Hecho por educadores para educadores",
    description: "Herramientas pensadas para simplificar el día a día y responder a necesidades reales."
  }
];

const storySections = [
  {
    eyebrow: "Quiénes somos",
    title: "Hecho por educadores. Potenciado por ingeniería de software.",
    description:
      "Unimos experiencia educativa real y desarrollo tecnológico para crear una plataforma confiable, práctica y lista para responder a las exigencias del día a día institucional.",
    bullets: [
      "Más de 20 años de trayectoria combinada",
      "Visión educativa con enfoque tecnológico",
      "Compromiso con Costa Rica y la región"
    ]
  },
  {
    eyebrow: "Misión",
    title: "Optimizar tiempo, procesos y capacidad de respuesta.",
    description:
      "Desarrollamos soluciones tecnológicas que simplifican la gestión académica y administrativa para liberar tiempo, reducir carga operativa y generar valor tangible.",
    bullets: [
      "Menos operación manual",
      "Más eficiencia institucional",
      "Mejores decisiones"
    ]
  },
  {
    eyebrow: "Visión",
    title: "Convertirnos en la referencia regional en tecnología educativa.",
    description:
      "Avanzamos para liderar en Costa Rica y la región con una propuesta de servicio cercana, estable e innovadora, orientada a resultados concretos para las instituciones.",
    bullets: [
      "Innovación aplicada",
      "Cercanía en el servicio",
      "Escalabilidad regional"
    ]
  }
];

const differentiators = [
  {
    title: "Ahorro real de tiempo",
    description:
      "Procesos más ágiles para enfocar el esfuerzo institucional donde realmente importa."
  },
  {
    title: "IA al servicio de la educación",
    description:
      "Tecnología aplicada para apoyar gestión, análisis y productividad diaria."
  },
  {
    title: "Plataforma estable y cercana",
    description:
      "Una solución confiable con acompañamiento, evolución y mejora continua."
  }
];

const impactStats = [
  {
    value: "20+",
    label: "años de experiencia combinada",
    detail: "Educación, consultoría y desarrollo de software en una sola visión."
  },
  {
    value: "24/7",
    label: "disponibilidad y asistencia",
    detail: "Una solución pensada para responder cuando la institución la necesita."
  },
  {
    value: "IA",
    label: "tecnología aplicada",
    detail: "Herramientas que apoyan productividad, análisis y toma de decisiones."
  },
  {
    value: "CR + Región",
    label: "proyección de liderazgo",
    detail: "Comprometidos con crecer desde Costa Rica hacia la región."
  }
];

const ctaPoints = [
  "Modernice su gestión académica y administrativa",
  "Ahorre tiempo con procesos más claros, visibles y ordenados",
  "Impulse su institución con tecnología e inteligencia artificial"
];

const topSignals = [
  "Costa Rica",
  "IA aplicada a educación",
  "Soporte y acompañamiento",
  "Hecho por educadores"
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
    }, 4800);

    return () => window.clearInterval(intervalId);
  }, []);

  function moveSlide(direction: "prev" | "next") {
    setSlideIndex((current) =>
      direction === "next"
        ? (current + 1) % slides.length
        : (current + slides.length - 1) % slides.length
    );
  }

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
        setMensaje("Debés cambiar la clave en el primer ingreso");
        return;
      }

      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  async function handleCambiarClaveInicial(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMensaje("");

    if (!nuevaClave || !confirmarClave) {
      setError("Debés completar la nueva clave y su confirmación");
      return;
    }

    if (nuevaClave !== confirmarClave) {
      setError("La nueva clave y su confirmación deben coincidir");
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
      setError("Primero debés indicar el correo del usuario");
      return;
    }

    setLoadingRecuperacion(true);

    try {
      const response = await api.post("/auth/forgot-password", {
        correo: correoRecuperacion
      });

      const backendMessage =
        response.data?.message ||
        "Si el correo existe, se enviará un enlace de recuperación";

      setMensaje(backendMessage);
      setMostrarRecuperacion(false);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          "No se pudo procesar la recuperación"
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
            <p>Tecnología educativa para una gestión más clara, ágil y confiable.</p>
          </div>

          <div className="login-topbar__signals">
            {topSignals.map((signal) => (
              <span key={signal} className="login-topbar__chip">
                {signal}
              </span>
            ))}
          </div>
        </div>

        <section className="login-panel" id="login-access">
          <div className="login-panel__brand">
            <div className="login-brand-card">
              <img
                src="/logo.png"
                alt="Profe360"
                className="login-logo login-logo--landing"
              />
            </div>
            <span className="login-kicker">Menos carga, más enseñanza.</span>
          </div>

          <div className="login-panel__heading">
            <h1>La plataforma que ordena, agiliza y fortalece su gestión educativa.</h1>
            <p>Ingrese a Profe360 y convierta tiempo operativo en valor real para su institución.</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form-panel">
            <label className="login-field">
              <span>Correo electrónico</span>
              <div className="login-field__control">
                <div className="login-field__icon">
                  <LoginIconMail />
                </div>
                <input
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  placeholder="Ingresa tu correo electrónico"
                  autoComplete="username"
                />
              </div>
            </label>

            <label className="login-field">
              <span>Contraseña</span>
              <div className="login-field__control">
                <div className="login-field__icon">
                  <LoginIconLock />
                </div>
                <input
                  type={mostrarClave ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-field__toggle"
                  onClick={() => setMostrarClave((value) => !value)}
                  aria-label={mostrarClave ? "Ocultar contraseña" : "Mostrar contraseña"}
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
                {mostrarRecuperacion ? "Ocultar recuperación" : "¿Olvidaste tu contraseña?"}
              </button>
            </div>

            {error ? <div className="alert login-alert">{error}</div> : null}

            {mensaje ? (
              <div className="alert login-alert login-alert--success">{mensaje}</div>
            ) : null}

            <button className="login-submit-btn" disabled={loading}>
              <span>{loading ? "Ingresando..." : "Ingresar"}</span>
              <strong>→</strong>
            </button>
          </form>

          {mostrarRecuperacion ? (
            <div className="login-aux-card">
              <div>
                <h3>Recuperar clave</h3>
                <p>
                  Si el correo existe, enviaremos un enlace de recuperación al usuario.
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
                      : "Enviar enlace de recuperación"}
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
        </section>

        <section className="login-showcase">
          <div className="login-showcase__surface">
            <button
              type="button"
              className="login-carousel-btn login-carousel-btn--left"
              onClick={() => moveSlide("prev")}
              aria-label="Slide anterior"
            >
              ‹
            </button>

            <article
              key={`prev-${sideSlides.prev.id}`}
              className="login-showcase-card login-showcase-card--side"
              style={{ backgroundImage: `url(${sideSlides.prev.image})` }}
            >
              <div className="login-showcase-card__overlay" />
              <div className="login-showcase-card__content">
                <span className="login-showcase-card__badge">{sideSlides.prev.badge}</span>
                <h3>{sideSlides.prev.title}</h3>
              </div>
            </article>

            <article
              key={slide.id}
              className="login-showcase-card login-showcase-card--main"
              style={{ backgroundImage: `url(${slide.image})` }}
            >
              <div className="login-showcase-card__overlay" />
              <div className="login-showcase-card__content">
                <span className="login-showcase-card__round">🎓</span>
                <div className="login-showcase-card__copy">
                  <h2>{slide.title}</h2>
                  <p>{slide.description}</p>
                </div>
                <div className="login-showcase-card__progress">
                  <span style={{ background: slide.accent, width: "48%" }} />
                </div>
              </div>
            </article>

            <article
              key={`next-${sideSlides.next.id}`}
              className="login-showcase-card login-showcase-card--side login-showcase-card--right"
              style={{ backgroundImage: `url(${sideSlides.next.image})` }}
            >
              <div className="login-showcase-card__overlay" />
              <div className="login-showcase-card__content">
                <span className="login-showcase-card__badge">{sideSlides.next.badge}</span>
                <h3>{sideSlides.next.title}</h3>
              </div>
            </article>

            <button
              type="button"
              className="login-carousel-btn login-carousel-btn--right"
              onClick={() => moveSlide("next")}
              aria-label="Siguiente slide"
            >
              ›
            </button>

            <div className="login-showcase__dots" aria-label="Indicadores de slide">
              {slides.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`login-dot ${index === slideIndex ? "is-active" : ""}`}
                  onClick={() => setSlideIndex(index)}
                  aria-label={`Ver ${item.title}`}
                />
              ))}
            </div>
          </div>

          <div className="login-trust">
            {trustPoints.map((point) => (
              <div key={point.title} className="login-trust__item">
                <span className="login-trust__icon">{point.icon}</span>
                <div>
                  <strong>{point.title}</strong>
                  <p>{point.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="login-story" id="profe360-story">
        <div className="login-story-hero">
          <div className="login-story-hero__copy">
            <span className="login-story__eyebrow">Profe360</span>
            <h2>Tecnología educativa que simplifica la gestión y eleva resultados.</h2>
            <p>
              Profe360 integra experiencia docente, ingeniería de software e inteligencia
              artificial para ofrecer una gestión más ágil, clara y rentable para cada
              institución educativa.
            </p>
          </div>

          <div className="login-story-hero__panel">
            <div className="login-story-hero__metric">
              <strong>20+</strong>
              <span>Años de experiencia en educación, consultoría y tecnología.</span>
            </div>
            <div className="login-story-hero__metric">
              <strong>IA</strong>
              <span>Potenciada para apoyar decisiones, análisis y productividad diaria.</span>
            </div>
            <div className="login-story-hero__metric">
              <strong>CR + Región</strong>
              <span>Visión de liderazgo en Costa Rica y crecimiento regional sostenido.</span>
            </div>
          </div>
        </div>

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
            <span className="login-story__eyebrow">Por qué elegir Profe360</span>
            <h3>Más que un sistema, un aliado estratégico para transformar la gestión educativa</h3>
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
          <span className="login-story__eyebrow">Llamado a la acción</span>
          <h2>Modernice su gestión educativa con Profe360.</h2>
          <p>
            Lleve su institución a una operación más ordenada, eficiente y preparada para
            los retos actuales de la educación con una plataforma pensada para generar
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
            <span>Iniciar sesión</span>
            <strong>→</strong>
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
