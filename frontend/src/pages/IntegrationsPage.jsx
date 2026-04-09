import { useEffect, useState } from "react";
import { api } from "../api";

export function IntegrationsPage() {
  const [googleUrl, setGoogleUrl] = useState("");
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

  useEffect(() => {
    loadWhatsappStatus().catch(() => null);
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
        <button type="button" onClick={loadGoogle}>Gerar URL OAuth</button>
        {googleUrl ? (
          <p>
            <a href={googleUrl} target="_blank" rel="noreferrer">Conectar Google Calendar</a>
          </p>
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
