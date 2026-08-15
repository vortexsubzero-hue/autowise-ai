const NHTSA_VIN_API = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/";
const NHTSA_RECALL_API = "https://api.nhtsa.gov/recalls/recallsByVehicle";
const AI_MECHANIC_API = "/api/ai-mechanic";
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

const STORAGE = Object.freeze({
  accessCode: "autowiseBetaAccessCode",
  analysisHistory: "autowiseAnalysisHistory",
  dailyUsage: "autowiseDailyUsage",
  vehicle: "autowiseVehicle",
  visitorId: "autowiseVisitorId"
});

const config = Object.freeze({
  betaCheckoutUrl: window.AUTOWISE_CONFIG?.betaCheckoutUrl || "",
  betaPrice: window.AUTOWISE_CONFIG?.betaPrice || "$7",
  dailyBrowserLimit: Number(window.AUTOWISE_CONFIG?.dailyBrowserLimit) || 5
});

let currentVehicle = null;
let currentAnalysis = "";
const visitorId = getOrCreateVisitorId();

const elements = {
  accessCode: document.getElementById("accessCode"),
  accessCodeStatus: document.getElementById("accessCodeStatus"),
  addVehicleButton: document.getElementById("addVehicleButton"),
  aiResponse: document.getElementById("aiResponse"),
  analysisHistory: document.getElementById("analysisHistory"),
  analysisHistoryPanel: document.getElementById("analysisHistoryPanel"),
  analyzeButton: document.getElementById("analyzeButton"),
  betaCheckoutButton: document.getElementById("betaCheckoutButton"),
  betaPrice: document.getElementById("betaPrice"),
  clearHistoryButton: document.getElementById("clearHistoryButton"),
  copyResponseButton: document.getElementById("copyResponseButton"),
  currentYear: document.getElementById("currentYear"),
  dailyUsage: document.getElementById("dailyUsage"),
  decodeButton: document.getElementById("decodeButton"),
  loadSavedVehicleButton: document.getElementById("loadSavedVehicleButton"),
  maintenanceButton: document.getElementById("maintenanceButton"),
  maintenanceResponse: document.getElementById("maintenanceResponse"),
  mileage: document.getElementById("mileage"),
  printResponseButton: document.getElementById("printResponseButton"),
  recallButton: document.getElementById("recallButton"),
  recallResults: document.getElementById("recallResults"),
  removeSavedVehicleButton: document.getElementById("removeSavedVehicleButton"),
  responseActions: document.getElementById("responseActions"),
  saveAccessCodeButton: document.getElementById("saveAccessCodeButton"),
  saveVehicleButton: document.getElementById("saveVehicleButton"),
  status: document.getElementById("status"),
  symptomCount: document.getElementById("symptomCount"),
  symptoms: document.getElementById("symptoms"),
  vehicleDashboard: document.getElementById("vehicleDashboard"),
  vehicleName: document.getElementById("vehicleName"),
  vehicleSpecs: document.getElementById("vehicleSpecs"),
  vehicleSub: document.getElementById("vehicleSub"),
  vin: document.getElementById("vin"),
  vinSection: document.getElementById("vinSection")
};

initialize();

function initialize() {
  elements.currentYear.textContent = new Date().getFullYear();
  elements.betaPrice.textContent = config.betaPrice;
  configureCheckout();
  configureSavedData();
  bindEvents();
  updateSymptomCount();
  updateDailyUsage();
  renderAnalysisHistory();
}

function bindEvents() {
  elements.addVehicleButton.addEventListener("click", scrollToVIN);
  elements.decodeButton.addEventListener("click", decodeVIN);
  elements.vin.addEventListener("keydown", (event) => {
    if (event.key === "Enter") decodeVIN();
  });
  elements.vin.addEventListener("input", () => {
    elements.vin.value = elements.vin.value.toUpperCase().replace(/\s/g, "");
  });
  elements.saveVehicleButton.addEventListener("click", saveVehicle);
  elements.removeSavedVehicleButton.addEventListener("click", removeSavedVehicle);
  elements.loadSavedVehicleButton.addEventListener("click", loadSavedVehicle);
  elements.recallButton.addEventListener("click", loadRecalls);
  elements.analyzeButton.addEventListener("click", analyzeSymptoms);
  elements.maintenanceButton.addEventListener("click", createMaintenanceChecklist);
  elements.symptoms.addEventListener("input", updateSymptomCount);
  elements.saveAccessCodeButton.addEventListener("click", saveAccessCode);
  elements.copyResponseButton.addEventListener("click", copyAnalysis);
  elements.printResponseButton.addEventListener("click", () => window.print());
  elements.clearHistoryButton.addEventListener("click", clearAnalysisHistory);

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => showTool(button.dataset.tool));
  });
}

