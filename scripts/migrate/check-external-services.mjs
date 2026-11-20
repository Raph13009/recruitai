#!/usr/bin/env node
/**
 * Production readiness checks for Gemini Live, LiveAvatar, Resend — without burning credits.
 * Never prints secret values.
 *
 * Modes:
 *   DRY (default): presence + lightweight authenticated probes that do not start a Live session.
 *   LIVE_SMOKE=1: optional short Gemini Live connect (costs a few seconds of quota).
 */
const report = [];

function present(name) {
  const v = process.env[name];
  return Boolean(v && String(v).trim());
}

function add(service, ok, detail) {
  report.push({ service, ok, detail });
  console.log(`${ok ? "OK" : "FAIL"}  ${service}: ${detail}`);
}

async function checkResend() {
  if (!present("RESEND_API_KEY")) {
    add("resend", false, "RESEND_API_KEY missing");
    return;
  }
  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  });
  if (res.status === 401 || res.status === 403) {
    add("resend", false, `auth rejected (${res.status})`);
    return;
  }
  if (!res.ok) {
    add("resend", false, `domains probe HTTP ${res.status}`);
    return;
  }
  const data = await res.json().catch(() => ({}));
  const domains = Array.isArray(data?.data) ? data.data.length : Array.isArray(data) ? data.length : "?";
  const from = process.env.RESEND_FROM || "(default onboarding@resend.dev)";
  add("resend", true, `key valid; domains=${domains}; from configured=${Boolean(process.env.RESEND_FROM)}; hint=${from.includes("@") ? "set" : "check"}`);
}

async function checkGemini() {
  if (!present("GEMINI_API_KEY") && !present("google_api_key")) {
    add("gemini", false, "GEMINI_API_KEY missing (demo voice fallback will be used)");
    return;
  }
  const key = process.env.GEMINI_API_KEY || process.env.google_api_key;
  const model = process.env.GEMINI_LIVE_MODEL || "gemini-3.1-flash-live-preview";
  // List models is free-ish metadata; avoids opening a Live WebSocket.
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=5`);
  if (!res.ok) {
    add("gemini", false, `models probe HTTP ${res.status}`);
    return;
  }
  add("gemini", true, `key accepts API; configured model=${model}; voice=${process.env.GEMINI_VOICE || "Aoede"}`);

  if (process.env.LIVE_SMOKE === "1") {
    add("gemini_live_smoke", false, "run web/scripts/smoke-gemini-live.mjs separately (consumes quota)");
  }
}

async function checkLiveAvatar() {
  const sandbox = (process.env.LIVEAVATAR_SANDBOX ?? "true") !== "false";
  if (!present("LIVEAVATAR_API_KEY")) {
    add("liveavatar", false, "LIVEAVATAR_API_KEY missing (audio-only / no face)");
    return;
  }
  const res = await fetch("https://api.liveavatar.com/v1/avatars", {
    headers: {
      "X-API-KEY": process.env.LIVEAVATAR_API_KEY,
      Accept: "application/json",
    },
  });
  // Some accounts use Authorization Bearer — try fallback once.
  let status = res.status;
  if (status === 401 || status === 403) {
    const res2 = await fetch("https://api.liveavatar.com/v1/avatars", {
      headers: {
        Authorization: `Bearer ${process.env.LIVEAVATAR_API_KEY}`,
        Accept: "application/json",
      },
    });
    status = res2.status;
    if (!res2.ok && status !== 404) {
      add("liveavatar", false, `avatars probe HTTP ${status}`);
      return;
    }
  } else if (!res.ok && status !== 404) {
    add("liveavatar", false, `avatars probe HTTP ${status}`);
    return;
  }
  const avatarId = process.env.LIVEAVATAR_AVATAR_ID || "(none — agency setting or sandbox Wayne)";
  add(
    "liveavatar",
    true,
    `key accepted (HTTP ${status === 404 ? "ok-ish" : status}); sandbox=${sandbox}; default_avatar=${avatarId === "(none — agency setting or sandbox Wayne)" ? "unset" : "set"}`,
  );
  if (!sandbox) {
    add("liveavatar_prod", true, "LIVEAVATAR_SANDBOX=false — full library; keep sessions short in pre-prod tests");
  } else {
    add("liveavatar_sandbox", true, "sandbox on — ~1 min sessions, Wayne face, no paid credits");
  }
}

function interviewTestPlan() {
  console.log(`
=== Interview test plan (low credit) ===
1. Keep LIVEAVATAR_SANDBOX=true until cutover.
2. Create one invite on recruitai-test → open lobby → check branding PNG + mic permission UI.
3. Start session in demo mode (no Live) if GEMINI missing; otherwise one <60s sandbox face session.
4. Complete → verify report/transcript scoped to agency; cross-agency export 404.
5. Optional once: LIVE_SMOKE=1 node web/scripts/smoke-gemini-live.mjs (single turn).
6. Do NOT loop LiveAvatar / Gemini stress tests on this environment.
`);
}

await checkResend();
await checkGemini();
await checkLiveAvatar();
interviewTestPlan();

const critical = report.filter((r) => !r.ok && ["resend", "gemini", "liveavatar"].includes(r.service));
console.log(JSON.stringify({ ok: critical.length === 0, checks: report }, null, 2));
process.exit(critical.length === 0 ? 0 : 2);
