const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("node:crypto");
const fs = require("node:fs");
const { NextRequest, NextResponse } = require("next/server");
const {
  isLegacyAuthSelected,
  privyEnabled,
  privySetupMessage,
} = require("../app/lib/identity/config.ts");
const { configurationAudit } = require("../app/lib/server/configuration.ts");
const { novaSchemaStatus } = require("../app/lib/server/readiness.ts");
const { missingSchema } = require("../app/lib/setup-errors.ts");
const {
  CapabilityRegistry,
  validateField,
} = require("../app/lib/server/nova-launch/capabilities.ts");
const {
  createCapabilityPlan,
  verifyCapabilityPlan,
  requirePlanExecution,
} = require("../app/lib/server/nova-launch/planner.ts");
const { canonical } = require("../app/lib/server/nova-launch/plans.ts");
const {
  dexterPlanningDemo,
  planningDemoPrompt,
} = require("../app/lib/server/nova-launch/planning-demo.ts");
const access = require("../app/lib/server/nova-launch/access.ts");
const { ADDRESS } = require("./chain-fixtures.cjs");
const owner = randomUUID(),
  conversation = randomUUID(),
  registry = new CapabilityRegistry(true);
const one = () => ({
  objective: "Read my balance",
  steps: [
    {
      id: "balance",
      capabilityId: "portfolio.read",
      provider: "solana",
      inputs: { address: ADDRESS },
      dependencies: [],
    },
  ],
});