function configureCheckout() {
  if (isSafeCheckoutUrl(config.betaCheckoutUrl)) {
    elements.betaCheckoutButton.href = config.betaCheckoutUrl;
    elements.betaCheckoutButton.target = "_blank";
    elements.betaCheckoutButton.rel = "noopener noreferrer";
    elements.betaCheckoutButton.textContent = "Get Beta Access";
    elements.betaCheckoutButton.addEventListener("click", () => trackEvent("checkout_opened"));
    return;
  }

  elements.betaCheckoutButton.removeAttribute("href");
  elements.betaCheckoutButton.classList.add("disabled");
  elements.betaCheckoutButton.setAttribute("aria-disabled", "true");
}

function configureSavedData() {
  const savedVehicle = readJSON(STORAGE.vehicle, null);
  elements.loadSavedVehicleButton.hidden = !isUsableVehicle(savedVehicle);

  const savedCode = localStorage.getItem(STORAGE.accessCode) || "";
  if (savedCode) {
    elements.accessCode.value = savedCode;
    elements.accessCodeStatus.textContent = "A beta access code is saved in this browser.";
  }
}

function scrollToVIN() {
  elements.vinSection.scrollIntoView({ behavior: "smooth" });
  elements.vin.focus({ preventScroll: true });
}

async function decodeVIN() {
  const vin = elements.vin.value.trim().toUpperCase();

  if (!VIN_PATTERN.test(vin)) {
    setStatus("Please enter a valid 17-character VIN. VINs do not contain I, O, or Q.", true);
    return;
  }

  setButtonLoading(elements.decodeButton, true, "Decoding…");
  setStatus("Decoding vehicle...");

  try {
    const response = await fetchWithTimeout(`${NHTSA_VIN_API}${encodeURIComponent(vin)}?format=json`, {}, 12_000);
    if (!response.ok) throw new Error("VIN service returned an error.");

    const data = await response.json();
    const car = data.Results?.[0];
    if (!car || (!car.Make && !car.Model)) {
      setStatus("We couldn't identify that VIN. Check it and try again.", true);
      return;
    }

    currentVehicle = {
      vin,
      year: cleanValue(car.ModelYear),
      make: cleanValue(car.Make),
      model: cleanValue(car.Model),
      manufacturer: cleanValue(car.Manufacturer),
      type: cleanValue(car.VehicleType),
      body: cleanValue(car.BodyClass),
      cylinders: cleanValue(car.EngineCylinders),
      liters: cleanValue(car.DisplacementL),
      fuel: cleanValue(car.FuelTypePrimary),
      drive: cleanValue(car.DriveType)
    };

    renderVehicle();
    setStatus("Vehicle dashboard created.");
    trackEvent("vin_decoded", { year: currentVehicle.year, make: currentVehicle.make });
  } catch (error) {
    console.error("VIN decode failed:", error);
    setStatus("The VIN service is unavailable right now. Please try again in a moment.", true);
  } finally {
    setButtonLoading(elements.decodeButton, false);
  }
}

