// HTTP smoke test against the running dev server. Runs the full user flow
// over the wire: landing -> signup -> create project -> analyze -> read back.
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3111";
const EMAIL = `smoke-${Date.now()}@pa.test`;

function setCookie(res, jar) {
  const sc = res.headers.get("set-cookie");
  if (!sc) return;
  const [pair] = sc.split(";");
  const i = pair.indexOf("=");
  jar[pair.slice(0, i).trim()] = pair.slice(i + 1);
}
function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  const jar = {};
  let pass = 0;
  let fail = 0;
  const check = (label, ok, extra = "") => {
    if (ok) {
      pass++;
      console.log("  PASS  " + label + (extra ? ` (${extra})` : ""));
    } else {
      fail++;
      console.log("  FAIL  " + label + (extra ? ` (${extra})` : ""));
    }
  };

  // 1) Landing page.
  let res = await fetch(BASE + "/");
  let html = await res.text();
  check("GET / returns 200", res.status === 200, "status " + res.status);
  check("landing renders product copy", /Interview|spec|idea/i.test(html), "len " + html.length);

  // 2) Signup (capture session cookie).
  res = await fetch(BASE + "/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: "supersecret1", name: "Smoke" }),
  });
  setCookie(res, jar);
  let body = await res.json();
  check("POST /api/auth/signup 200", res.status === 200, JSON.stringify(body).slice(0, 60));
  check("session cookie captured", Object.keys(jar).length > 0, Object.keys(jar).join(","));

  // 3) Dashboard with cookie.
  res = await fetch(BASE + "/dashboard", { headers: { Cookie: cookieHeader(jar) } });
  html = await res.text();
  check("GET /dashboard 200 (authed)", res.status === 200, "status " + res.status);

  // 4) Create a project.
  res = await fetch(BASE + "/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(jar) },
    body: JSON.stringify({ name: "Smoke Notes", idea: "Students share study notes and quiz each other." }),
  });
  body = await res.json();
  const projectId = body?.id;
  check("POST /api/projects 200 + id", res.status === 200 && !!projectId, projectId ? "id " + String(projectId).slice(0, 8) : JSON.stringify(body));

  // 5) Analyze the idea.
  res = await fetch(BASE + `/api/projects/${projectId}/interview/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader(jar) },
    body: "{}",
  });
  body = await res.json();
  check(
    "POST interview/analyze returns a next question",
    res.status === 200 && !!body?.nextQuestion,
    body?.nextQuestion ? "question key " + body.nextQuestion.questionKey : JSON.stringify(body).slice(0, 80),
  );

  // 6) GET a project back.
  res = await fetch(BASE + `/api/projects/${projectId}`, { headers: { Cookie: cookieHeader(jar) } });
  body = await res.json();
  check(
    "GET /api/projects/:id 200 + name",
    res.status === 200 && body?.name === "Smoke Notes",
    "readiness " + body?.readinessPercent + "%",
  );

  console.log(`\n  smoke: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("smoke crashed:", e);
  process.exit(2);
});
