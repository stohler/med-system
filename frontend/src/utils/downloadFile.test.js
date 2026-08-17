import { parseFileNameFromContentDisposition } from "./downloadFile";

describe("parseFileNameFromContentDisposition", () => {
  it("le o nome do arquivo entre aspas", () => {
    expect(
      parseFileNameFromContentDisposition(
        'attachment; filename="atendimento-maria-souza-2026-03-10.pdf"',
        "fallback.pdf"
      )
    ).toBe("atendimento-maria-souza-2026-03-10.pdf");
  });

  it("le o nome do arquivo sem aspas", () => {
    expect(
      parseFileNameFromContentDisposition(
        "attachment; filename=atendimento.pdf",
        "fallback.pdf"
      )
    ).toBe("atendimento.pdf");
  });

  it("decodifica nome de arquivo em UTF-8", () => {
    expect(
      parseFileNameFromContentDisposition(
        "attachment; filename*=UTF-8''atendimento-jo%C3%A3o.pdf",
        "fallback.pdf"
      )
    ).toBe("atendimento-joão.pdf");
  });

  it("usa o fallback quando o header esta ausente", () => {
    expect(parseFileNameFromContentDisposition(undefined, "fallback.pdf")).toBe(
      "fallback.pdf"
    );
  });
});