function renderVehicle({ scroll = true } = {}) {
  const vehicle = currentVehicle;
  elements.vehicleName.textContent = vehicleName(vehicle);
  elements.vehicleSub.textContent = `VIN ${vehicle.vin}`;
  elements.vehicleSpecs.replaceChildren(
    createSpec("Manufacturer", vehicle.manufacturer),
    createSpec("Vehicle Type", vehicle.type),
    createSpec("Body Style", vehicle.body),
    createSpec("Engine", engineText(vehicle)),
    createSpec("Fuel", vehicle.fuel),
    createSpec("Drive Type", vehicle.drive)
  );

  const isSaved = readJSON(STORAGE.vehicle, null)?.vin === vehicle.vin;
  elements.saveVehicleButton.textContent = isSaved ? "✓ Saved to Garage" : "☆ Save to Garage";
  elements.removeSavedVehicleButton.hidden = !isSaved;
  elements.vehicleDashboard.style.display = "block";
  if (scroll) elements.vehicleDashboard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function createSpec(label, value) {
  const item = document.createElement("div");
  const caption = document.createElement("small");
  item.className = "vehicle-item";
  caption.textContent = label;
  item.append(caption, document.createTextNode(value || "Not listed"));
  return item;
}

function showTool(id) {
  document.querySelectorAll(".tool-panel").forEach((panel) => { panel.style.display = "none"; });
  const panel = document.getElementById(id);
  if (!panel) return;
  panel.style.display = "block";
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  trackEvent("tool_opened", { tool: id });
}

async function loadRecalls() {
  if (!currentVehicle) return;

  setButtonLoading(elements.recallButton, true, "Checking…");
  elements.recallResults.replaceChildren(createNotice("Searching NHTSA recall information..."));

  try {
    const query = new URLSearchParams({ make: currentVehicle.make, model: currentVehicle.model, modelYear: currentVehicle.year });
    const response = await fetchWithTimeout(`${NHTSA_RECALL_API}?${query}`, {}, 12_000);
    if (!response.ok) throw new Error("Recall service returned an error.");

    const data = await response.json();
    const recalls = Array.isArray(data.results) ? data.results : [];
    if (recalls.length === 0) {
      elements.recallResults.replaceChildren(createNotice("No campaigns were returned for this year, make, and model. Verify exact VIN eligibility at NHTSA.gov."));
      return;
    }

    elements.recallResults.replaceChildren(...recalls.slice(0, 10).map(createRecall));
    trackEvent("recalls_loaded", { count: recalls.length });
  } catch (error) {
    console.error("Recall lookup failed:", error);
    elements.recallResults.replaceChildren(createNotice("Recall information could not be loaded right now. Please try again later."));
  } finally {
    setButtonLoading(elements.recallButton, false);
  }
}

function createRecall(recall) {
  const card = document.createElement("article");
  const heading = document.createElement("h4");
  const campaign = document.createElement("p");
  const summary = document.createElement("p");
  const remedy = document.createElement("p");
  card.className = "recall";
  heading.textContent = recall.Component || "Recall Campaign";
  appendLabeledText(campaign, "Campaign:", recall.NHTSACampaignNumber || "Not listed");
  summary.textContent = recall.Summary || "No summary available.";
  appendLabeledText(remedy, "Remedy:", recall.Remedy || "Contact the manufacturer for remedy information.");
  card.append(heading, campaign, summary, remedy);
  return card;
}

async function analyzeSymptoms() {
  const symptoms = elements.symptoms.value.trim();
  setAIResponse("");

  if (!currentVehicle) return setAIResponse("Decode a vehicle before using AI Mechanic.", true);
  if (symptoms.length < 10) return setAIResponse("Please describe the symptoms in a little more detail.", true);
  if (getDailyUsage().count >= config.dailyBrowserLimit) {
    return setAIResponse("This browser has reached its AutoWise daily analysis limit. Please return tomorrow.", true);
  }

  setButtonLoading(elements.analyzeButton, true, "Analyzing…");
  setAIResponse("AutoWise is analyzing the vehicle and symptoms...", false, true);

  try {
    const headers = { "Content-Type": "application/json" };
    const accessCode = localStorage.getItem(STORAGE.accessCode) || elements.accessCode.value.trim();
    if (accessCode) headers["X-AutoWise-Access-Code"] = accessCode;

    const response = await fetchWithTimeout(AI_MECHANIC_API, {
      method: "POST",
      headers,
      body: JSON.stringify({ vehicle: currentVehicle, symptoms, visitorId })
    }, 32_000);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "AI Mechanic could not complete the analysis.");
      error.code = data.code || "UNKNOWN_ERROR";
      throw error;
    }

    if (!data.analysis) throw new Error("AI Mechanic returned an empty response.");
    currentAnalysis = data.analysis;
    setAIResponse(currentAnalysis);
    elements.responseActions.hidden = false;
    incrementDailyUsage();
    saveAnalysis({ symptoms, analysis: currentAnalysis, generatedAt: data.meta?.generatedAt });
    trackEvent("analysis_completed");
  } catch (error) {
    console.error("AI Mechanic failed:", error);
    if (error.code === "ACCESS_REQUIRED") {
      elements.accessCode.focus();
      elements.accessCodeStatus.textContent = "A valid beta code is required by the server.";
      elements.accessCodeStatus.classList.add("error");
    }

    const message = error.name === "AbortError" ? "AI Mechanic took too long to respond. Please try again." : error.message || "AI Mechanic is unavailable right now.";
    setAIResponse(message, true);
    trackEvent("analysis_failed", { code: error.code || error.name });
  } finally {
    setButtonLoading(elements.analyzeButton, false);
  }
}

