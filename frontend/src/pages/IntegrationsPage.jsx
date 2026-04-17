import { useEffect, useState } from "react";
import { api } from "../api";

const GOOGLE_TOKENS_STORAGE_KEY = "google_calendar_tokens";
const GOOGLE_CONNECTION_META_KEY = "google_calendar_connection_meta";

function parseGoogleTokens(rawValue) {
  if (!rawValue) return null;
  try {
    return JSON.parse(rawValue);
  } catch (_error) {
    return null;
  }
}

function parseGoogleConnectionMeta(rawValue) {
  if (!rawValue) return null;
  try {
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      connected: Boolean(parsed.connected),
      connectedAt: parsed.connectedAt ? String(parsed.connectedAt) : "",
      source: parsed.source ? String(parsed.source) : "",
    };
  } catch (_error) {
    return null;
  }
}

function getGoogleConnectionStatus(tokensText, connectionMeta) {
  const tokens = parseGoogleTokens(tokensText);
  const fallbackConnected = Boolean(connectionMeta?.connected);
  const fallbackConnectedAt = connectionMeta?.connectedAt
    ? new Date(connectionMeta.connectedAt).toLocaleString("pt-BR")
    : "";

  if (!tokens && fallbackConnected) {
    return {
      connected: true,
      label: "Conectado",
      details: fallbackConnectedAt
        ? `Conexao concluida em ${fallbackConnectedAt}`
        : "Conexao OAuth concluida.",
    };
  }

  if (!tokens) return { connected: false, label: "Desconectado", details: "" };

  const expiresAtMs = Number(tokens.expiry_date || 0);
  const hasRefreshToken = Boolean(tokens.refresh_token);
  const hasAccessToken = Boolean(tokens.access_token);
  const isExpired = expiresAtMs > 0 ? Date.now() >= expiresAtMs : false;

  if ((hasRefreshToken || hasAccessToken) && !isExpired) {
    const details =
      expiresAtMs > 0
        ? `Token expira em ${new Date(expiresAtMs).toLocaleString("pt-BR")}`
        : hasRefreshToken
          ? "Token com refresh ativo."
          : "";
    return { connected: true, label: "Conectado", details };
  }

  if (hasRefreshToken && isExpired) {
    return {
      connected: true,
      label: "Conectado",
      details: "Access token expirado, mas refresh token disponivel.",
    };
  }

  return { connected: false, label: "Desconectado", details: "Token invalido ou expirado." };
}

