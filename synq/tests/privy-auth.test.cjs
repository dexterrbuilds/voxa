const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { NextRequest, NextResponse } = require("next/server");
const { embeddedWallet, novaWalletContext } = require("../app/lib/identity/wallet.ts");
const { ADDRESS, MINT } = require("./chain-fixtures.cjs");
const provider = require("../app/lib/server/identity/privy.ts").privyIdentityProvider;
const service = require("../app/lib/server/supabase-service.ts");
const rls = require("../app/lib/server/identity/rls.ts");
const { requireSynqUser } = require("../app/lib/server/identity/access.ts");
const owned = { address: ADDRESS, chain: "solana", provider: "privy", access: ["read", "propose"] };
const linked = {
  type: "wallet",
  chain_type: "solana",
  wallet_client_type: "privy",
  address: ADDRESS,
  wallet_index: 0,
};
const req = (token = "fixture") =>
  new NextRequest("http://localhost/api/nova/session", {
    headers: token
      ? { Authorization: `Bearer ${token}`, "X-User-Id": "attacker", "X-Wallet-Address": MINT }
      : {},
  });
function env(t, key, value) {
  const old = process.env[key];
  process.env[key] = value;
  t.after(() => {
    if (old === undefined) delete process.env[key];
    else process.env[key] = old;
  });
}
function setup(t) {
  env(t, "PRIVY_APP_SECRET", "fixture-only");
  env(t, "NEXT_PUBLIC_PRIVY_APP_ID", "fixture-app");
  const state = {
    id: randomUUID(),
    wallet: null,
    revoked: false,
    subject: "did:privy:alice",
    profiles: [],
    resolves: [],
    reads: [],
  };
  t.mock.method(provider, "verify", async () => ({
    user_id: state.subject,
    session_id: "session-a",
    expiration: Date.now() / 1000 + 300,
  }));
  t.mock.method(provider, "user", async (id) => {
    state.profiles.push(id);
    return { id, linked_accounts: [linked] };
  });
  t.mock.method(rls, "ownerDatabase", async (id) => {
    state.reads.push(id);
    return { rlsOwner: id };
  });
  t.mock.method(service, "getServiceRoleClient", () => ({
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({
          data:
            table === "synq_revoked_sessions"
              ? state.revoked
                ? { session_id: "session-a" }
                : null
              : { wallet_address: state.wallet },
        }),
      };
    },
    async rpc(name, args) {
      state.resolves.push(args);
      state.wallet ||= args.p_wallet;
      return { data: { id: state.id, wallet_address: state.wallet } };
    },
  }));
  return state;
}
test("embedded wallet selection excludes external/imported/EVM wallets and rejects ambiguity", () => {
  assert.equal(embeddedWallet([linked]), ADDRESS);
  assert.equal(embeddedWallet([{ ...linked, wallet_client_type: "phantom" }]), null);
  assert.equal(embeddedWallet([{ ...linked, chain_type: "ethereum" }]), null);
  assert.equal(embeddedWallet([{ ...linked, imported: true }]), null);
  assert.throws(() => embeddedWallet([linked, { ...linked, address: MINT }]), /ambiguous/);
  assert.throws(() => embeddedWallet([{ ...linked, address: MINT }], ADDRESS), /changed/);
  assert.equal(
    embeddedWallet([linked, { ...linked, address: MINT, wallet_index: 1 }], ADDRESS),
    ADDRESS,
  );
});
test("default wallet is read/propose only; inspected address never changes ownership", () => {
  assert.deepEqual(novaWalletContext(owned, null).access, ["read", "propose"]);
  assert.deepEqual(
    novaWalletContext(owned, { kind: "watch", address: MINT, access: ["execute"] }).access,
    ["read"],
  );
  assert.equal(owned.address, ADDRESS);
  assert.throws(
    () => novaWalletContext(owned, { kind: "wallet", address: MINT }),
    /wallet_not_owned/,
  );
  assert.throws(
    () => novaWalletContext(null, { kind: "wallet", address: ADDRESS }),
    /wallet_not_owned/,
  );
  assert.throws(() => novaWalletContext(owned, { kind: "trading", address: ADDRESS }), /invalid/);
  assert.throws(() => novaWalletContext(owned, { kind: "watch", address: "forged" }));
});
test("missing bearer, forged token and expired sessions fail before any data access", async (t) => {
  const state = setup(t);
  assert.equal((await requireSynqUser(req(null))).status, 401);
  t.mock.method(provider, "verify", async () => {
    throw new Error("private verifier detail");
  });
  const forged = await requireSynqUser(req("forged"));
  assert.equal(forged.status, 401);
  assert.equal((await forged.text()).includes("private verifier"), false);
  t.mock.method(provider, "verify", async () => ({
    user_id: state.subject,
    session_id: "expired",
    expiration: 1,
  }));
  assert.equal((await requireSynqUser(req())).status, 401);
  assert.equal(state.resolves.length, 0);
});
test("verified subject and authoritative wallet override client identity headers; repeated login reuses mapping", async (t) => {
  const state = setup(t);
  const first = await requireSynqUser(req());
  const second = await requireSynqUser(req());
  assert.equal(first instanceof NextResponse, false);
  assert.equal(first.user.id, second.user.id);
  assert.equal(first.user.wallet.address, second.user.wallet.address);
  assert.deepEqual(state.profiles, [state.subject, state.subject]);
  assert.ok(state.resolves.every((a) => a.p_privy === state.subject && a.p_wallet === ADDRESS));
  assert.deepEqual(state.reads, [state.id, state.id]);
});
test("revoked sessions reject replay without profile or database-token generation", async (t) => {
  const state = setup(t);
  state.revoked = true;
  assert.equal((await requireSynqUser(req())).status, 401);
  assert.equal(state.profiles.length, 0);
  assert.equal(state.reads.length, 0);
});
test("provider failure, user mismatch, pinned wallet mutation fail closed", async (t) => {
  const state = setup(t);
  state.wallet = ADDRESS;
  t.mock.method(provider, "user", async () => ({
    id: state.subject,
    linked_accounts: [{ ...linked, address: MINT }],
  }));
  assert.equal((await requireSynqUser(req())).status, 503);
  t.mock.method(provider, "user", async () => ({ id: "did:privy:bob", linked_accounts: [linked] }));
  assert.equal((await requireSynqUser(req())).status, 401);
  t.mock.method(provider, "user", async () => {
    throw new Error("secret provider response");
  });
  const failure = await requireSynqUser(req());
  assert.equal(failure.status, 503);
  assert.equal((await failure.text()).includes("secret"), false);
  assert.equal(state.resolves.length, 0);
});
test("RLS bridge uses a short-lived authenticated UUID token, never service role", async (t) => {
  const { generateKeyPair, exportJWK, decodeJwt, decodeProtectedHeader } = await import("jose");
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  env(
    t,
    "SUPABASE_AUTH_BRIDGE_JWK",
    JSON.stringify({ ...(await exportJWK(privateKey)), kid: "fixture-key" }),
  );
  env(t, "NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
  env(t, "NEXT_PUBLIC_SUPABASE_ANON_KEY", "fixture-anon");
  const id = randomUUID();
  let token;
  t.mock.method(globalThis, "fetch", async (_url, opts) => {
    token = new Headers(opts.headers).get("authorization").slice(7);
    return new Response("[]", { headers: { "Content-Type": "application/json" } });
  });
  const db = await rls.ownerDatabase(id);
  await db.from("nova_conversations").select("id");
  const claims = decodeJwt(token);
  assert.equal(claims.sub, id);
  assert.equal(claims.role, "authenticated");
  assert.equal(claims.exp - claims.iat, 60);
  assert.equal(decodeProtectedHeader(token).kid, "fixture-key");
});
test("Privy boundary has no signing/submission/key export and never creates additional wallets or signers", () => {
  const files = [
    "app/components/identity/PrivyBoundary.tsx",
    "app/lib/server/identity/privy.ts",
    "app/lib/identity/wallet.ts",
  ];
  const code = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  assert.doesNotMatch(
    code,
    /useSign|signTransaction|signAndSend|sendTransaction|sendRawTransaction|exportWallet|secretKey|seedPhrase|createAdditional:\s*true|signers:\s*\[/,
  );
  assert.match(code, /createAdditional: false/);
  assert.match(code, /createOnLogin: "all-users"/);
});

test("official Privy verifier checks signature, app audience, issuer and expiry", async () => {
  const { generateKeyPair, exportSPKI, SignJWT } = await import("jose");
  const { verifyAccessToken } = require("@privy-io/node");
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const verification_key = await exportSPKI(publicKey);
  const make = (aud = "fixture-app", iss = "privy.io", exp = "5m") =>
    new SignJWT({ sid: "session-fixture" })
      .setProtectedHeader({ alg: "ES256", typ: "JWT" })
      .setSubject("did:privy:alice")
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(privateKey);
  const verify = (access_token) =>
    verifyAccessToken({ access_token, app_id: "fixture-app", verification_key });
  assert.equal((await verify(await make())).user_id, "did:privy:alice");
  for (const token of [
    await make("another-app"),
    await make("fixture-app", "attacker"),
    await make("fixture-app", "privy.io", "-1s"),
  ])
    await assert.rejects(verify(token));
  const token = await make();
  const parts = token.split(".");
  parts[1] = Buffer.from(
    JSON.stringify({ sub: "did:privy:attacker", sid: "session-fixture" }),
  ).toString("base64url");
  await assert.rejects(verify(parts.join(".")));
});

test("message route uses verified default wallet and rejects forged owned wallet before storage", async (t) => {
  const access = require("../app/lib/server/nova-launch/access.ts");
  const chain = require("../app/lib/server/nova-launch/chain/service.ts");
  const route = require("../app/api/nova/message/route.ts");
  env(t, "NOVA_SOLANA_ENABLED", "true");
  const owner = randomUUID();
  let received,
    writes = 0;
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
    async limit() {
      return { data: [] };
    },
  };
  const db = {
    from: () => q,
    async rpc() {
      writes++;
      return { data: {} };
    },
  };
  t.mock.method(access, "launchAccess", async () => ({
    user: { id: owner },
    identity: { id: owner, wallet: owned },
    db,
    readDb: db,
  }));
  t.mock.method(chain, "handleChainRequest", async (input) => {
    received = input;
    return { text: "Read-only fixture", blocks: [], plan: null };
  });
  const request = (account) =>
    new NextRequest("http://localhost/api/nova/message", {
      method: "POST",
      body: JSON.stringify({
        conversationId: randomUUID(),
        requestId: randomUUID(),
        text: "What do I own?",
        account,
        userId: randomUUID(),
      }),
    });
  assert.equal((await route.POST(request({ kind: "wallet", address: MINT }))).status, 400);
  assert.equal(writes, 0);
  await (await route.POST(request(null))).text();
  assert.equal(received.owner, owner);
  assert.equal(received.account.address, ADDRESS);
  await (await route.POST(request({ kind: "watch", address: MINT }))).text();
  assert.equal(received.account.kind, "watch");
  assert.deepEqual(received.account.access, ["read"]);
});

test("logout revokes the verified session even when wallet provisioning is unavailable", async (t) => {
  const config = require("../app/lib/identity/config.ts");
  const previous = config.privyEnabled;
  config.privyEnabled = true;
  t.after(() => {
    config.privyEnabled = previous;
  });
  const route = require("../app/api/nova/session/route.ts");
  const state = setup(t);
  let revoked;
  t.mock.method(service, "getServiceRoleClient", () => ({
    from: () => ({
      upsert: async (record) => {
        revoked = record;
        return { error: null };
      },
    }),
  }));
  t.mock.method(provider, "user", async () => {
    throw Error("wallet offline");
  });
  assert.equal((await route.DELETE(req())).status, 200);
  assert.deepEqual(revoked, { session_id: "session-a", privy_user_id: state.subject });
  assert.equal((await route.DELETE(req(null))).status, 401);
});
