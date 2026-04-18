import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth";
import api from "../lib/http";

export default function LoginPage() {
  const { login, logout, setUser } = useAuth();
  const navigate = useNavigate();

  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);

  const [mostrarCambioClave, setMostrarCambioClave] = useState(false);
  const [claveActual, setClaveActual] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const [confirmarClave, setConfirmarClave] = useState("");

  const [mostrarRecuperacion, setMostrarRecuperacion] = useState(false);

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

    if (!nuevaClave || nuevaClave !== confirmarClave) {
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

    if (!correo) {
      setError("Ingresá el usuario para recuperar la clave");
      return;
    }

    try {
      const response = await api.post("/auth/forgot-password", { correo });
      const data = response.data?.data || {};
      const backendMessage =
        response.data?.message || "Recuperación procesada";

      const extra =
        data?.modo === "simulado" && data?.claveTemporal
          ? ` Clave temporal simulada: ${data.claveTemporal}`
          : "";

      setMensaje(`${backendMessage}.${extra}`.trim());
      setMostrarRecuperacion(false);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          "No se pudo procesar la recuperación"
      );
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src="/logo.png" alt="Profe360" className="login-logo" />
        <h1>Bienvenido a Profe360</h1>
        <p className="muted">Plataforma académica multiinstitución</p>

        <form onSubmit={handleSubmit} className="form">
          <label>
            Usuario
            <input
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="102340567@est.mep.go.cr"
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error ? <div className="alert">{error}</div> : null}

          {mensaje ? (
            <div
              className="alert"
              style={{ background: "#ecfdf3", color: "#166534" }}
            >
              {mensaje}
            </div>
          ) : null}

          <button className="primary-btn" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>

          <button
            type="button"
            onClick={() => setMostrarRecuperacion((v) => !v)}
            style={{
              background: "transparent",
              border: 0,
              color: "#2563eb",
              cursor: "pointer",
              padding: 0,
              textAlign: "left"
            }}
          >
            Olvidé mi clave
          </button>
        </form>

        {mostrarRecuperacion && (
          <div
            style={{
              marginTop: 16,
              borderTop: "1px solid #e5e7eb",
              paddingTop: 16
            }}
          >
            <p className="muted">
              Se generará una clave temporal y se enviará al correo registrado
              del padre, madre o encargado
            </p>

            <button
              type="button"
              className="primary-btn"
              onClick={handleForgotPassword}
            >
              Enviar recuperación
            </button>
          </div>
        )}

        {mostrarCambioClave && (
          <form
            onSubmit={handleCambiarClaveInicial}
            className="form"
            style={{
              marginTop: 16,
              borderTop: "1px solid #e5e7eb",
              paddingTop: 16
            }}
          >
            <h3 style={{ margin: 0 }}>Cambio de clave inicial</h3>

            <label>
              Clave actual
              <input
                type="password"
                value={claveActual}
                onChange={(e) => setClaveActual(e.target.value)}
              />
            </label>

            <label>
              Nueva clave
              <input
                type="password"
                value={nuevaClave}
                onChange={(e) => setNuevaClave(e.target.value)}
              />
            </label>

            <label>
              Confirmar nueva clave
              <input
                type="password"
                value={confirmarClave}
                onChange={(e) => setConfirmarClave(e.target.value)}
              />
            </label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="primary-btn">Guardar nueva clave</button>

              <button
                type="button"
                onClick={() => {
                  setMostrarCambioClave(false);
                  logout();
                }}
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                  padding: "10px 14px",
                  background: "#fff",
                  cursor: "pointer"
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}