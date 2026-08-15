const NHTSA_VIN_API = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/";
const NHTSA_RECALL_API = "https://api.nhtsa.gov/recalls/recallsByVehicle";
const AI_MECHANIC_API = "/.netlify/functions/ai-mechanic";
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

let currentVehicle = null;

const elements = {
  addVehicleButton: document.getElementById("addVehicleButton"),
  aiResponse: document.getElementById("aiResponse"),
  analyzeButton: document.getElementById("analyzeButton"),
  decodeButton: document.getElementById("decodeButton"),
  maintenanceButton: document.getElementById("maintenanceButton"),
  maintenanceResponse: document.getElementById("maintenanceResponse"),
  mileage: document.getElementById("mileage"),
  recallButton: document.getElementById("recallButton"),
  recallResults: document.getElementById("recallResults"),
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

elements.addVehicleButton.addEventListener("click", scrollToVIN);
elements.decodeButton.addEventListener("click", decodeVIN);
elements.vin.addEventListener("keydown", (event) => {
  if (event.key === "Enter") decodeVIN();
});
elements.vin.addEventListener("input", () => {
  elements.vin.value = elements.vin.value.toUpperCase().replace(/\s/g, "");
});
elements.saveVehicleButton.addEventListener("click", saveVehicle);
elements.recallButton.addEventListener("click", loadRecalls);
elements.analyzeButton.addEventListener("click", analyzeSymptoms);
elements.maintenanceButton.addEventListener("click", maintenancePreview);
elements.symptoms.addEventListener("input", updateSymptomCount);

document.querySelectorAll("[data-tool]").forEach((button) => {
  button.addEventListener("click", () => showTool(button.dataset.tool));
});

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
    const response = await fetchWithTimeout(
      `${NHTSA_VIN_API}${encodeURIComponent(vin)}?format=json`,
      {},
      12000
    );

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
  } catch (error) {
    console.error("VIN decode failed:", error);
    setStatus("The VIN service is unavailable right now. Please try again in a moment.", true);
  } finally {
    setButtonLoading(elements.decodeButton, false);
  }
}

function renderVehicle() {
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

  elements.vehicleDashboard.style.display = "block";
  elements.vehicleDashboard.scrollIntoView({ behavior: "smooth", block: "start" });
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
  document.querySelectorAll(".tool-panel").forEach((panel) => {
    panel.style.display = "none";
  });

  const panel = document.getElementById(id);
  if (!panel) return;

  panel.style.display = "block";
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadRecalls() {
  if (!currentVehicle) return;

  setButtonLoading(elements.recallButton, true, "Checking…");
  elements.recallResults.replaceChildren(createNotice("Searching NHTSA recall information..."));

  try {
    const query = new URLSearchParams({
      make: currentVehicle.make,
      model: currentVehicle.model,
      modelYear: currentVehicle.year
    });
    const response = await fetchWithTimeout(`${NHTSA_RECALL_API}?${query}`, {}, 12000);

    if (!response.ok) throw new Error("Recall service returned an error.");

    const data = await response.json();
    const recalls = Array.isArray(data.results) ? data.results : [];

    if (recalls.length === 0) {
      elements.recallResults.replaceChildren(
        createNotice(
          "No recall campaigns were returned for this year, make, and model. Check your exact VIN at NHTSA.gov because recall eligibility can vary by vehicle."
        )
      );
      return;
    }

    elements.recallResults.replaceChildren(...recalls.slice(0, 10).map(createRecall));
  } catch (error) {
    console.error("Recall lookup failed:", error);
    elements.recallResults.replaceChildren(
      createNotice("Recall information could not be loaded right now. Please try again later.")
    );
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
  campaign.append(document.createElement("strong"), document.createTextNode(` ${recall.NHTSACampaignNumber || "Not listed"}`));
  campaign.querySelector("strong").textContent = "Campaign:";
  summary.textContent = recall.Summary || "No summary available.";
  remedy.append(document.createElement("strong"), document.createTextNode(` ${recall.Remedy || "Contact the manufacturer for remedy information."}`));
  remedy.querySelector("strong").textContent = "Remedy:";
  card.append(heading, campaign, summary, remedy);
  return card;
}

async function analyzeSymptoms() {
  const symptoms = elements.symptoms.value.trim();
  setAIResponse("", false);

  if (!currentVehicle) {
    setAIResponse("Decode a vehicle before using AI Mechanic.", true);
    return;
  }

  if (symptoms.length < 10) {
    setAIResponse("Please describe the symptoms in a little more detail.", true);
    return;
  }

  setButtonLoading(elements.analyzeButton, true, "Analyzing…");
  setAIResponse("AutoWise is analyzing the vehicle and symptoms...", false, true);

  try {
    const response = await fetchWithTimeout(
      AI_MECHANIC_API,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle: currentVehicle, symptoms })
      },
      35000
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "AI Mechanic could not complete the analysis.");
    }

    if (!data.analysis) throw new Error("AI Mechanic returned an empty response.");
    setAIResponse(data.analysis);
  } catch (error) {
    console.error("AI Mechanic failed:", error);
    const message = error.name === "AbortError"
      ? "AI Mechanic took too long to respond. Please try again."
      : error.message || "AI Mechanic is unavailable right now. Please try again later.";
    setAIResponse(message, true);
  } finally {
    setButtonLoading(elements.analyzeButton, false);
  }
}

function maintenancePreview() {
  const mileage = Number(elements.mileage.value);
  elements.maintenanceResponse.style.display = "block";
  elements.maintenanceResponse.classList.remove("error");

  if (!Number.isFinite(mileage) || mileage <= 0) {
    elements.maintenanceResponse.textContent = "Enter a valid current mileage first.";
    elements.maintenanceResponse.classList.add("error");
    return;
  }

  elements.maintenanceResponse.textContent =
    `${mileage.toLocaleString()} miles\n\nVehicle and mileage information are ready. ` +
    "A future version will use these together for maintenance recommendations.";
}

function saveVehicle() {
  if (!currentVehicle) return;

  localStorage.setItem("autowiseVehicle", JSON.stringify(currentVehicle));
  const originalText = elements.saveVehicleButton.textContent;
  elements.saveVehicleButton.textContent = "✓ Saved to Garage";
  window.setTimeout(() => {
    elements.saveVehicleButton.textContent = originalText;
  }, 1800);
}

function createNotice(message) {
  const notice = document.createElement("div");
  notice.className = "notice";
  notice.textContent = message;
  return notice;
}

function engineText(vehicle) {
  const pieces = [];
  if (vehicle.cylinders) pieces.push(`${vehicle.cylinders} cylinder`);
  if (vehicle.liters) pieces.push(`${vehicle.liters}L`);
  return pieces.join(" • ") || "Not listed";
}

function vehicleName(vehicle) {
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
}

function cleanValue(value) {
  return String(value || "").trim();
}

function updateSymptomCount() {
  elements.symptomCount.textContent = `${elements.symptoms.value.length} / 1500`;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function setAIResponse(message, isError = false, isLoading = false) {
  elements.aiResponse.style.display = message ? "block" : "none";
  elements.aiResponse.textContent = message;
  elements.aiResponse.classList.toggle("error", isError);
  elements.aiResponse.classList.toggle("loading", isLoading);
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
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}
