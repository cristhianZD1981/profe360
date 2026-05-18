import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/http";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [correo, setCorreo] = useState("");
  const [numeroCedula, setNumeroCedula] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmarClave, setConfirmarClave] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMensaje("");

    if (!token) {
      setError("El enlace de restablecimiento no es válido");
      return;
    }

    if (!correo.trim() || !numeroCedula.trim() || !newPassword || !confirmarClave) {
      setError("Debés completar todos los campos");
      return;
    }

    if (newPassword !== confirmarClave) {
      setError("La nueva clave y su confirmación deben coincidir");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/auth/reset-password", {
        token,
        correo: correo.trim(),
        numeroCedula: numeroCedula.trim(),
        newPassword
      });

      setMensaje(response.data?.message || "Clave restablecida correctamente");

      setTimeout(() => {
        navigate("/login");
      }, 1800);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          "No se pudo restablecer la clave"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src="/logo.png" alt="Profe360" className="login-logo" />
        <h1>Restablecer clave</h1>
        <p className="muted">
          Ingresí tu correo, número de cédula y la nueva clave
        </p>

        {!token ? (
          <div className="form">
            <div className="alert">
              El enlace no es válido o está incompleto
            </div>

            <Link
              to="/login"
              className="primary-btn"
              style={{ textAlign: "center" }}
            >
              Volver al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form">
            <label>
              Correo del usuario
              <input
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="correo@dominio.com"
              />
            </label>

            <label>
              Número de cédula
              <input
                value={numeroCedula}
                onChange={(e) => setNumeroCedula(e.target.value)}
                placeholder="Número de cédula"
              />
            </label>

            <label>
              Nueva clave
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
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
              {loading ? "Guardando..." : "Restablecer clave"}
            </button>

            <Link
              to="/login"
              style={{
                background: "transparent",
                border: 0,
                color: "#2563eb",
                cursor: "pointer",
                padding: 0,
                textAlign: "left"
              }}
            >
              Volver al login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}


