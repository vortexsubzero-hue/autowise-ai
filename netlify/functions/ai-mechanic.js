"use strict";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5-mini";
const MAX_BODY_LENGTH = 20_000;
const MAX_SYMPTOM_LENGTH = 1_500;

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

exports.handler = async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return response(204, null, {
      Allow: "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    });
  }

  if (event.httpMethod !== "POST") {
    return response(405, { error: "Use POST to analyze vehicle symptoms." }, { Allow: "POST" });
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("AI Mechanic is missing OPENAI_API_KEY.");
    return response(503, { error: "AI Mechanic is not configured yet." });
  }

  if (!event.body || event.body.length > MAX_BODY_LENGTH) {
    return response(400, { error: "The request is empty or too large." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return response(400, { error: "The request body must be valid JSON." });
  }

  const validationError = validatePayload(payload);
  if (validationError) return response(400, { error: validationError });

  const vehicle = normalizeVehicle(payload.vehicle);
  const symptoms = payload.symptoms.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const openAIResponse = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        store: false,
        max_output_tokens: 900,
        instructions: buildInstructions(),
        input: buildInput(vehicle, symptoms)
      }),
      signal: controller.signal
    });

    const requestId = openAIResponse.headers.get("x-request-id");
    const result = await openAIResponse.json().catch(() => ({}));

    if (!openAIResponse.ok) {
      console.error("OpenAI request failed", {
        requestId,
        status: openAIResponse.status,
        type: result.error?.type
      });
      return response(openAIStatus(openAIResponse.status), {
        error: openAIMessage(openAIResponse.status)
      });
    }

    const analysis = extractOutputText(result);
    if (!analysis) {
      console.error("OpenAI returned no readable text", { requestId });
      return response(502, { error: "AI Mechanic returned an incomplete response. Please try again." });
    }

    return response(200, { analysis });
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("OpenAI request timed out.");
      return response(504, { error: "AI Mechanic took too long to respond. Please try again." });
    }

    console.error("AI Mechanic request failed", error);
    return response(502, { error: "AI Mechanic is temporarily unavailable. Please try again later." });
  } finally {
    clearTimeout(timeout);
  }
};

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "The request must include a vehicle and symptom description.";
  }

  if (!payload.vehicle || typeof payload.vehicle !== "object" || Array.isArray(payload.vehicle)) {
    return "Decode a vehicle before using AI Mechanic.";
  }

  const requiredFields = ["year", "make", "model"];
  if (requiredFields.some((field) => !safeString(payload.vehicle[field], 100))) {
    return "The decoded vehicle information is incomplete.";
  }

  if (typeof payload.symptoms !== "string") {
    return "Describe what the vehicle is doing.";
  }

  const symptomLength = payload.symptoms.trim().length;
  if (symptomLength < 10) return "Please describe the symptoms in a little more detail.";
  if (symptomLength > MAX_SYMPTOM_LENGTH) return "Keep the symptom description under 1,500 characters.";
  return "";
}

function normalizeVehicle(vehicle) {
  const allowedFields = [
    "vin",
    "year",
    "make",
    "model",
    "manufacturer",
    "type",
    "body",
    "cylinders",
    "liters",
    "fuel",
    "drive"
  ];

  return Object.fromEntries(
    allowedFields.map((field) => [field, String(vehicle[field] || "").trim().slice(0, 120)])
  );
}

function safeString(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function buildInstructions() {
  return [
    "You are AutoWise AI Mechanic, an automotive information assistant.",
    "Give cautious, practical guidance based only on the supplied decoded vehicle and symptoms.",
    "Do not claim certainty or a confirmed diagnosis. Never invent service records, trouble codes, recalls, specifications, prices, or known defects.",
    "If a symptom may indicate immediate danger (brakes, steering, fuel smell, smoke, overheating, severe vibration, warning lights, or loss of power), begin with a prominent STOP DRIVING safety warning.",
    "Use short plain-text sections in this exact order: SAFETY FIRST, LIKELY CAUSES, WHAT TO CHECK NEXT, REPAIR OUTLOOK, WHEN TO GET HELP.",
    "Rank up to four likely causes and briefly explain why each fits.",
    "Suggest only checks a typical owner can perform safely; clearly label anything that requires a technician.",
    "For repair outlook, use broad relative cost (low, moderate, high) and difficulty rather than precise prices because labor and parts vary.",
    "End with: This is informational guidance, not a confirmed diagnosis."
  ].join(" ");
}

function buildInput(vehicle, symptoms) {
  const vehicleLines = [
    `Year: ${vehicle.year}`,
    `Make: ${vehicle.make}`,
    `Model: ${vehicle.model}`,
    `Engine: ${[vehicle.cylinders && `${vehicle.cylinders} cylinders`, vehicle.liters && `${vehicle.liters}L`].filter(Boolean).join(", ") || "Not listed"}`,
    `Fuel: ${vehicle.fuel || "Not listed"}`,
    `Drive type: ${vehicle.drive || "Not listed"}`,
    `Body style: ${vehicle.body || "Not listed"}`
  ];

  return `DECODED VEHICLE\n${vehicleLines.join("\n")}\n\nOWNER-REPORTED SYMPTOMS\n${symptoms}`;
}

function extractOutputText(result) {
  if (typeof result.output_text === "string" && result.output_text.trim()) {
    return result.output_text.trim();
  }

  return (result.output || [])
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function openAIStatus(status) {
  if (status === 401 || status === 403) return 503;
  if (status === 429) return 429;
  if (status >= 500) return 502;
  return 400;
}

function openAIMessage(status) {
  if (status === 401 || status === 403) return "AI Mechanic has a configuration problem.";
  if (status === 429) return "AI Mechanic is busy right now. Please wait a moment and try again.";
  return "AI Mechanic could not complete the analysis. Please try again.";
}

function response(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...jsonHeaders, ...extraHeaders },
    body: body === null ? "" : JSON.stringify(body)
  };
}

exports._test = {
  buildInput,
  extractOutputText,
  normalizeVehicle,
  validatePayload
};
