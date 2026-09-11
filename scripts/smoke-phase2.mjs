// Phase 2 HTTP smoke: exercises the new planning / export / changes / audit
// routes over the wire against the running dev server (local Postgres + mock AI).
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3111";
const EMAIL = `smoke2-${Date.now()}@pa.test`;

function setCookie(res, jar) {
  const sc = res.headers.get("set-cookie");
  if (!sc) return;
  const [pair] = sc.split(";");
  const i = pair.indexOf("=");
  jar[pair.slice(0, i).trim()] = pair.slice(i + 1);
}
const cookie = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

async function main() {
  const jar = {};
  let pass = 0, fail = 0;
  const check = (label, ok, extra = "") => {
    if (ok) { pass++; console.log("  PASS  " + label + (extra ? ` (${extra})` : "")); }
    else { fail++; console.log("  FAIL  " + label + (extra ? ` (${extra})` : "")); }
  };

  // signup
  let res = await fetch(BASE + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: "supersecret1", name: "Smoke2" }),
  });
  setCookie(res, jar);
  check("signup 200 + cookie", res.status === 200 && Object.keys(jar).length > 0);
  const H = { "Content-Type": "application/json", Cookie: cookie(jar) };

  // create project
  res = await fetch(BASE + "/api/projects", {
    method: "POST", headers: H,
    body: JSON.stringify({ name: "Notes2", idea: "Students share study notes and quiz each other with public sharing." }),
  });
  let body = await res.json();
  const pid = body?.id;
  check("create project", res.status === 200 && !!pid, pid ? pid.slice(0, 8) : JSON.stringify(body).slice(0, 60));

  // analyze idea to seed features/requirements
  res = await fetch(BASE + `/api/projects/${pid}/interview/analyze`, { method: "POST", headers: H, body: "{}" });
  check("interview/analyze 200", res.status === 200, res.status);

  // planning: read-only summary (GET)
  res = await fetch(BASE + `/api/projects/${pid}/planning`, { headers: H });
  body = await res.json();
  check(
    "GET planning -> readiness2 + quality + state",
    res.status === 200 && typeof body.readiness?.percent === "number" && typeof body.quality?.score === "number" && Array.isArray(body.state?.database),
    `readiness ${body.readiness?.percent}% quality ${body.quality?.score}`,
  );

  // planning: generate all (POST)
  res = await fetch(BASE + `/api/projects/${pid}/planning`, { method: "POST", headers: H, body: "{}" });
  body = await res.json();
  check(
    "POST planning (generate all) populates sections",
    res.status === 200 &&
      Array.isArray(body.state?.requirements) &&
      body.state?.userStories?.length > 0 &&
      body.state?.architectureComponents?.length > 0 &&
      body.state?.database?.length > 0 &&
      body.state?.api?.length > 0 &&
      body.state?.pages?.length > 0 &&
      body.state?.implementationPhases?.length > 0,
    `reqs ${body.state?.requirements?.length} stories ${body.state?.userStories?.length} db ${body.state?.database?.length} api ${body.state?.api?.length} phases ${body.state?.implementationPhases?.length}`,
  );

  // export: POST (json) -> versions + integrity + docs
  res = await fetch(BASE + `/api/projects/${pid}/export`, { method: "POST", headers: H, body: JSON.stringify({ reason: "smoke export" }) });
  body = await res.json();
  check(
    "POST export -> planVersion + integrity + 11 docs",
    res.status === 200 && typeof body.planVersion === "number" && body.integrity && body.docOrder?.length === 11 && "BUILD.md" in body.docs,
    `v${body.planVersion} integrity.ok=${body.integrity?.ok}`,
  );

  // export: versions
  res = await fetch(BASE + `/api/projects/${pid}/export/versions`, { headers: H });
  body = await res.json();
  check("GET export/versions -> >=1 version", res.status === 200 && body.versions?.length >= 1, `${body.versions?.length} versions`);

  // export: ZIP download
  res = await fetch(BASE + `/api/projects/${pid}/export`, { headers: H });
  const zipBuf = Buffer.from(await res.arrayBuffer());
  check(
    "GET export -> ZIP (PK header)",
    res.status === 200 && res.headers.get("content-type")?.includes("application/zip") && zipBuf[0] === 0x50 && zipBuf[1] === 0x4b && zipBuf.length > 200,
    `${zipBuf.length} bytes`,
  );

  // audit
  res = await fetch(BASE + `/api/projects/${pid}/audit`, { headers: H });
  body = await res.json();
  check("GET audit -> events", res.status === 200 && Array.isArray(body.events) && body.events.length >= 1, `${body.events?.length} events`);

  // changes: low-impact (propose, no apply)
  res = await fetch(BASE + `/api/projects/${pid}/changes`, { method: "POST", headers: H, body: JSON.stringify({ change: "make deployment monitoring optional" }) });
  body = await res.json();
  check("POST changes (propose) -> impact report", res.status === 200 && body.pending && body.report?.areas?.length >= 0, `level ${body.report?.level}`);

  // changes: high-impact without force -> 409
  res = await fetch(BASE + `/api/projects/${pid}/changes`, { method: "POST", headers: H, body: JSON.stringify({ change: "allow anyone to see and edit every note publicly", apply: true }) });
  check("POST changes high-impact (no force) -> 409 confirm", res.status === 409, `status ${res.status}`);

  // changes: high-impact with force -> applies
  res = await fetch(BASE + `/api/projects/${pid}/changes`, { method: "POST", headers: H, body: JSON.stringify({ change: "allow anyone to see and edit every note publicly", apply: true, force: true }) });
  body = await res.json();
  check(
    "POST changes high-impact (force) -> applied + version",
    res.status === 200 && body.applied === true && typeof body.planVersion === "number",
    `applied planVersion ${body.planVersion}`,
  );

  // manual edit (PATCH) — valid op
  res = await fetch(BASE + `/api/projects/${pid}/planning`, { method: "PATCH", headers: H, body: JSON.stringify({ op: "add_goal", goal: "Allow teachers to assign quizzes" }) });
  body = await res.json();
  check("PATCH planning (manual op) 200 + goal recorded", res.status === 200 && body.ok && body.state?.project?.goals?.includes("Allow teachers to assign quizzes"), `goals ${body?.state?.project?.goals?.length}`);

  // manual edit — invalid op -> 400
  res = await fetch(BASE + `/api/projects/${pid}/planning`, { method: "PATCH", headers: H, body: JSON.stringify({ op: "nonsense_op" }) });
  check("PATCH planning (bad op) -> 400", res.status === 400, `status ${res.status}`);

  // ownership: a second user cannot touch the project
  const jar2 = {};
  res = await fetch(BASE + "/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: EMAIL + "-other", password: "supersecret1", name: "Other" }) });
  setCookie(res, jar2);
  res = await fetch(BASE + `/api/projects/${pid}/planning`, { headers: { "Content-Type": "application/json", Cookie: cookie(jar2) } });
  check("other user -> 403 on planning", res.status === 403, `status ${res.status}`);

  console.log(`\n  phase2 smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("phase2 smoke crashed:", e); process.exit(2); });
