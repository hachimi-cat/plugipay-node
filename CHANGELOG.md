# Changelog

## 0.8.0
- `client.api.<area><Action>(...)`: every Plugipay feature route, one method each, generated from the API spec (`scripts/apigen.sh`). Signed like every other request, with an idempotency key on writes.
- `apiKey` option: a key minted in the dashboard (`pk_live_…` / `pk_test_…`) is sent as `Authorization: Bearer <key>`; `keyId` + `secret` are now optional when `apiKey` is given.
- The API now takes a key on every customer feature (billing summary, the dashboard figures, workspaces list, uploads, …). Person-only (403 person_only with a key): `apiKeys.*`, `account.*`, `workspaces.create/update/delete`; `adminPortal.*` is for Plugipay's operators.
- A test checks every hand-written method's route against the API spec (`backend/openapi.json`).

## 0.7.2
- `request()` treats a 204 / empty-body response as void instead of throwing `invalid_response`. Every backend DELETE answers 204, so `webhookEndpoints.delete`, `templates.delete`, `workspaces.delete`, `apiKeys.revoke` and raw `request({ method: 'DELETE', … })` calls were all broken before this.

## 0.7.1
- Package metadata now points at the public mirror repo (github.com/hachimi-cat/plugipay-node).

## 0.7.0
- Full resource coverage as first tracked release.