function createMaintenanceChecklist() {
  const mileage = Number(elements.mileage.value);
  elements.maintenanceResponse.style.display = "block";
  elements.maintenanceResponse.classList.remove("error");

  if (!Number.isFinite(mileage) || mileage <= 0) {
    elements.maintenanceResponse.textContent = "Enter a valid current mileage first.";
    elements.maintenanceResponse.classList.add("error");
    return;
  }

  const title = document.createElement("strong");
  const intro = document.createElement("p");
  const list = document.createElement("ul");
  title.textContent = `General checklist around ${mileage.toLocaleString()} miles`;
  intro.textContent = "Review service records first, then confirm the correct intervals in the owner’s manual:";
  list.className = "maintenance-list";

  const tasks = [
    "Check engine oil level and change interval",
    "Inspect tire pressure, tread, wear pattern, and rotation history",
    "Inspect brake pads, rotors, hoses, and brake-fluid condition",
    "Check battery condition, exterior lights, wipers, and washer fluid",
    "Inspect fluid levels and look for leaks"
  ];
  if (mileage >= 30_000) tasks.push("Review engine and cabin air-filter replacement history");
  if (mileage >= 60_000) tasks.push("Review coolant, belts, hoses, and transmission-service requirements");
  if (mileage >= 90_000) tasks.push("Review spark plugs and model-specific timing-belt or timing-chain inspection guidance");

  tasks.forEach((task) => {
    const item = document.createElement("li");
    item.textContent = task;
    list.append(item);
  });

  const note = document.createElement("p");
  note.className = "field-help";
  note.textContent = "This is a general planning checklist, not the manufacturer’s vehicle-specific maintenance schedule.";
  elements.maintenanceResponse.replaceChildren(title, intro, list, note);
  trackEvent("maintenance_checklist_created");
}

function saveVehicle() {
  if (!currentVehicle) return;
  localStorage.setItem(STORAGE.vehicle, JSON.stringify(currentVehicle));
  elements.saveVehicleButton.textContent = "✓ Saved to Garage";
  elements.removeSavedVehicleButton.hidden = false;
  elements.loadSavedVehicleButton.hidden = false;
  setStatus("Vehicle saved in this browser.");
  trackEvent("vehicle_saved");
}

function loadSavedVehicle() {
  const savedVehicle = readJSON(STORAGE.vehicle, null);
  if (!isUsableVehicle(savedVehicle)) return;
  currentVehicle = savedVehicle;
  elements.vin.value = savedVehicle.vin;
  renderVehicle();
  setStatus("Saved vehicle loaded.");
}

function removeSavedVehicle() {
  localStorage.removeItem(STORAGE.vehicle);
  elements.saveVehicleButton.textContent = "☆ Save to Garage";
  elements.removeSavedVehicleButton.hidden = true;
  elements.loadSavedVehicleButton.hidden = true;
  setStatus("Saved vehicle removed from this browser.");
}

function saveAccessCode() {
  const code = elements.accessCode.value.trim();
  elements.accessCodeStatus.classList.remove("error");
  if (!code) {
    localStorage.removeItem(STORAGE.accessCode);
    elements.accessCodeStatus.textContent = "Saved beta code removed.";
    return;
  }
  localStorage.setItem(STORAGE.accessCode, code);
  elements.accessCodeStatus.textContent = "Beta code saved in this browser. It will be verified when you analyze symptoms.";
}

async function copyAnalysis() {
  if (!currentAnalysis) return;
  const report = `${vehicleName(currentVehicle)}\n${elements.symptoms.value.trim()}\n\n${currentAnalysis}`;
  try {
    await navigator.clipboard.writeText(report);
    elements.copyResponseButton.textContent = "Copied";
    window.setTimeout(() => { elements.copyResponseButton.textContent = "Copy Analysis"; }, 1600);
  } catch {
    setAIResponse(`${currentAnalysis}\n\nCopying was blocked by the browser. Select the text above manually.`, true);
  }
}

function saveAnalysis({ symptoms, analysis, generatedAt }) {
  const history = readJSON(STORAGE.analysisHistory, []);
  const nextHistory = [{
    vehicle: vehicleName(currentVehicle),
    symptoms,
    analysis,
    generatedAt: generatedAt || new Date().toISOString()
  }, ...history].slice(0, 5);
  localStorage.setItem(STORAGE.analysisHistory, JSON.stringify(nextHistory));
  renderAnalysisHistory();
}

