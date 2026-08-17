export function parseFileNameFromContentDisposition(headerValue, fallbackName) {
  const header = String(headerValue || "");
  const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch) {
    try {
      return decodeURIComponent(encodedMatch[1].trim());
    } catch {
      return fallbackName;
    }
  }
  const match = header.match(/filename="?([^";]+)"?/i);
  return match ? match[1].trim() : fallbackName;
}

export function downloadBlob(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
