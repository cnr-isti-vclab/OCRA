// Default runtime config for local dev; docker image will replace this at startup.
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  providerUrl: 'http://localhost:8081',
  realm: 'demo',
  issuer: 'http://localhost:8081/realms/demo',
  clientId: 'react-oauth',
  redirectUri: window.location.origin,
  scope: 'openid profile email'
};
