import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        await register({ ...form, role: "admin" });
      }
      navigate("/");
    } catch (err) {
      setError(err?.response?.data?.message || "Falha na autenticacao");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-wrap">
      <form onSubmit={submit} className="card">
        <h1>Sistema Clinico</h1>
        <p>Autenticacao segura para equipe do consultorio.</p>

        {mode === "register" && (
          <label>
            Nome
            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </label>
        )}

        <label>
          E-mail
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
          />
        </label>

        <label>
          Senha
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            required
            minLength={6}
          />
        </label>

        {error ? <p className="error">{error}</p> : null}

        <button type="submit" className="login-submit" disabled={submitting}>
          {mode === "login"
            ? submitting
              ? "Entrando..."
              : "Entrar"
            : submitting
              ? "Criando conta..."
              : "Criar conta"}
        </button>

        <button
          type="button"
          className="btn-ghost"
          disabled={submitting}
          onClick={() => setMode((prev) => (prev === "login" ? "register" : "login"))}
        >
          {mode === "login" ? "Primeiro acesso? Cadastre-se" : "Ja possui conta? Entrar"}
        </button>
      </form>
    </div>
  );
}
