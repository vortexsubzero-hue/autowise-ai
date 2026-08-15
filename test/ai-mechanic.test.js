import test from "node:test";
import assert from "node:assert/strict";
import handler, { _test, config } from "../netlify/functions/ai-mechanic.js";

const validPayload = {
  vehicle: {
    year: "2004",
    make: "Pontiac",
    model: "Grand Am",
    cylinders: "6",
    liters: "3.4"
  },
  symptoms: "The engine shakes at idle and the check-engine light is on.",
  visitorId: "visitor-test-123"
};

function request(method = "POST", payload = validPayload, headers = {}) {
  return new Request("https://autowise-ai.netlify.app/api/ai-mechanic", {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify(payload) : undefined
  });
}

async function responseBody(response) {
  return JSON.parse(await response.text());
}

function restoreEnvironment(snapshot) {
  for (const key of ["OPENAI_API_KEY", "OPENAI_MODEL", "BETA_ACCESS_CODES", "URL", "ALLOWED_ORIGIN"]) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

function environmentSnapshot() {
  return Object.fromEntries(
    ["OPENAI_API_KEY", "OPENAI_MODEL", "BETA_ACCESS_CODES", "URL", "ALLOWED_ORIGIN"].map((key) => [
      key,
      process.env[key]
    ])
  );
}

test("publishes a five-request-per-minute protected route", () => {
  assert.equal(config.path, "/api/ai-mechanic");
  assert.equal(config.rateLimit.windowLimit, 5);
  assert.equal(config.rateLimit.windowSize, 60);
});

test("rejects unsupported methods", async () => {
  const response = await handler(request("GET"));
  assert.equal(response.status, 405);
  assert.equal((await responseBody(response)).code, "METHOD_NOT_ALLOWED");
});

test("requires a server-side API key", async () => {
  const snapshot = environmentSnapshot();
  delete process.env.OPENAI_API_KEY;

  try {
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.match((await responseBody(response)).error, /not configured/i);
  } finally {
    restoreEnvironment(snapshot);
  }
});

test("rejects a request from an unrelated origin", async () => {
  const snapshot = environmentSnapshot();
  process.env.OPENAI_API_KEY = "test-secret-key";
  process.env.URL = "https://autowise-ai.netlify.app";

  try {
    const response = await handler(request("POST", validPayload, { Origin: "https://evil.example" }));
    assert.equal(response.status, 403);
    assert.equal((await responseBody(response)).code, "ORIGIN_NOT_ALLOWED");
  } finally {
    restoreEnvironment(snapshot);
  }
});

test("enforces configured beta access codes", async () => {
  const snapshot = environmentSnapshot();
  process.env.OPENAI_API_KEY = "test-secret-key";
  process.env.BETA_ACCESS_CODES = "beta-one,beta-two";

  try {
    const response = await handler(request());
    assert.equal(response.status, 401);
    assert.equal((await responseBody(response)).code, "ACCESS_REQUIRED");
  } finally {
    restoreEnvironment(snapshot);
  }
});

test("validates short symptom descriptions", () => {
  const error = _test.validatePayload({ ...validPayload, symptoms: "shakes" });
  assert.match(error, /more detail/i);
});

test("extracts text from a Responses API payload", () => {
  const text = _test.extractOutputText({
    output: [{ content: [{ type: "output_text", text: "Likely cause: ignition misfire." }] }]
  });
  assert.equal(text, "Likely cause: ignition misfire.");
});

test("returns an analysis while keeping secrets and raw visitor IDs private", async () => {
  const snapshot = environmentSnapshot();
  const originalFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-secret-key";
  process.env.BETA_ACCESS_CODES = "beta-one";

  global.fetch = async (_url, options) => {
    assert.equal(options.headers.Authorization, "Bearer test-secret-key");
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.safety_identifier.length, 64);
    assert.notEqual(body.safety_identifier, validPayload.visitorId);
    assert.doesNotMatch(body.input, /1G2NG/i);

    return new Response(JSON.stringify({ output_text: "SAFETY FIRST\nDo not ignore warning lights." }), {
      status: 200,
      headers: { "x-request-id": "req_test" }
    });
  };

  try {
    const response = await handler(
      request("POST", validPayload, { "X-AutoWise-Access-Code": "beta-one" })
    );
    const rawBody = await response.text();
    const body = JSON.parse(rawBody);

    assert.equal(response.status, 200);
    assert.match(body.analysis, /SAFETY FIRST/);
    assert.doesNotMatch(rawBody, /test-secret-key|visitor-test-123/);
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment(snapshot);
  }
});

test("turns OpenAI insufficient quota into a clear credit error", async () => {
  const snapshot = environmentSnapshot();
  const originalFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-secret-key";
  delete process.env.BETA_ACCESS_CODES;
  global.fetch = async () =>
    new Response(JSON.stringify({ error: { code: "insufficient_quota" } }), { status: 429 });

  try {
    const response = await handler(request());
    const body = await responseBody(response);
    assert.equal(response.status, 402);
    assert.equal(body.code, "API_CREDITS_REQUIRED");
  } finally {
    global.fetch = originalFetch;
    restoreEnvironment(snapshot);
  }
});

test("normalizes only approved vehicle fields", () => {
  const normalized = _test.normalizeVehicle({ ...validPayload.vehicle, unexpected: "do not include" });
  assert.equal(normalized.make, "Pontiac");
  assert.equal("unexpected" in normalized, false);
});