function renderAnalysisHistory() {
  const history = readJSON(STORAGE.analysisHistory, []);
  elements.analysisHistoryPanel.hidden = history.length === 0;
  elements.analysisHistory.replaceChildren(...history.map((entry, index) => {
    const item = document.createElement("div");
    const button = document.createElement("button");
    const title = document.createElement("strong");
    const date = document.createElement("small");
    item.className = "history-item";
    title.textContent = entry.vehicle || "Saved analysis";
    date.textContent = formatDate(entry.generatedAt);
    button.append(title, date);
    button.addEventListener("click", () => loadAnalysisFromHistory(index));
    item.append(button);
    return item;
  }));
}

function loadAnalysisFromHistory(index) {
  const entry = readJSON(STORAGE.analysisHistory, [])[index];
  if (!entry) return;
  elements.symptoms.value = entry.symptoms || "";
  currentAnalysis = entry.analysis || "";
  updateSymptomCount();
  setAIResponse(currentAnalysis);
  elements.responseActions.hidden = !currentAnalysis;
  elements.analysisHistoryPanel.open = false;
}

function clearAnalysisHistory() {
  localStorage.removeItem(STORAGE.analysisHistory);
  elements.analysisHistoryPanel.hidden = true;
  elements.analysisHistory.replaceChildren();
}

function updateDailyUsage() {
  const usage = getDailyUsage();
  const remaining = Math.max(0, config.dailyBrowserLimit - usage.count);
  elements.dailyUsage.textContent = `${remaining} of ${config.dailyBrowserLimit} browser analyses available today`;
  elements.analyzeButton.disabled = remaining === 0;
}

function getDailyUsage() {
  const today = localDateKey();
  const usage = readJSON(STORAGE.dailyUsage, { date: today, count: 0 });
  return usage.date === today ? usage : { date: today, count: 0 };
}

function incrementDailyUsage() {
  const usage = getDailyUsage();
  localStorage.setItem(STORAGE.dailyUsage, JSON.stringify({ date: usage.date, count: usage.count + 1 }));
  updateDailyUsage();
}

function createNotice(message) {
  const notice = document.createElement("div");
  notice.className = "notice";
  notice.textContent = message;
  return notice;
}

function appendLabeledText(element, label, value) {
  const strong = document.createElement("strong");
  strong.textContent = label;
  element.append(strong, document.createTextNode(` ${value}`));
}

function engineText(vehicle) {
  const pieces = [];
  if (vehicle.cylinders) pieces.push(`${vehicle.cylinders} cylinder`);
  if (vehicle.liters) pieces.push(`${vehicle.liters}L`);
  return pieces.join(" • ") || "Not listed";
}

function vehicleName(vehicle) {
  return [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ");
}

function cleanValue(value) { return String(value || "").trim(); }
function isUsableVehicle(vehicle) { return Boolean(vehicle?.vin && vehicle?.year && vehicle?.make && vehicle?.model); }
function localDateKey() { return new Date().toLocaleDateString("en-CA"); }
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Saved analysis" : date.toLocaleString();
}

function updateSymptomCount() { elements.symptomCount.textContent = `${elements.symptoms.value.length} / 1500`; }
function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}
function setAIResponse(message, isError = false, isLoading = false) {
  elements.aiResponse.style.display = message ? "block" : "none";
  elements.aiResponse.textContent = message;
  elements.aiResponse.classList.toggle("error", isError);
  elements.aiResponse.classList.toggle("loading", isLoading);
  if (!message || isError) elements.responseActions.hidden = true;
}
function setButtonLoading(button, isLoading, loadingText = "Loading…") {
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
    return;
  }
  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
  delete button.dataset.originalText;
  if (button === elements.analyzeButton) updateDailyUsage();
}

function getOrCreateVisitorId() {
  const saved = localStorage.getItem(STORAGE.visitorId);
  if (saved) return saved;
  const generated = globalThis.crypto?.randomUUID?.() || `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(STORAGE.visitorId, generated);
  return generated;
}

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function isSafeCheckoutUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ["buy.stripe.com", "checkout.stripe.com"].includes(parsed.hostname);
  } catch { return false; }
}

function trackEvent(name, details = {}) {
  window.dispatchEvent(new CustomEvent("autowise:event", { detail: { name, ...details } }));
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    console.info("AutoWise event", name, details);
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { window.clearTimeout(timeout); }
}
