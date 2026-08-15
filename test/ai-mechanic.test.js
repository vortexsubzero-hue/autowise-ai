"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { handler, _test } = require("../netlify/functions/ai-mechanic");

const validPayload = {
  vehicle: {
    year: "2004",
    make: "Pontiac",
    model: "Grand Am",
    cylinders: "6",
    liters: "3.4"
  },
  symptoms: "The engine shakes at idle and the check-engine light is on."
};

test("rejects unsupported methods", async () => {
  const result = await handler({ httpMethod: "GET" });
  assert.equal(result.statusCode, 405);
});

test("requires a server-side API key", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify(validPayload)
    });
    assert.equal(result.statusCode, 503);
    assert.match(JSON.parse(result.body).error, /not configured/i);
  } finally {
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
  }
});

test("validates short symptom descriptions", () => {
  const error = _test.validatePayload({ ...validPayload, symptoms: "shakes" });
  assert.match(error, /more detail/i);
});

test("extracts text from a Responses API payload", () => {
  const text = _test.extractOutputText({
    output: [
      { content: [{ type: "output_text", text: "Likely cause: ignition misfire." }] }
    ]
  });
  assert.equal(text, "Likely cause: ignition misfire.");
});

test("returns a successful analysis without exposing the API key", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-secret-key";
  global.fetch = async (_url, options) => {
    assert.match(options.headers.Authorization, /^Bearer test-secret-key$/);
    return new Response(
      JSON.stringify({ output_text: "SAFETY FIRST\nDo not ignore warning lights." }),
      { status: 200, headers: { "x-request-id": "req_test" } }
    );
  };

  try {
    const result = await handler({
      httpMethod: "POST",
      body: JSON.stringify(validPayload)
    });
    const body = JSON.parse(result.body);

    assert.equal(result.statusCode, 200);
    assert.match(body.analysis, /SAFETY FIRST/);
    assert.doesNotMatch(result.body, /test-secret-key/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("normalizes the vehicle fields sent to the model", () => {
  const normalized = _test.normalizeVehicle({
    ...validPayload.vehicle,
    unexpected: "do not include"
  });
  assert.equal(normalized.make, "Pontiac");
  assert.equal("unexpected" in normalized, false);
});
