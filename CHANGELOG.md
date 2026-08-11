# Changelog

## 0.7.2
- `request()` treats a 204 / empty-body response as void instead of throwing `invalid_response`. Every backend DELETE answers 204, so `webhookEndpoints.delete`, `templates.delete`, `workspaces.delete`, `apiKeys.revoke` and raw `request({ method: 'DELETE', … })` calls were all broken before this.

## 0.7.1
- Package metadata now points at the public mirror repo (github.com/hachimi-cat/plugipay-node).

## 0.7.0
- Full resource coverage as first tracked release.
