// Rauthy OIDC Authentication Module for Nakama

const RAUTHY_ISSUER = "https://tangleweave_rauthy:8443";
const RAUTHY_JWKS_URL = "https://tangleweave_rauthy:8443/auth/v1/oidc/certs";
const RAUTHY_CLIENT_ID = "unwind-game";

function InitModule(ctx, logger, nk) {
  logger.info('Rauthy OIDC Auth Module loaded');
  logger.info('Issuer: ' + RAUTHY_ISSUER);
  logger.info('JWKS URL: ' + RAUTHY_JWKS_URL);
  logger.info('Client ID: ' + RAUTHY_CLIENT_ID);
  logger.info('Module ready for OIDC authentication');
  logger.info('Use authenticate_custom with external_id = rauthy:<user_sub>');
}
