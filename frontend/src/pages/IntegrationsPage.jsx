import { useState } from "react";
import { api } from "../api";

export function IntegrationsPage() {
  const [googleUrl, setGoogleUrl] = useState("");
  const [whatsapp, setWhatsapp] = useState(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");

  const loadGoogle = async () => {
    setError("");
    try {
      const { data } = await api.get("/integrations/google/url");
      setGoogleUrl(data.url || "");
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao obter URL Google");
    }
  };

  const loadWhatsappStatus = async () => {
    setError("");
    try {
      const { data } = await api.get("/integrations/whatsapp/status");
      setWhatsapp(data);
    } catch (err) {
      setError(err?.response?.data?.message || "Falha no status WhatsApp");
    }
  };

  const loadWhatsappQr = async () => {
    setError("");
    try {
      const { data } = await api.get("/integrations/whatsapp/qr");
      setQr(data.qrCodeDataUrl || "");
    } catch (err) {
      setError(err?.response?.data?.message || "Falha ao gerar QR Code");
    }
  };

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
        </div>
        {whatsapp ? (
          <p>
            Modo: {whatsapp.mode} | Pronto: {String(whatsapp.ready)} | QR pendente: {String(whatsapp.hasQr)}
          </p>
        ) : null}
        {qr ? <img src={qr} alt="QR Code WhatsApp" className="qr" /> : null}
      </div>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
