// Local setup tool. Loads .env.local using Next's own environment loader; never prints values.
require("@next/env").loadEnvConfig(process.cwd());
require("../tests/register.cjs");
const { configurationAudit } = require("../app/lib/server/configuration.ts");
console.log(JSON.stringify(configurationAudit(), null, 2));
