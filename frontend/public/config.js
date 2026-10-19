// Default runtime config for local dev; docker image will replace this at startup.
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
  issuer: 'https://aai-demo.egi.eu/auth/realms/egi',
  clientId: 'b5998dc7-d012-4e12-a800-16e3bdf3d3c5',
  redirectUri: 'http://localhost:3001',
  scope: 'openid voperson_id email profile entitlements',
  showEccchDebugOperations: true,
  showThreePresenterDebug: true
};
