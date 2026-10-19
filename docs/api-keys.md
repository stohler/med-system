# API Keys para agentes de IA (ex.: Grok Bot)

API Keys permitem que um agente externo gerencie **pacientes** e **agendamentos** pela API REST, sem usar a interface web e sem fazer login com e-mail e senha.

## Como funciona

- Somente um usuario `admin` autenticado (JWT) cria, lista e revoga chaves, via `/api/api-keys`.
- A chave e exibida **uma unica vez** na criacao. No banco fica apenas o hash SHA-256.
- Cada chave pertence a um usuario (`userId`, por padrao o admin que a criou) e herda as restricoes dele. Se o dono for um usuario `reception`, a chave so enxerga e agenda nos enderecos permitidos para esse usuario.
- Cada chave tem **escopos**. Uma chave so acessa o que foi explicitamente concedido.
- Chaves so funcionam nas rotas de pacientes, agendamentos e catalogo (enderecos e procedimentos, somente leitura). Usuarios, atendimentos, receitas, relatorios, integracoes e a propria gestao de chaves **nao** aceitam API Key.
- Na consulta de um paciente por chave, os atendimentos (evolucao clinica) e as mensagens de WhatsApp nao sao retornados.
- Requisicoes que alteram dados feitas por chave geram registro de auditoria (`api_key.request`), assim como a criacao e a revogacao (`api_key.create`, `api_key.revoke`).
- A chave pode ser revogada a qualquer momento, pode expirar (`expiresInDays`) e deixa de funcionar se o usuario dono for desativado.

## Escopos

| Escopo | Permite |
| --- | --- |
| `patients:read` | `GET /api/patients`, `GET /api/patients/:id` |
| `patients:write` | `POST /api/patients`, `PUT /api/patients/:id` |
| `patients:delete` | `DELETE /api/patients/:id` |
| `appointments:read` | `GET /api/appointments`, `POST /api/appointments/preview-message` |
| `appointments:write` | `POST /api/appointments`, `PUT /api/appointments/:id` (inclui remarcar e cancelar com `status`) |
| `appointments:delete` | `DELETE /api/appointments/:id` |
| `appointments:notify` | `POST /api/appointments/:id/send-confirmation`, `POST /api/appointments/:id/resend-template` (enviam WhatsApp ao paciente) |
| `catalog:read` | `GET /api/locations`, `GET /api/procedures` |

Para um agente de agendamento, o conjunto recomendado e `patients:read`, `patients:write`, `appointments:read`, `appointments:write` e `catalog:read`. Prefira cancelar com `status: "cancelled"` em vez de conceder `appointments:delete`.

## Criar uma chave

Autentique como admin e crie a chave:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clinica.com","password":"SENHA"}' | jq -r .token)

curl -X POST http://localhost:4000/api/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Grok Bot",
    "scopes": ["patients:read","patients:write","appointments:read","appointments:write","catalog:read"],
    "expiresInDays": 365
  }'
```

Resposta (guarde o campo `key`):

```json
{
  "apiKey": { "id": "...", "name": "Grok Bot", "prefix": "msk_AbCdEf", "scopes": ["..."] },
  "key": "msk_....",
  "warning": "Guarde esta chave agora. Ela nao sera exibida novamente."
}
```

Campos do corpo: `name` (obrigatorio), `scopes` (obrigatorio, ao menos um), `userId` (opcional), `expiresInDays` (opcional, 1 a 3650).

Recomendacao: crie um usuario dedicado ao bot (por exemplo `reception` com os enderecos permitidos) e informe o `userId` dele. Assim o bot fica limitado aos enderecos desse usuario.

Outras rotas de gestao (admin, JWT):

- `GET /api/api-keys/scopes` lista os escopos validos.
- `GET /api/api-keys` lista as chaves (sem o valor da chave).
- `DELETE /api/api-keys/:id` revoga a chave.

## Usar a chave

Envie a chave no header `X-API-Key` (ou `Authorization: Bearer msk_...`):

```bash
KEY=msk_....
API=http://localhost:4000/api

# catalogo: ids de enderecos e procedimentos
curl -H "X-API-Key: $KEY" $API/locations
curl -H "X-API-Key: $KEY" $API/procedures

# buscar paciente por nome, telefone, e-mail ou documento
curl -H "X-API-Key: $KEY" "$API/patients?q=maria&page=1&pageSize=20"

# cadastrar paciente
curl -X POST $API/patients -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"fullName":"Maria Souza","phone":"11999998888","email":"maria@example.com"}'

# agenda de um periodo (filtros opcionais: location, patient, status)
curl -H "X-API-Key: $KEY" "$API/appointments?from=2030-01-10T00:00:00.000Z&to=2030-01-11T00:00:00.000Z"

# criar agendamento (retorna 409 se houver conflito no endereco)
curl -X POST $API/appointments -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"patient":"<patientId>","location":"<locationId>","procedureType":"<procedureId>",
       "startsAt":"2030-01-10T13:00:00.000Z","endsAt":"2030-01-10T13:30:00.000Z","notes":"Agendado pelo Grok Bot"}'

# remarcar ou cancelar
curl -X PUT $API/appointments/<id> -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"status":"cancelled"}'
```

`status` aceita `scheduled`, `confirmed`, `cancelled`, `completed` e `no_show`. Datas devem estar em ISO 8601.

Erros comuns: `401` chave ausente, invalida, revogada ou expirada; `403` escopo insuficiente ou endereco nao permitido; `409` conflito de horario.

## Seguranca

- Trate a chave como senha: guarde em variavel de ambiente/secret do agente, nunca em codigo ou prompt.
- Use sempre HTTPS em producao.
- Conceda o menor conjunto de escopos possivel e defina expiracao.
- Em caso de vazamento, revogue com `DELETE /api/api-keys/:id` e crie outra chave.
