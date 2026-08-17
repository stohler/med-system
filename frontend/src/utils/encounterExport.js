import { api } from "../api";
import { downloadBlob, parseFileNameFromContentDisposition } from "./downloadFile";

export async function exportEncounterPdf(encounterId) {
  const response = await api.get(`/encounters/${encounterId}/pdf`, {
    responseType: "blob",
  });
  const fileName = parseFileNameFromContentDisposition(
    response.headers?.["content-disposition"],
    `atendimento-${encounterId}.pdf`
  );
  downloadBlob(response.data, fileName);
}