export function IntegrationsPage() {
  const [googleUrl, setGoogleUrl] = useState("");
  const [googleTokens, setGoogleTokens] = useState(
    () => localStorage.getItem(GOOGLE_TOKENS_STORAGE_KEY) || ""
  );
  const [googleConnectionMeta, setGoogleConnectionMeta] = useState(() =>
    parseGoogleConnectionMeta(localStorage.getItem(GOOGLE_CONNECTION_META_KEY))
  );
  const [whatsapp, setWhatsapp] = useState(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [testPhone, setTestPhone] = useState("");
  const [testText, setTestText] = useState("Teste de envio do sistema clinico.");
  const [success, setSuccess] = useState("");

  const loadGoogle = async () => {
    setError("");
    setSuccess("");
    try {
      const { data } = await api.get("/integrations/google/url", {
        params: { state: `clinic-system|origin:${window.location.origin}` },
      });
      setGoogleUrl(data.url || "");
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao obter URL Google");
    }
  };

  const loadWhatsappStatus = async () => {
    setError("");
    setSuccess("");
    try {
      const { data } = await api.get("/integrations/whatsapp/status");
      setWhatsapp(data);
    } catch (err) {
      setError(err?.response?.data?.message || "Falha no status WhatsApp");
    }
  };

  const loadWhatsappQr = async () => {
    setError("");
    setSuccess("");
    try {
      const { data } = await api.get("/integrations/whatsapp/qr");
      setQr(data.qrCodeDataUrl || "");
      setWhatsapp((prev) => ({
        ...(prev || {}),
        ...(data.status || {}),
      }));
      if (!data.qrCodeDataUrl && data.reason) {
        setSuccess(data.reason);
      }
    } catch (err) {
      const reason = err?.response?.data?.reason;
      setError(reason || err?.response?.data?.message || "Falha ao gerar QR Code");
      setWhatsapp(err?.response?.data?.status || null);
      setQr("");
    }
  };

  const sendTestMessage = async () => {
    setError("");
    setSuccess("");
    try {
      const { data } = await api.post("/integrations/whatsapp/test-message", {
        phone: testPhone,
        text: testText,
      });
      setSuccess(data.message || "Mensagem de teste enviada.");
      await loadWhatsappStatus();
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao enviar mensagem de teste");
    }
  };

  const restartWhatsApp = async () => {
    setError("");
    setSuccess("");
    try {
      const { data } = await api.post("/integrations/whatsapp/restart");
      setSuccess(data.message || "Cliente WhatsApp reiniciado.");
      setWhatsapp(data.status || null);
      setQr("");
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao reiniciar cliente WhatsApp");
    }
  };

  const resetWhatsAppSession = async () => {
    setError("");
    setSuccess("");
    try {
      const { data } = await api.post("/integrations/whatsapp/reset-session");
      setSuccess(
        data.message ||
          "Sessao WhatsApp resetada. Gere um novo QR Code para reconectar."
      );
      setWhatsapp(data.status || null);
      setQr("");
      if (data.warnings?.length) {
        setSuccess(`${data.message} Avisos: ${data.warnings.length}.`);
      }
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao resetar sessao WhatsApp");
    }
  };

  const copyGoogleTokens = async () => {
    if (!googleTokens) return;
    try {
      await navigator.clipboard.writeText(googleTokens);
      setSuccess("Tokens do Google copiados para a area de transferencia.");
    } catch (_error) {
      setError("Nao foi possivel copiar automaticamente. Copie manualmente o texto.");
    }
  };

  const clearGoogleConnection = () => {
    localStorage.removeItem(GOOGLE_TOKENS_STORAGE_KEY);
    localStorage.removeItem(GOOGLE_CONNECTION_META_KEY);
    setGoogleTokens("");
    setGoogleConnectionMeta(null);
    setSuccess("Vinculo do Google removido nesta sessao.");
  };

  const openGoogleConnection = () => {
    if (!googleUrl) {
      setError("Gere a URL OAuth antes de conectar.");
      return;
    }
    const popup = window.open(googleUrl, "google-calendar-oauth", "width=640,height=760");
    if (!popup) {
      window.location.href = googleUrl;
      return;
    }
    popup.focus();
  };

  useEffect(() => {
    loadWhatsappStatus().catch(() => null);
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const oauthResult = searchParams.get("google_oauth");
    if (!oauthResult) return;

    const oauthMessage = searchParams.get("google_oauth_message") || "";
    const oauthAt = searchParams.get("google_oauth_at") || new Date().toISOString();
    if (oauthResult === "connected") {
      const nextMeta = {
        connected: true,
        connectedAt: oauthAt,
        source: "callback_redirect",
      };
      setGoogleConnectionMeta(nextMeta);
      localStorage.setItem(GOOGLE_CONNECTION_META_KEY, JSON.stringify(nextMeta));
      setSuccess(oauthMessage || "Google Calendar vinculado com sucesso.");
      setError("");
    } else {
      setError(oauthMessage || "Falha ao concluir callback do Google Calendar.");
    }

    const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }, []);

  useEffect(() => {
    const allowedOrigins = new Set();
    try {
      const apiOrigin = new URL(
        String(api.defaults.baseURL || ""),
        window.location.origin
      ).origin;
      allowedOrigins.add(apiOrigin);
    } catch (_error) {
      // ignore parse failures
    }

    const handleGoogleCallbackMessage = (event) => {
      const data = event?.data || {};
      if (allowedOrigins.size > 0 && !allowedOrigins.has(event.origin)) return;
      if (data.source !== "med-google-oauth") return;
      const payload = data.payload || {};
      if (payload.ok && payload.tokens) {
        const serialized = JSON.stringify(payload.tokens, null, 2);
        setGoogleTokens(serialized);
        localStorage.setItem(GOOGLE_TOKENS_STORAGE_KEY, serialized);
        const nextMeta = {
          connected: true,
          connectedAt: new Date().toISOString(),
          source: "post_message",
        };
        setGoogleConnectionMeta(nextMeta);
        localStorage.setItem(GOOGLE_CONNECTION_META_KEY, JSON.stringify(nextMeta));
        setSuccess(
          "Google Calendar vinculado. Tokens recebidos no frontend para uso nas chamadas de agendamento."
        );
        setError("");
        return;
      }
      setError(payload.message || "Falha ao concluir callback do Google Calendar.");
    };

    window.addEventListener("message", handleGoogleCallbackMessage);
    return () => window.removeEventListener("message", handleGoogleCallbackMessage);
  }, []);

  useEffect(() => {
    if (!googleTokens) return;
    localStorage.setItem(GOOGLE_TOKENS_STORAGE_KEY, googleTokens);
  }, [googleTokens]);

  const googleStatus = getGoogleConnectionStatus(googleTokens, googleConnectionMeta);

  useEffect(() => {
    if (!whatsapp || whatsapp.ready) return undefined;
    const timer = setInterval(() => {
      loadWhatsappStatus().catch(() => null);
    }, 4000);
    return () => clearInterval(timer);
  }, [whatsapp?.ready, whatsapp?.connectionState]);

  return (
    <section className="stack">
      <h2>Integracoes</h2>

      <div className="card">
        <h3>Google Agenda</h3>
        <p className={googleStatus.connected ? "success" : "error"}>
          Status: {googleStatus.label}
        </p>
        {googleStatus.details ? <p className="muted">{googleStatus.details}</p> : null}
        <button type="button" onClick={loadGoogle}>Gerar URL OAuth</button>
        {googleUrl ? (
          <button type="button" className="btn-ghost" onClick={openGoogleConnection}>
            Conectar Google Calendar
          </button>
        ) : null}
        {googleTokens ? (
          <div className="form-grid">
            <label>
              Tokens recebidos no callback
              <textarea value={googleTokens} readOnly />
            </label>
            <button type="button" className="btn-ghost" onClick={copyGoogleTokens}>
              Copiar tokens
            </button>
            <button type="button" className="btn-ghost" onClick={clearGoogleConnection}>
              Desvincular Google
            </button>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h3>WhatsApp Business / Web</h3>
        <div className="inline-actions">
          <button type="button" onClick={loadWhatsappStatus}>Atualizar status</button>
          <button type="button" onClick={loadWhatsappQr}>Gerar QR Code</button>
          <button type="button" className="btn-ghost" onClick={restartWhatsApp}>Reiniciar sessao</button>
          <button type="button" className="btn-ghost" onClick={resetWhatsAppSession}>Resetar sessao (limpar dados)</button>
        </div>
        {whatsapp ? (
          <p>
            Modo: {whatsapp.mode} | Pronto: {String(whatsapp.ready)} | QR pendente: {String(whatsapp.hasQr)} | Estado: {whatsapp.connectionState || "desconhecido"}
          </p>
        ) : null}
        {whatsapp?.lastError ? <p className="muted">{whatsapp.lastError}</p> : null}
        {qr ? <img src={qr} alt="QR Code WhatsApp" className="qr" /> : null}

        <div className="form-grid">
          <h4>Teste de envio</h4>
          <label>
            Numero (com DDI e DDD)
            <input
              placeholder="5511999999999"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
            />
          </label>
          <label>
            Mensagem
            <input value={testText} onChange={(e) => setTestText(e.target.value)} />
          </label>
          <button type="button" onClick={sendTestMessage} disabled={!testPhone.trim()}>
            Enviar mensagem de teste
          </button>
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {success ? <p className="success">{success}</p> : null}
    </section>
  );
}
