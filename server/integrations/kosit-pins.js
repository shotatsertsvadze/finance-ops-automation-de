/**
 * The KoSIT validator and XRechnung configuration this application is built
 * and tested against (ADR-078). Fetched and verified by `npm run kosit:fetch`,
 * started by `npm run kosit`; every report is checked against `engine` and
 * `rules`, so a daemon running anything else fails closed. Upgrading means
 * changing this file, re-running the fixtures and the demo, and an ADR.
 */
export const KOSIT_PINS = {
  validator: {
    version: "1.6.3",
    engine: "KoSIT Validator 1.6.3",
    file: "validator-1.6.3-standalone.jar",
    url: "https://github.com/itplr-kosit/validator/releases/download/v1.6.3/validator-1.6.3-standalone.jar",
    sha256: "799e64befca97d4080e03608c80b85dd5a5ecc5f4ae4f35d1116ec2855b9a7c9",
  },
  configuration: {
    version: "xrechnung-3.0.2-validator-configuration-2026-08-31",
    file: "xrechnung-3.0.2-validator-configuration-2026-08-31.zip",
    url: "https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/v2026-08-31/xrechnung-3.0.2-validator-configuration-2026-08-31.zip",
    sha256: "2530cd107c414511c5d0462ec10f886910395abfca820db82e83d70bf01221a8",
    // The rule sets this configuration bundles, as its scenarios name them.
    rules: ["xrechnung-3.0.2-schematron-2.6.0", "en16931-ubl-1.3.16"],
  },
};
