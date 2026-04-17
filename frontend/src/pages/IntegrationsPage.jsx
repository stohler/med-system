import { useEffect, useState } from "react";
import { api } from "../api";

export function IntegrationsPage() {
  const [googleUrl, setGoogleUrl] = useState("");
  const [googleStatus, setGoogleStatus] = useState({
    connected: false,
    connectedAt: "",
    hasRefreshToken: false,
    expiresAt: "",
  });
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
      const { data } = await api.get("/integrations/google/url");
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

  const loadGoogleStatus = async () => {
    setError("");
    setSuccess("");
    try {
      const { data } = await api.get("/integrations/google/status");
      setGoogleStatus({
        connected: Boolean(data?.connected),
        connectedAt: data?.connectedAt || "",
        hasRefreshToken: Boolean(data?.hasRefreshToken),
        expiresAt: data?.expiresAt || "",
      });
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao obter status do Google");
    }
  };

  const clearGoogleConnection = () => {
    setError("");
    setSuccess("");
    api
      .post("/integrations/google/disconnect")
      .then((response) => {
        setGoogleStatus({
          connected: false,
          connectedAt: "",
          hasRefreshToken: false,
          expiresAt: "",
        });
        setSuccess(response.data?.message || "Vinculo do Google removido com sucesso.");
      })
      .catch((err) => {
        setError(err?.response?.data?.message || "Falha ao desvincular Google.");
      });
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
    loadGoogleStatus().catch(() => null);
    loadWhatsappStatus().catch(() => null);
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const oauthResult = searchParams.get("google_oauth");
    if (!oauthResult) return;

    const oauthMessage = searchParams.get("google_oauth_message") || "";
    const oauthAt = searchParams.get("google_oauth_at") || new Date().toISOString();
    if (oauthResult === "connected") {
      setSuccess(oauthMessage || "Google Calendar vinculado com sucesso.");
      setError("");
      setGoogleStatus((prev) => ({
        ...prev,
        connected: true,
        connectedAt: oauthAt,
      }));
      loadGoogleStatus().catch(() => null);
    } else {
      setError(oauthMessage || "Falha ao concluir callback do Google Calendar.");
      loadGoogleStatus().catch(() => null);
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
      if (payload.ok) {
        setSuccess(
          "Google Calendar vinculado com sucesso."
        );
        setError("");
        loadGoogleStatus().catch(() => null);
        return;
      }
      setError(payload.message || "Falha ao concluir callback do Google Calendar.");
    };

    window.addEventListener("message", handleGoogleCallbackMessage);
    return () => window.removeEventListener("message", handleGoogleCallbackMessage);
  }, []);

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
          Status: {googleStatus.connected ? "Conectado" : "Desconectado"}
        </p>
        {googleStatus.connectedAt ? (
          <p className="muted">
            Conectado em: {new Date(googleStatus.connectedAt).toLocaleString("pt-BR")}
          </p>
        ) : null}
        {googleStatus.expiresAt ? (
          <p className="muted">
            Expira em: {new Date(googleStatus.expiresAt).toLocaleString("pt-BR")}
          </p>
        ) : null}
        <div className="inline-actions">
          <button type="button" onClick={loadGoogle}>Gerar URL OAuth</button>
          <button type="button" className="btn-ghost" onClick={loadGoogleStatus}>
            Atualizar status Google
          </button>
        </div>
        {googleUrl ? (
          <button type="button" className="btn-ghost" onClick={openGoogleConnection}>
            Conectar Google Calendar
          </button>
        ) : null}
        {googleStatus.connected ? (
          <button type="button" className="btn-ghost" onClick={clearGoogleConnection}>
            Desvincular Google
          </button>
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