test("Privy is primary; missing/unknown selection never falls back to password signup", () => {
  assert.equal(privyEnabled, true);
  for (const mode of [undefined, "", "privy", "misspelled"])
    assert.equal(isLegacyAuthSelected(mode, "true", "development"), false);
  assert.equal(isLegacyAuthSelected("supabase", undefined, "development"), false);
});
test("legacy auth requires explicit development switches and is impossible in production", () => {
  assert.equal(isLegacyAuthSelected("supabase", "true", "development"), true);
  assert.equal(isLegacyAuthSelected("supabase", "true", "production"), false);
});
test("unconfigured Privy renders a bounded setup context without initializing the SDK", () => {
  assert.match(privySetupMessage, /not configured/);
  const source = fs.readFileSync("app/components/identity/LaunchAuth.tsx", "utf8");
  assert.match(source, /privyEnabled && !process.env.NEXT_PUBLIC_PRIVY_APP_ID/);
  assert.match(source, /error: privySetupMessage/);
  assert.match(source, /initialized: false/);
  assert.doesNotMatch(fs.readFileSync("next.config.js", "utf8"), /fixtures|privy-react/);
});
test("configuration audit exposes names, not values; optional providers do not crash", () => {
  const audit = configurationAudit({
    GOOGLE_API_KEY: "never-print-this",
    SOLANA_RPC_URL: "bad-url",
  });
  assert.ok(audit.required.auth.includes("PRIVY_APP_SECRET"));
  assert.deepEqual(audit.invalid, ["SOLANA_RPC_URL"]);
  assert.ok(!JSON.stringify(audit).includes("never-print-this"));
  assert.equal(audit.executionEnabled, false);
});
test("missing schema returns one controlled 503 with no retry or mutation", async () => {
  let calls = 0;
  const response = await novaSchemaStatus({
    rpc: (name) => ({
      abortSignal: async (signal) => {
        assert.ok(signal instanceof AbortSignal);
        calls++;
        assert.equal(name, "nova_launch_readiness");
        return { error: { code: "PGRST202", message: "private raw sql" } };
      },
    }),
  });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "database_migration_required");
  assert.equal(calls, 1);
});
test("schema version, incomplete schema and network outages fail safely", async () => {
  for (const data of [
    { version: 1, ready: true },
    { version: 2, ready: false },
  ])
    assert.equal(
      (await novaSchemaStatus({ rpc: () => ({ abortSignal: async () => ({ data }) }) })).status,
      503,
    );
  assert.equal(
    await novaSchemaStatus({
      rpc: () => ({ abortSignal: async () => ({ data: { version: 2, ready: true } }) }),
    }),
    null,
  );
  const failure = await novaSchemaStatus({
    rpc: () => ({
      abortSignal: async () => {
        throw new Error("secret transport string");
      },
    }),
  });
  assert.equal((await failure.json()).code, "database_configuration");
  assert.ok(missingSchema({ code: "42P01" }));
  assert.equal(missingSchema({ code: "23505" }), false);
});
test("missing identity migration prevents provisioning and returns setup state, not auth redirect", async (t) => {
  const provider = require("../app/lib/server/identity/privy.ts").privyIdentityProvider;
  const service = require("../app/lib/server/supabase-service.ts");
  const old = { id: process.env.NEXT_PUBLIC_PRIVY_APP_ID, secret: process.env.PRIVY_APP_SECRET };
  process.env.NEXT_PUBLIC_PRIVY_APP_ID = "fixture";
  process.env.PRIVY_APP_SECRET = "fixture";
  t.after(() => {
    for (const [key, value] of [
      ["NEXT_PUBLIC_PRIVY_APP_ID", old.id],
      ["PRIVY_APP_SECRET", old.secret],
    ])
      value === undefined ? delete process.env[key] : (process.env[key] = value);
  });
  t.mock.method(provider, "verify", async () => ({
    user_id: "did:privy:test",
    session_id: "test",
    expiration: Date.now() / 1000 + 100,
  }));
  t.mock.method(provider, "user", async () => {
    throw new Error("must not load or create a wallet");
  });
  const q = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    maybeSingle: async () => ({ error: { code: "42P01" } }),
  };
  t.mock.method(service, "getServiceRoleClient", () => ({ from: () => q }));
  const response = await require("../app/lib/server/identity/access.ts").requireSynqUser(
    new NextRequest("http://localhost/api/nova/session", {
      headers: { Authorization: "Bearer fixture" },
    }),
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("location"), null);
  assert.equal((await response.json()).code, "database_migration_required");
});
test("registry contains unique fixed capabilities, schemas and provider metadata", () => {
  assert.equal(new Set(registry.list().map((c) => c.id)).size, registry.list().length);
  assert.equal(registry.resolve("portfolio.read", "solana").riskLevel, "READ");
  assert.equal(registry.resolve("swap.quote", "jupiter").requiresApproval, true);
  assert.equal(registry.provider("clawpump").implemented, false);
  assert.ok(Object.isFrozen(registry.resolve("swap.execute", "jupiter", true)));
});
test("disabled capabilities and wrong provider resolution fail closed", () => {
  for (const capability of registry.list().filter((c) => c.stateChanging)) {
    assert.equal(capability.enabled, false);
    assert.equal(capability.requiresWalletSignature, true);
    assert.throws(() => registry.resolve(capability.id, capability.providers[0]), /unavailable/);
  }
  assert.throws(() => registry.resolve("portfolio.read", "clawpump"), /Unsupported/);
  assert.throws(
    () => new CapabilityRegistry(false).resolve("portfolio.read", "solana"),
    /unavailable/,
  );
});
test("schema validation rejects bad addresses, precision, amounts and unbounded inputs", () => {
  for (const value of ["0", "-1", "1.0000000001", "1e10"])
    assert.throws(() => validateField({ type: "decimal" }, value));
  assert.throws(() => validateField({ type: "address" }, "fake"));
  assert.throws(() => validateField({ type: "percent" }, 101));
  assert.throws(() => validateField({ type: "integer" }, 121));
  assert.throws(() => validateField({ type: "addresses" }, [ADDRESS, ADDRESS]));
  assert.equal(validateField({ type: "decimal" }, "2.5"), "2.5");
});
test("single-step planner validates input and binds the graph to owner and conversation", () => {
  const plan = createCapabilityPlan(owner, conversation, one(), registry);
  assert.equal(plan.status, "validated");
  assert.equal(plan.executionEnabled, false);
  assert.equal(plan.steps[0].requiresApproval, false);
  verifyCapabilityPlan(plan, owner, conversation);
  assert.throws(() => verifyCapabilityPlan(plan, randomUUID(), conversation));
  assert.throws(() => verifyCapabilityPlan(plan, owner, randomUUID()));
});
test("cross-protocol demo orders seven dependencies and declares unobserved artifacts", () => {
  const plan = dexterPlanningDemo(owner, conversation);
  assert.equal(plan.steps.length, 7);
  assert.equal(plan.status, "draft");
  assert.deepEqual(
    plan.steps.map((s) => s.id),
    ["launch", "buy", "balance", "distribute", "lock", "verify", "report"],
  );
  assert.equal(plan.steps[3].inputs.totalPercent, 5);
  assert.equal(plan.steps[4].inputs.durationMonths, 6);
  assert.ok(
    plan.steps.every((s) => s.status === "execution_disabled" && !Object.keys(s.artifacts).length),
  );
  verifyCapabilityPlan(plan, owner, conversation);
});
test("missing and circular dependencies are rejected", () => {
  const missing = one();
  missing.steps[0].dependencies = ["unknown"];
  assert.throws(() => createCapabilityPlan(owner, conversation, missing, registry), /Unknown/);
  const cycle = one();
  cycle.steps[0].dependencies = ["balance"];
  assert.throws(() => createCapabilityPlan(owner, conversation, cycle, registry), /Circular/);
});
test("artifact references must have declared dependencies and compatible output types", () => {
  const p = one();
  p.steps.push({
    id: "second",
    capabilityId: "token.inspect",
    provider: "solana",
    inputs: { mint: { stepId: "balance", artifact: "balance" } },
    dependencies: ["balance"],
  });
  assert.throws(() => createCapabilityPlan(owner, conversation, p, registry), /incompatible/);
  p.steps[1].inputs.mint.artifact = "address";
  p.steps[1].dependencies = [];
  assert.throws(
    () => createCapabilityPlan(owner, conversation, p, registry),
    /declared dependency/,
  );
});
test("duplicate steps, extra inputs and unsupported capabilities are rejected", () => {
  const p = one();
  p.steps.push(p.steps[0]);
  assert.throws(() => createCapabilityPlan(owner, conversation, p, registry), /duplicate/);
  const q = one();
  q.steps[0].inputs.signer = "malicious";
  assert.throws(() => createCapabilityPlan(owner, conversation, q, registry), /server-controlled/);
  q.steps[0].inputs = {};
  q.steps[0].capabilityId = "arbitrary.execute";
  assert.throws(() => createCapabilityPlan(owner, conversation, q, registry), /Unsupported/);
});
test("model cannot override risk, approval, signing, provider enablement or demo permission", () => {
  for (const field of [
    "riskLevel",
    "requiresApproval",
    "requiresWalletSignature",
    "enabled",
    "status",
  ]) {
    const p = one();
    p.steps[0][field] = false;
    assert.throws(
      () => createCapabilityPlan(owner, conversation, p, registry),
      /server-controlled/,
    );
  }
  assert.throws(
    () => createCapabilityPlan(owner, conversation, { ...one(), demonstration: true }, registry),
    /server-controlled/,
  );
  assert.throws(
    () =>
      createCapabilityPlan(
        owner,
        conversation,
        {
          objective: "launch",
          steps: [
            {
              id: "launch",
              capabilityId: "token.launch",
              provider: "clawpump",
              inputs: { symbol: "DEXTER", venue: "pump.fun" },
              dependencies: [],
            },
          ],
        },
        registry,
      ),
    /unavailable/,
  );
});
test("graph mutation changes canonical hash and invalidates review identity", () => {
  const plan = dexterPlanningDemo(owner, conversation),
    changed = structuredClone(plan);
  changed.steps[1].inputs.amountSol = "3";
  assert.throws(() => verifyCapabilityPlan(changed, owner, conversation), /changed/);
  const { hash: _, ...body } = changed;
  assert.notEqual(createHash("sha256").update(canonical(body)).digest("hex"), plan.hash);
});
test("recomputed hashes cannot downgrade fixed policy or invent completed evidence", () => {
  const p = dexterPlanningDemo(owner, conversation);
  p.steps[0].requiresWalletSignature = false;
  const { hash: _, ...body } = p;
  p.hash = createHash("sha256").update(canonical(body)).digest("hex");
  assert.throws(() => verifyCapabilityPlan(p, owner, conversation), /policy/);
});
test("expired and forged completed plans cannot pass validation", () => {
  for (const mutate of [
    (p) => (p.expiresAt = "2020-01-01"),
    (p) => (p.status = "completed"),
    (p) => (p.executionEnabled = true),
  ]) {
    const p = dexterPlanningDemo(owner, conversation);
    mutate(p);
    const { hash: _, ...body } = p;
    p.hash = createHash("sha256").update(canonical(body)).digest("hex");
    assert.throws(() => verifyCapabilityPlan(p, owner, conversation));
  }
});
test("execution guard has no capability exception, signer, builder or submission path", () => {
  assert.throws(() => requirePlanExecution(), /not enabled/);
  for (const file of ["planner.ts", "planning-demo.ts", "capabilities.ts"]) {
    const source = fs.readFileSync(`app/lib/server/nova-launch/${file}`, "utf8");
    assert.doesNotMatch(
      source,
      /signTransaction|sendTransaction|sendRawTransaction|privateKey|secretKey|Keypair|fetch\(/,
    );
  }
});
test("planning metadata route is authenticated and never exposes execution", async (t) => {
  const route = require("../app/api/nova/planning/route.ts");
  const request = new NextRequest("http://localhost/api/nova/planning");
  t.mock.method(access, "launchAccess", async () =>
    NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  );
  assert.equal((await route.GET(request)).status, 401);
});
test("demo message persists a graph block only; no action approval row or model/provider call", async (t) => {
  const route = require("../app/api/nova/message/route.ts");
  const model = require("../app/lib/server/nova-launch/model.ts");
  t.mock.method(model, "getNovaModelProvider", () => {
    throw new Error("demo must never call providers");
  });
  const calls = [];
  const q = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    neq() {
      return this;
    },
    order() {
      return this;
    },
    limit: async () => ({ data: [] }),
  };
  t.mock.method(access, "launchAccess", async () => ({
    user: { id: owner },
    db: {
      from: () => q,
      rpc: async (name, args) => {
        calls.push(args);
        return { error: null };
      },
    },
  }));
  const response = await route.POST(
    new NextRequest("http://localhost/api/nova/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: conversation,
        requestId: randomUUID(),
        text: planningDemoPrompt,
      }),
    }),
  );
  const events = (await response.text()).trim().split("\n").map(JSON.parse);
  assert.equal(events.at(-1).blocks[0].type, "capability_plan");
  assert.equal(calls.at(-1).p_plan, null);
  assert.equal(calls.at(-1).p_blocks[0].plan.ownerId, owner);
});
