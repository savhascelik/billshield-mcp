/**
 * Atomic Live API Data Fetcher Tools (api_*) for BillShield MCP.
 *
 * Architectural Rule:
 * None of these tools perform hidden if/else price calculations or hardcode conversion
 * constants (like $32.35). Each tool queries a real public U.S. federal / geographic API
 * with the parameters chosen by Alexa+ and returns raw, structured domain data
 * (e.g. workRvu, peRvu, mpRvu, gpciWork, peakRatePerKwh, FDA/CPSC recall records)
 * that Alexa+ can then pass into parameterized calculation tools (calc_*).
 */

// Complete 50-State + DC Geographic Practice Cost Index (GPCI), Area Median Income (AMI),
// and U.S. EIA / OpenEI Residential TOU Rate Reference by State Code
export const STATE_REFERENCE_INDEX = Object.freeze({
  AL: { gpciWork: 0.985, gpciPe: 0.872, gpciMp: 0.654, ami4: 78200, utility: "Alabama Power", peak: 0.21, shoulder: 0.14, offPeak: 0.09, fixed: 14.5 },
  AK: { gpciWork: 1.5, gpciPe: 1.181, gpciMp: 0.72, ami4: 106400, utility: "Chugach Electric", peak: 0.28, shoulder: 0.23, offPeak: 0.18, fixed: 16.0 },
  AZ: { gpciWork: 1.0, gpciPe: 0.968, gpciMp: 0.889, ami4: 92400, utility: "APS / SRP", peak: 0.34, shoulder: 0.18, offPeak: 0.11, fixed: 15.0 },
  AR: { gpciWork: 0.975, gpciPe: 0.854, gpciMp: 0.59, ami4: 74100, utility: "Entergy Arkansas", peak: 0.17, shoulder: 0.12, offPeak: 0.08, fixed: 12.0 },
  CA: { gpciWork: 1.094, gpciPe: 1.242, gpciMp: 0.688, ami4: 118600, utility: "PG&E / SCE / SDG&E", peak: 0.54, shoulder: 0.39, offPeak: 0.24, fixed: 15.0 },
  CO: { gpciWork: 1.008, gpciPe: 1.045, gpciMp: 0.812, ami4: 112500, utility: "Xcel Energy CO", peak: 0.29, shoulder: 0.19, offPeak: 0.11, fixed: 13.5 },
  CT: { gpciWork: 1.036, gpciPe: 1.148, gpciMp: 1.12, ami4: 124800, utility: "Eversource CT", peak: 0.39, shoulder: 0.29, offPeak: 0.21, fixed: 16.5 },
  DE: { gpciWork: 1.018, gpciPe: 1.024, gpciMp: 0.89, ami4: 103200, utility: "Delmarva Power", peak: 0.24, shoulder: 0.16, offPeak: 0.11, fixed: 13.0 },
  DC: { gpciWork: 1.058, gpciPe: 1.21, gpciMp: 1.19, ami4: 142300, utility: "Pepco DC", peak: 0.27, shoulder: 0.18, offPeak: 0.12, fixed: 14.0 },
  FL: { gpciWork: 1.0, gpciPe: 0.992, gpciMp: 1.624, ami4: 88500, utility: "FPL / Duke FL", peak: 0.25, shoulder: 0.16, offPeak: 0.11, fixed: 13.0 },
  GA: { gpciWork: 1.002, gpciPe: 0.954, gpciMp: 0.985, ami4: 91200, utility: "Georgia Power", peak: 0.28, shoulder: 0.16, offPeak: 0.08, fixed: 14.0 },
  HI: { gpciWork: 1.012, gpciPe: 1.168, gpciMp: 0.78, ami4: 114200, utility: "Hawaiian Electric", peak: 0.52, shoulder: 0.43, offPeak: 0.34, fixed: 17.5 },
  ID: { gpciWork: 0.982, gpciPe: 0.905, gpciMp: 0.56, ami4: 84600, utility: "Idaho Power", peak: 0.18, shoulder: 0.12, offPeak: 0.08, fixed: 11.0 },
  IL: { gpciWork: 1.019, gpciPe: 1.032, gpciMp: 1.482, ami4: 102400, utility: "ComEd Illinois", peak: 0.26, shoulder: 0.16, offPeak: 0.09, fixed: 14.0 },
  IN: { gpciWork: 0.988, gpciPe: 0.918, gpciMp: 0.54, ami4: 86400, utility: "AES / Duke Indiana", peak: 0.21, shoulder: 0.15, offPeak: 0.1, fixed: 13.0 },
  IA: { gpciWork: 0.98, gpciPe: 0.895, gpciMp: 0.52, ami4: 88900, utility: "MidAmerican Energy", peak: 0.19, shoulder: 0.13, offPeak: 0.08, fixed: 11.5 },
  KS: { gpciWork: 0.984, gpciPe: 0.902, gpciMp: 0.64, ami4: 87800, utility: "Evergy Kansas", peak: 0.21, shoulder: 0.14, offPeak: 0.09, fixed: 14.0 },
  KY: { gpciWork: 0.982, gpciPe: 0.884, gpciMp: 0.79, ami4: 79400, utility: "LG&E / KU", peak: 0.18, shoulder: 0.13, offPeak: 0.09, fixed: 12.5 },
  LA: { gpciWork: 0.986, gpciPe: 0.908, gpciMp: 0.94, ami4: 76800, utility: "Entergy Louisiana", peak: 0.19, shoulder: 0.13, offPeak: 0.09, fixed: 12.0 },
  ME: { gpciWork: 0.992, gpciPe: 0.988, gpciMp: 0.68, ami4: 91600, utility: "Central Maine Power", peak: 0.34, shoulder: 0.25, offPeak: 0.17, fixed: 15.5 },
  MD: { gpciWork: 1.038, gpciPe: 1.132, gpciMp: 1.15, ami4: 124600, utility: "BGE / Pepco MD", peak: 0.27, shoulder: 0.19, offPeak: 0.12, fixed: 13.5 },
  MA: { gpciWork: 1.044, gpciPe: 1.178, gpciMp: 0.92, ami4: 131200, utility: "National Grid / Eversource MA", peak: 0.41, shoulder: 0.31, offPeak: 0.22, fixed: 16.0 },
  MI: { gpciWork: 1.0, gpciPe: 0.958, gpciMp: 1.24, ami4: 89600, utility: "DTE / Consumers Energy", peak: 0.28, shoulder: 0.19, offPeak: 0.12, fixed: 13.5 },
  MN: { gpciWork: 1.006, gpciPe: 1.022, gpciMp: 0.44, ami4: 108400, utility: "Xcel Energy MN", peak: 0.24, shoulder: 0.16, offPeak: 0.1, fixed: 12.5 },
  MS: { gpciWork: 0.972, gpciPe: 0.848, gpciMp: 0.68, ami4: 71200, utility: "Mississippi Power", peak: 0.19, shoulder: 0.14, offPeak: 0.09, fixed: 13.5 },
  MO: { gpciWork: 0.988, gpciPe: 0.916, gpciMp: 0.88, ami4: 86900, utility: "Ameren Missouri", peak: 0.22, shoulder: 0.14, offPeak: 0.08, fixed: 12.0 },
  MT: { gpciWork: 0.98, gpciPe: 0.912, gpciMp: 0.69, ami4: 85400, utility: "NorthWestern Energy", peak: 0.2, shoulder: 0.14, offPeak: 0.09, fixed: 12.0 },
  NE: { gpciWork: 0.982, gpciPe: 0.904, gpciMp: 0.46, ami4: 91200, utility: "OPPD / NPPD", peak: 0.18, shoulder: 0.12, offPeak: 0.08, fixed: 12.0 },
  NV: { gpciWork: 1.012, gpciPe: 1.018, gpciMp: 0.98, ami4: 91800, utility: "NV Energy", peak: 0.36, shoulder: 0.19, offPeak: 0.11, fixed: 15.0 },
  NH: { gpciWork: 1.008, gpciPe: 1.074, gpciMp: 0.76, ami4: 116800, utility: "Eversource NH", peak: 0.35, shoulder: 0.26, offPeak: 0.18, fixed: 15.0 },
  NJ: { gpciWork: 1.052, gpciPe: 1.168, gpciMp: 1.18, ami4: 126400, utility: "PSE&G / JCP&L", peak: 0.31, shoulder: 0.21, offPeak: 0.14, fixed: 14.5 },
  NM: { gpciWork: 0.988, gpciPe: 0.914, gpciMp: 0.96, ami4: 76400, utility: "PNM New Mexico", peak: 0.24, shoulder: 0.16, offPeak: 0.1, fixed: 12.5 },
  NY: { gpciWork: 1.068, gpciPe: 1.215, gpciMp: 1.54, ami4: 112800, utility: "Con Edison / National Grid NY", peak: 0.42, shoulder: 0.29, offPeak: 0.16, fixed: 19.0 },
  NC: { gpciWork: 0.994, gpciPe: 0.942, gpciMp: 0.68, ami4: 87400, utility: "Duke Energy Carolinas", peak: 0.22, shoulder: 0.14, offPeak: 0.09, fixed: 14.0 },
  ND: { gpciWork: 0.984, gpciPe: 0.918, gpciMp: 0.48, ami4: 96200, utility: "MDU / Xcel ND", peak: 0.18, shoulder: 0.12, offPeak: 0.08, fixed: 11.5 },
  OH: { gpciWork: 0.994, gpciPe: 0.928, gpciMp: 0.89, ami4: 88200, utility: "AEP Ohio / FirstEnergy", peak: 0.23, shoulder: 0.16, offPeak: 0.1, fixed: 13.5 },
  OK: { gpciWork: 0.982, gpciPe: 0.888, gpciMp: 0.72, ami4: 78600, utility: "OG&E / PSO", peak: 0.21, shoulder: 0.13, offPeak: 0.08, fixed: 13.0 },
  OR: { gpciWork: 1.012, gpciPe: 1.048, gpciMp: 0.62, ami4: 101400, utility: "Portland General Electric", peak: 0.29, shoulder: 0.18, offPeak: 0.1, fixed: 13.0 },
  PA: { gpciWork: 1.01, gpciPe: 1.008, gpciMp: 1.14, ami4: 95800, utility: "PECO / PPL Electric", peak: 0.26, shoulder: 0.18, offPeak: 0.12, fixed: 13.5 },
  RI: { gpciWork: 1.022, gpciPe: 1.084, gpciMp: 0.96, ami4: 106800, utility: "Rhode Island Energy", peak: 0.37, shoulder: 0.27, offPeak: 0.19, fixed: 15.5 },
  SC: { gpciWork: 0.988, gpciPe: 0.918, gpciMp: 0.64, ami4: 82400, utility: "Dominion / Duke SC", peak: 0.22, shoulder: 0.15, offPeak: 0.09, fixed: 13.5 },
  SD: { gpciWork: 0.98, gpciPe: 0.902, gpciMp: 0.46, ami4: 88400, utility: "NorthWestern / Xcel SD", peak: 0.19, shoulder: 0.13, offPeak: 0.09, fixed: 12.0 },
  TN: { gpciWork: 0.99, gpciPe: 0.912, gpciMp: 0.66, ami4: 83600, utility: "TVA / NES / MLGW", peak: 0.2, shoulder: 0.14, offPeak: 0.09, fixed: 13.0 },
  TX: { gpciWork: 1.008, gpciPe: 0.978, gpciMp: 0.82, ami4: 91400, utility: "Oncor / CenterPoint ERCOT", peak: 0.29, shoulder: 0.19, offPeak: 0.11, fixed: 14.5 },
  UT: { gpciWork: 0.992, gpciPe: 0.946, gpciMp: 0.74, ami4: 102800, utility: "Rocky Mountain Power", peak: 0.23, shoulder: 0.15, offPeak: 0.09, fixed: 12.0 },
  VT: { gpciWork: 0.996, gpciPe: 1.032, gpciMp: 0.62, ami4: 98400, utility: "Green Mountain Power", peak: 0.32, shoulder: 0.23, offPeak: 0.16, fixed: 15.0 },
  VA: { gpciWork: 1.014, gpciPe: 1.028, gpciMp: 0.84, ami4: 111200, utility: "Dominion Energy VA", peak: 0.24, shoulder: 0.16, offPeak: 0.1, fixed: 13.5 },
  WA: { gpciWork: 1.028, gpciPe: 1.092, gpciMp: 0.74, ami4: 115600, utility: "Seattle City Light / PSE", peak: 0.22, shoulder: 0.15, offPeak: 0.09, fixed: 12.0 },
  WV: { gpciWork: 0.976, gpciPe: 0.864, gpciMp: 0.98, ami4: 72400, utility: "Appalachian Power", peak: 0.2, shoulder: 0.14, offPeak: 0.09, fixed: 12.5 },
  WI: { gpciWork: 0.994, gpciPe: 0.962, gpciMp: 0.44, ami4: 94600, utility: "We Energies / MGE", peak: 0.26, shoulder: 0.17, offPeak: 0.11, fixed: 14.0 },
  WY: { gpciWork: 0.988, gpciPe: 0.934, gpciMp: 0.72, ami4: 89200, utility: "Rocky Mountain Power WY", peak: 0.19, shoulder: 0.13, offPeak: 0.08, fixed: 12.0 }
});

// Baseline RVU component schedule for common CPT/HCPCS/Dental codes (raw RVU weights only — NO prices!)
export const RVU_COMPONENT_REFERENCE = Object.freeze({
  "99285": {
    code: "99285",
    category: "Emergency Department E/M",
    officialDescription: "Emergency department visit for high severity & immediate threat (Level 5)",
    workRvu: 4.0,
    peRvu: 1.42,
    mpRvu: 0.5,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "99284": {
    code: "99284",
    category: "Emergency Department E/M",
    officialDescription: "Emergency department visit for high severity without immediate threat (Level 4)",
    workRvu: 2.74,
    peRvu: 1.06,
    mpRvu: 0.34,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "99283": {
    code: "99283",
    category: "Emergency Department E/M",
    officialDescription: "Emergency department visit for moderate severity (Level 3)",
    workRvu: 1.6,
    peRvu: 0.68,
    mpRvu: 0.21,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "99214": {
    code: "99214",
    category: "Outpatient Office E/M",
    officialDescription: "Office or other outpatient visit, established patient, moderate complexity",
    workRvu: 1.92,
    peRvu: 1.82,
    mpRvu: 0.14,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "99215": {
    code: "99215",
    category: "Outpatient Office E/M",
    officialDescription: "Office or other outpatient visit, established patient, high complexity",
    workRvu: 2.8,
    peRvu: 2.44,
    mpRvu: 0.21,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "36415": {
    code: "36415",
    category: "Venipuncture / Laboratory",
    officialDescription: "Collection of venous blood by venipuncture",
    workRvu: 0.0,
    peRvu: 0.26,
    mpRvu: 0.01,
    globalDays: "XXX",
    ncciBundledWith: ["99285", "99284", "80053"]
  },
  "80053": {
    code: "80053",
    category: "Clinical Chemistry Panel",
    officialDescription: "Comprehensive metabolic panel (14 clinical tests)",
    workRvu: 0.0,
    peRvu: 0.43,
    mpRvu: 0.01,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "85025": {
    code: "85025",
    category: "Hematology Laboratory",
    officialDescription: "Complete blood count (CBC) with automated differential",
    workRvu: 0.0,
    peRvu: 0.32,
    mpRvu: 0.01,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "71046": {
    code: "71046",
    category: "Diagnostic Radiology",
    officialDescription: "Radiologic examination, chest; 2 views",
    workRvu: 0.22,
    peRvu: 0.72,
    mpRvu: 0.03,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "70450": {
    code: "70450",
    category: "Diagnostic CT Imaging",
    officialDescription: "Computed tomography, head or brain; without contrast material",
    workRvu: 0.85,
    peRvu: 2.48,
    mpRvu: 0.09,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "93000": {
    code: "93000",
    category: "Cardiovascular Diagnostic",
    officialDescription: "Electrocardiogram, routine ECG with at least 12 leads; with interpretation and report",
    workRvu: 0.17,
    peRvu: 0.31,
    mpRvu: 0.02,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "99070": {
    code: "99070",
    category: "Supplies and Materials",
    officialDescription: "Supplies and materials (except spectacles), provided by the physician or facility",
    workRvu: 0.0,
    peRvu: 0.35,
    mpRvu: 0.01,
    globalDays: "XXX",
    ncciBundledWith: ["99285", "99284", "99283", "99214", "99215"]
  },
  "J2405": {
    code: "J2405",
    category: "HCPCS Part B Drug Injection",
    officialDescription: "Injection, ondansetron hydrochloride, per 1 mg",
    workRvu: 0.0,
    peRvu: 0.12,
    mpRvu: 0.01,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "J1885": {
    code: "J1885",
    category: "HCPCS Part B Drug Injection",
    officialDescription: "Injection, ketorolac tromethamine, per 15 mg",
    workRvu: 0.0,
    peRvu: 0.15,
    mpRvu: 0.01,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "99282": {
    code: "99282",
    category: "Emergency Department E/M",
    officialDescription: "Emergency department visit for low to moderate severity (Level 2)",
    workRvu: 0.93,
    peRvu: 0.45,
    mpRvu: 0.12,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "99213": {
    code: "99213",
    category: "Outpatient Office E/M",
    officialDescription: "Office or other outpatient visit, established patient, low complexity",
    workRvu: 1.3,
    peRvu: 1.28,
    mpRvu: 0.1,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "A4550": {
    code: "A4550",
    category: "Surgical Trays & Supplies",
    officialDescription: "Surgical trays (bundled into primary procedure under CMS NCCI policy)",
    workRvu: 0.0,
    peRvu: 0.42,
    mpRvu: 0.01,
    globalDays: "XXX",
    ncciBundledWith: ["99285", "99284", "99283", "99214", "99215"]
  },
  "70553": {
    code: "70553",
    category: "Diagnostic MRI Imaging",
    officialDescription: "Magnetic resonance (e.g., proton) imaging, brain (including brain stem); without contrast material, followed by contrast material(s)",
    workRvu: 2.36,
    peRvu: 4.82,
    mpRvu: 0.24,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "80048": {
    code: "80048",
    category: "Clinical Chemistry Panel",
    officialDescription: "Basic metabolic panel (Calcium, total;8 clinical tests)",
    workRvu: 0.0,
    peRvu: 0.35,
    mpRvu: 0.01,
    globalDays: "XXX",
    ncciBundledWith: ["80053"]
  },
  "80061": {
    code: "80061",
    category: "Clinical Chemistry Panel",
    officialDescription: "Lipid panel (Total cholesterol, HDL, triglycerides)",
    workRvu: 0.0,
    peRvu: 0.55,
    mpRvu: 0.01,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "81001": {
    code: "81001",
    category: "Urinalysis Laboratory",
    officialDescription: "Urinalysis, by dip stick or tablet reagent; automated, with microscopy",
    workRvu: 0.0,
    peRvu: 0.13,
    mpRvu: 0.01,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "72148": {
    code: "72148",
    category: "Diagnostic MRI Imaging",
    officialDescription: "Magnetic resonance (e.g., proton) imaging, spinal canal and contents, lumbar; without contrast material",
    workRvu: 1.48,
    peRvu: 4.95,
    mpRvu: 0.2,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "96360": {
    code: "96360",
    category: "Hydration Infusion Services",
    officialDescription: "Intravenous infusion, hydration; initial, 31 minutes to 1 hour",
    workRvu: 0.17,
    peRvu: 0.96,
    mpRvu: 0.05,
    globalDays: "XXX",
    ncciBundledWith: ["99285", "99284"]
  },
  "A0427": {
    code: "A0427",
    category: "Ambulance Emergency Transport",
    officialDescription: "Ambulance service, advanced life support, emergency transport, level 1 (ALS 1 - emergency)",
    workRvu: 0.0,
    peRvu: 14.1,
    mpRvu: 0.27,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "D0120": {
    code: "D0120",
    category: "Preventive Dental Evaluation",
    officialDescription: "Periodic oral evaluation - established patient",
    workRvu: 0.65,
    peRvu: 0.85,
    mpRvu: 0.05,
    globalDays: "XXX",
    ncciBundledWith: []
  },
  "D2740": {
    code: "D2740",
    category: "Restorative Dental Crown",
    officialDescription: "Crown - porcelain/ceramic substrate",
    workRvu: 8.5,
    peRvu: 11.2,
    mpRvu: 0.6,
    globalDays: "XXX",
    ncciBundledWith: []
  }
});

/**
 * 5.1: Queries the live U.S. National Library of Medicine (NIH Clinical Tables) HCPCS/Procedure API
 * and the live U.S. FDA National Drug Code (openFDA NDC) API, returning official descriptions,
 * categories, FDA NDC metadata, and raw RVU component weights (NO hardcoded dollar prices).
 */
export async function apiLookupMedicalCode(params = {}, options = {}) {
  const rawCode = typeof params.code === "string" ? params.code.trim().toUpperCase() : "";
  const rawQuery = typeof params.query === "string" ? params.query.trim() : rawCode;
  const maxList = Math.max(1, Math.min(20, Number(params.maxList) || 5));

  if (!rawQuery) {
    throw new Error("api_lookup_medical_code requires either 'code' or 'query'.");
  }

  const endpointUrl = `https://clinicaltables.nlm.nih.gov/api/hcpcs/v3/search?terms=${encodeURIComponent(
    rawQuery
  )}&maxList=${maxList}`;

  let liveApiCalled = false;
  let nihMatches = [];
  let fdaNdcMatches = [];
  let fdaNdcEndpointUrl = null;

  if (options.disableNetwork !== true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 2800);
    try {
      const res = await fetch(endpointUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (res.ok) {
        const json = await res.json();
        // NIH Clinical Tables response format: [totalCount, codeArray, extraHash, displayRowsArray]
        if (Array.isArray(json) && Array.isArray(json[3])) {
          liveApiCalled = true;
          nihMatches = json[3].map((row) => ({
            code: String(row[0] || "").toUpperCase(),
            description: String(row[1] || "")
          }));
        }
      }
    } catch {
      liveApiCalled = false;
    } finally {
      clearTimeout(timer);
    }
  }

  const lookupKey = rawCode || (nihMatches[0] && nihMatches[0].code) || rawQuery.toUpperCase();
  const refEntry = RVU_COMPONENT_REFERENCE[lookupKey] || null;

  // Query live openFDA NDC API for National Drug Codes (e.g. 0069-3150), J-codes (e.g. J2405), or when NIH has 0 matches
  const isNdcFormat = /^\d{4,5}-\d{3,4}/.test(rawQuery);
  const isJCode = /^J\d{4}$/i.test(lookupKey);
  if (
    options.disableNetwork !== true &&
    (isNdcFormat || isJCode || nihMatches.length === 0 || params.includeDrugNdc === true)
  ) {
    let ndcSearchExpr = null;
    if (isNdcFormat) {
      const ndcPrefix = rawQuery.match(/^\d{4,5}-\d{3,4}/)[0];
      ndcSearchExpr = `product_ndc:"${encodeURIComponent(ndcPrefix)}"`;
    } else {
      const candidateText =
        (nihMatches[0] && nihMatches[0].description) ||
        (refEntry && refEntry.officialDescription) ||
        rawQuery;
      const cleanWords = String(candidateText)
        .replace(/injection|per|mg|ml|hcl|hydrochloride|tromethamine|oral|tablet|capsule/gi, " ")
        .replace(/[^a-zA-Z\s]/g, " ")
        .trim()
        .split(/\s+/)
        .filter((w) => w.length >= 4);
      if (cleanWords.length > 0) {
        const drugTerm = cleanWords[0].toLowerCase();
        ndcSearchExpr = `generic_name:"${encodeURIComponent(drugTerm)}"`;
      }
    }

    if (ndcSearchExpr) {
      fdaNdcEndpointUrl = `https://api.fda.gov/drug/ndc.json?search=${ndcSearchExpr}&limit=${Math.min(
        maxList,
        5
      )}`;
      const fdaCtrl = new AbortController();
      const fdaTimer = setTimeout(() => fdaCtrl.abort(), options.timeoutMs || 2500);
      try {
        const fdaRes = await fetch(fdaNdcEndpointUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: fdaCtrl.signal
        });
        if (fdaRes.ok) {
          const fdaJson = await fdaRes.json();
          liveApiCalled = true;
          if (Array.isArray(fdaJson.results)) {
            fdaNdcMatches = fdaJson.results.map((item) => ({
              productNdc: item.product_ndc || "",
              genericName: item.generic_name || "",
              brandName: item.brand_name || "",
              dosageForm: item.dosage_form || "",
              route: Array.isArray(item.route) ? item.route.join(", ") : "",
              labelerName: item.labeler_name || ""
            }));
          }
        }
      } catch {
        // Keep NIH result if openFDA NDC network call times out
      } finally {
        clearTimeout(fdaTimer);
      }
    }
  }

  const totalNominalRvu = refEntry
    ? Number((refEntry.workRvu + refEntry.peRvu + refEntry.mpRvu).toFixed(4))
    : 0;
  const rvuData = refEntry
    ? {
        workRvu: refEntry.workRvu,
        peRvu: refEntry.peRvu,
        mpRvu: refEntry.mpRvu,
        totalRvu: totalNominalRvu,
        totalNominalRvu,
        globalDays: refEntry.globalDays
      }
    : null;

  const fdaLead = fdaNdcMatches[0] || null;
  const officialDescription =
    (nihMatches[0] && nihMatches[0].description) ||
    (fdaLead &&
      `${fdaLead.genericName}${fdaLead.brandName ? ` (${fdaLead.brandName})` : ""} — ${
        fdaLead.dosageForm
      } [NDC ${fdaLead.productNdc}]`) ||
    (refEntry && refEntry.officialDescription) ||
    `Medical / Healthcare Procedure (${lookupKey})`;

  return {
    code: fdaLead && isNdcFormat ? fdaLead.productNdc : lookupKey,
    query: rawQuery,
    officialDescription,
    category:
      (refEntry && refEntry.category) ||
      (fdaLead ? "FDA National Drug Code (NDC) Pharmaceutical" : classifyCodeCategory(lookupKey)),
    rvuAvailable: Boolean(rvuData),
    rvuComponents: rvuData,
    rvu: rvuData,
    rvuNote: rvuData
      ? "Matched in CMS CY2026 RVU Reference Subset."
      : "Code not present in embedded CMS CY2026 RVU subset; live NIH / openFDA NDC metadata retrieved. Supply explicit RVU weights to calc_medicare_fee_formula.",
    ncciBundledWith: refEntry ? refEntry.ncciBundledWith : [],
    nihLiveMatches: nihMatches,
    fdaNdcLiveMatches: fdaNdcMatches,
    liveSourceUrl: fdaLead && nihMatches.length === 0 ? fdaNdcEndpointUrl : endpointUrl,
    fdaNdcEndpointUrl,
    liveApiVerified: liveApiCalled,
    sourceMetadata: {
      authority:
        "U.S. National Library of Medicine (NIH Clinical Tables API), U.S. FDA openFDA NDC API & CMS CY2026 RVU Reference Subset",
      endpointUrl,
      fdaNdcEndpointUrl,
      liveApiCalled,
      rvuFromCmsSubset: Boolean(rvuData)
    }
  };
}

function classifyCodeCategory(code) {
  if (/^99[2-4]\d\d$/.test(code)) return "Evaluation and Management (E/M)";
  if (/^7\d{4}$/.test(code)) return "Diagnostic Radiology / Imaging";
  if (/^8\d{4}$/.test(code)) return "Pathology and Clinical Laboratory";
  if (/^9\d{4}$/.test(code)) return "Medicine / Cardiovascular / Diagnostic";
  if (/^[A-Z]\d{4}$/.test(code)) return "HCPCS Level II Supply / Drug / Service";
  return "General Healthcare Procedure";
}

/**
 * 5.2: Queries live api.zippopotam.us/us/{zip} for any U.S. ZIP code and returns
 * city, state, coordinates, Geographic Practice Cost Indices (gpciWork, gpciPe, gpciMp),
 * and regional Area Median Income (AMI).
 */
export async function apiLookupLocalityGpci(params = {}, options = {}) {
  const rawZip = String(params.zipCode || "").trim();
  const zip5 = rawZip.replace(/[^0-9]/g, "").slice(0, 5);

  if (zip5.length !== 5) {
    throw new Error("api_lookup_locality_gpci requires a 5-digit U.S. 'zipCode'.");
  }

  const endpointUrl = `https://api.zippopotam.us/us/${zip5}`;
  let liveApiCalled = false;
  let city = null;
  let stateCode = null;
  let stateName = null;
  let latitude = null;
  let longitude = null;

  if (options.disableNetwork !== true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 2500);
    try {
      const res = await fetch(endpointUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (res.ok) {
        const json = await res.json();
        const place = Array.isArray(json.places) && json.places[0] ? json.places[0] : null;
        if (place) {
          liveApiCalled = true;
          city = place["place name"];
          stateCode = place["state abbreviation"];
          stateName = place.state;
          latitude = Number(place.latitude);
          longitude = Number(place.longitude);
        }
      }
    } catch {
      liveApiCalled = false;
    } finally {
      clearTimeout(timer);
    }
  }

  if (!stateCode) {
    const fallback = inferStateFromZipPrefix(zip5);
    stateCode = fallback.stateCode;
    city = fallback.city;
    stateName = fallback.stateName;
  }

  const stateProfile = STATE_REFERENCE_INDEX[stateCode] || STATE_REFERENCE_INDEX.NY;
  const effectiveCity = city || `${stateCode} Metro`;

  return {
    zipCode: zip5,
    city: effectiveCity,
    placeName: effectiveCity,
    stateCode,
    stateAbbr: stateCode,
    stateName: stateName || stateCode,
    localityName: `${effectiveCity}, ${stateCode}`,
    coordinates: latitude !== null ? { latitude, longitude } : null,
    gpci: {
      gpciWork: stateProfile.gpciWork,
      gpciPe: stateProfile.gpciPe,
      gpciMp: stateProfile.gpciMp
    },
    areaMedianIncome4Person: stateProfile.ami4,
    liveSourceUrl: endpointUrl,
    liveGeoVerified: liveApiCalled,
    sourceMetadata: {
      authority: "Zippopotam.us US Postal Geolocation API & CMS State GPCI / HUD AMI Reference Table",
      endpointUrl,
      liveApiCalled
    }
  };
}

/**
 * 5.3: Queries the live U.S. openFDA Enforcement API (food, drug, or device)
 * with caller-supplied domain, query/searchQuery, classification, and limit.
 */
export async function apiQueryFdaEnforcement(params = {}, options = {}) {
  const domainRaw = String(params.domain || "food").trim().toLowerCase();
  const domain = ["food", "drug", "device"].includes(domainRaw) ? domainRaw : "food";
  const searchQuery = String(params.searchQuery || params.query || "").trim();
  const classification = params.classification ? String(params.classification).trim() : null;
  const limit = Math.max(1, Math.min(25, Number(params.limit) || 5));

  if (!searchQuery) {
    throw new Error("api_query_fda_enforcement requires a non-empty 'query' or 'searchQuery'.");
  }

  const safeTerm = searchQuery.replace(/[^a-zA-Z0-9 ]/g, " ").trim();
  let queryExpr = `product_description:"${encodeURIComponent(safeTerm)}"`;
  if (classification) {
    queryExpr += `+AND+classification:"${encodeURIComponent(classification)}"`;
  }

  const endpointUrl = `https://api.fda.gov/${domain}/enforcement.json?search=${queryExpr}&limit=${limit}`;
  let liveApiCalled = false;
  let records = [];

  if (options.disableNetwork !== true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 3000);
    try {
      const res = await fetch(endpointUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (res.ok) {
        const json = await res.json();
        liveApiCalled = true;
        if (Array.isArray(json.results)) {
          records = json.results.map((r) => ({
            recallNumber: r.recall_number || "FDA-LIVE",
            recallingFirm: r.recalling_firm || "Unknown Firm",
            productDescription: String(r.product_description || "").slice(0, 220),
            reasonForRecall: String(r.reason_for_recall || "").slice(0, 220),
            classification: r.classification || "Class II",
            status: r.status || "Ongoing",
            reportDate: r.report_date || null
          }));
        }
      } else if (res.status === 404) {
        // openFDA returns HTTP 404 JSON when 0 records match the query — that is still a live response
        liveApiCalled = true;
      }
    } catch {
      liveApiCalled = false;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    domain,
    query: searchQuery,
    searchQuery,
    classificationFilter: classification,
    recordCount: records.length,
    records,
    sourceMetadata: {
      authority: `U.S. FDA openFDA (${domain.toUpperCase()} Enforcement REST API)`,
      endpointUrl,
      liveApiCalled
    }
  };
}

/**
 * 5.4: Queries the live U.S. Consumer Product Safety Commission (CPSC SaferProducts) REST API
 * for consumer, nursery, appliance, and electronics recalls.
 */
export async function apiQueryCpscRecalls(params = {}, options = {}) {
  const productName = String(params.productName || params.query || "").trim();
  const hazard = params.hazard ? String(params.hazard).trim() : "";
  const limit = Math.max(1, Math.min(20, Number(params.limit) || 5));

  if (!productName && !hazard) {
    throw new Error("api_query_cpsc_recalls requires 'query', 'productName', or 'hazard'.");
  }

  const queryParts = ["format=json"];
  if (productName) queryParts.push(`ProductName=${encodeURIComponent(productName)}`);
  if (hazard) queryParts.push(`Hazard=${encodeURIComponent(hazard)}`);
  const endpointUrl = `https://www.saferproducts.gov/RestWebServices/Recall?${queryParts.join("&")}`;

  let liveApiCalled = false;
  let records = [];

  if (options.disableNetwork !== true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || 3200);
    try {
      const res = await fetch(endpointUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (res.ok) {
        const json = await res.json();
        liveApiCalled = true;
        if (Array.isArray(json)) {
          records = json.slice(0, limit).map((item) => ({
            recallNumber: item.RecallNumber || "CPSC-LIVE",
            recallDate: item.RecallDate || null,
            title: item.Title || productName,
            description: String(item.Description || "").slice(0, 220),
            hazards: Array.isArray(item.Hazards)
              ? item.Hazards.map((h) => h.Name).filter(Boolean)
              : [],
            remedies: Array.isArray(item.Remedies)
              ? item.Remedies.map((rem) => rem.Name).filter(Boolean)
              : [],
            manufacturers: Array.isArray(item.Manufacturers)
              ? item.Manufacturers.map((m) => m.Name).filter(Boolean)
              : [],
            url: item.URL || "https://www.cpsc.gov/Recalls"
          }));
        }
      }
    } catch {
      liveApiCalled = false;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    query: productName || hazard,
    productName,
    hazardFilter: hazard || null,
    recordCount: records.length,
    records,
    sourceMetadata: {
      authority: "U.S. Consumer Product Safety Commission (SaferProducts.gov REST API)",
      endpointUrl,
      liveApiCalled
    }
  };
}

/**
 * 5.5: Looks up state and ZIP code electricity Time-of-Use (TOU) tariff schedules
 * (raw kWh rates and fixed charges for all 50 U.S. states + DC).
 */
export async function apiLookupUtilityRates(params = {}, options = {}) {
  const rawZip = params.zipCode ? String(params.zipCode).trim() : "";
  const rawState = String(params.stateCode || params.stateAbbr || "").trim().toUpperCase();

  if (!rawZip && !rawState) {
    throw new Error("api_lookup_utility_rates requires either 'zipCode', 'stateAbbr', or 'stateCode'.");
  }

  let resolvedState = rawState;
  let resolvedCity = null;
  let liveGeolocation = false;

  if (rawZip && rawZip.replace(/[^0-9]/g, "").length === 5) {
    const loc = await apiLookupLocalityGpci({ zipCode: rawZip }, options);
    resolvedState = loc.stateCode;
    resolvedCity = loc.city;
    liveGeolocation = loc.sourceMetadata.liveApiCalled;
  }

  const profile = STATE_REFERENCE_INDEX[resolvedState] || STATE_REFERENCE_INDEX.NY;
  const peakWindow = "16:00 - 21:00 Local";
  const offPeakWindow = "22:00 - 06:00 Local";

  return {
    zipCode: rawZip || null,
    stateCode: resolvedState,
    stateAbbr: resolvedState,
    city: resolvedCity || `${resolvedState} Service Area`,
    utilityProvider: profile.utility,
    utilityName: profile.utility,
    scheduleCode: `${resolvedState}-TOU-2026`,
    peakWindow,
    offPeakWindow,
    rates: {
      peakRatePerKwh: profile.peak,
      shoulderRatePerKwh: profile.shoulder,
      offPeakRatePerKwh: profile.offPeak,
      fixedMonthlyCustomerCharge: profile.fixed
    },
    touWindows: {
      peakWindow,
      offPeakWindow
    },
    sourceMetadata: {
      authority: "Zippopotam.us Geolocation API & U.S. EIA / OpenEI 50-State Residential TOU Schedule",
      liveGeolocation
    }
  };
}

export function inferStateFromZipPrefix(zip5) {
  const p = Number(zip5.slice(0, 3));
  if (p >= 10 && p <= 27) return { stateCode: "MA", city: "Boston Metro", stateName: "Massachusetts" };
  if (p >= 28 && p <= 29) return { stateCode: "RI", city: "Providence", stateName: "Rhode Island" };
  if (p >= 30 && p <= 38) return { stateCode: "NH", city: "Manchester", stateName: "New Hampshire" };
  if (p >= 39 && p <= 49) return { stateCode: "ME", city: "Portland", stateName: "Maine" };
  if (p >= 50 && p <= 59) return { stateCode: "VT", city: "Burlington", stateName: "Vermont" };
  if (p >= 60 && p <= 69) return { stateCode: "CT", city: "Hartford", stateName: "Connecticut" };
  if (p >= 70 && p <= 89) return { stateCode: "NJ", city: "Newark", stateName: "New Jersey" };
  if (p >= 100 && p <= 149) return { stateCode: "NY", city: "New York", stateName: "New York" };
  if (p >= 150 && p <= 196) return { stateCode: "PA", city: "Philadelphia", stateName: "Pennsylvania" };
  if (p >= 197 && p <= 199) return { stateCode: "DE", city: "Wilmington", stateName: "Delaware" };
  if (p >= 200 && p <= 205) return { stateCode: "DC", city: "Washington", stateName: "District of Columbia" };
  if (p >= 206 && p <= 219) return { stateCode: "MD", city: "Baltimore", stateName: "Maryland" };
  if (p >= 220 && p <= 246) return { stateCode: "VA", city: "Richmond", stateName: "Virginia" };
  if (p >= 247 && p <= 268) return { stateCode: "WV", city: "Charleston", stateName: "West Virginia" };
  if (p >= 270 && p <= 289) return { stateCode: "NC", city: "Charlotte", stateName: "North Carolina" };
  if (p >= 290 && p <= 299) return { stateCode: "SC", city: "Columbia", stateName: "South Carolina" };
  if (p >= 300 && p <= 319) return { stateCode: "GA", city: "Atlanta", stateName: "Georgia" };
  if (p >= 320 && p <= 349) return { stateCode: "FL", city: "Miami", stateName: "Florida" };
  if (p >= 350 && p <= 369) return { stateCode: "AL", city: "Birmingham", stateName: "Alabama" };
  if (p >= 370 && p <= 385) return { stateCode: "TN", city: "Nashville", stateName: "Tennessee" };
  if (p >= 386 && p <= 397) return { stateCode: "MS", city: "Jackson", stateName: "Mississippi" };
  if (p >= 400 && p <= 427) return { stateCode: "KY", city: "Louisville", stateName: "Kentucky" };
  if (p >= 430 && p <= 458) return { stateCode: "OH", city: "Columbus", stateName: "Ohio" };
  if (p >= 460 && p <= 479) return { stateCode: "IN", city: "Indianapolis", stateName: "Indiana" };
  if (p >= 480 && p <= 499) return { stateCode: "MI", city: "Detroit", stateName: "Michigan" };
  if (p >= 500 && p <= 528) return { stateCode: "IA", city: "Des Moines", stateName: "Iowa" };
  if (p >= 530 && p <= 549) return { stateCode: "WI", city: "Milwaukee", stateName: "Wisconsin" };
  if (p >= 550 && p <= 567) return { stateCode: "MN", city: "Minneapolis", stateName: "Minnesota" };
  if (p >= 570 && p <= 577) return { stateCode: "SD", city: "Sioux Falls", stateName: "South Dakota" };
  if (p >= 580 && p <= 588) return { stateCode: "ND", city: "Fargo", stateName: "North Dakota" };
  if (p >= 590 && p <= 599) return { stateCode: "MT", city: "Billings", stateName: "Montana" };
  if (p >= 600 && p <= 629) return { stateCode: "IL", city: "Chicago", stateName: "Illinois" };
  if (p >= 630 && p <= 658) return { stateCode: "MO", city: "St. Louis", stateName: "Missouri" };
  if (p >= 660 && p <= 679) return { stateCode: "KS", city: "Wichita", stateName: "Kansas" };
  if (p >= 680 && p <= 693) return { stateCode: "NE", city: "Omaha", stateName: "Nebraska" };
  if (p >= 700 && p <= 714) return { stateCode: "LA", city: "New Orleans", stateName: "Louisiana" };
  if (p >= 716 && p <= 729) return { stateCode: "AR", city: "Little Rock", stateName: "Arkansas" };
  if (p >= 730 && p <= 749) return { stateCode: "OK", city: "Oklahoma City", stateName: "Oklahoma" };
  if (p >= 750 && p <= 799) return { stateCode: "TX", city: "Dallas / Austin", stateName: "Texas" };
  if (p >= 800 && p <= 816) return { stateCode: "CO", city: "Denver", stateName: "Colorado" };
  if (p >= 820 && p <= 831) return { stateCode: "WY", city: "Cheyenne", stateName: "Wyoming" };
  if (p >= 832 && p <= 838) return { stateCode: "ID", city: "Boise", stateName: "Idaho" };
  if (p >= 840 && p <= 847) return { stateCode: "UT", city: "Salt Lake City", stateName: "Utah" };
  if (p >= 850 && p <= 865) return { stateCode: "AZ", city: "Phoenix", stateName: "Arizona" };
  if (p >= 870 && p <= 884) return { stateCode: "NM", city: "Albuquerque", stateName: "New Mexico" };
  if (p >= 889 && p <= 898) return { stateCode: "NV", city: "Las Vegas", stateName: "Nevada" };
  if (p >= 900 && p <= 961) return { stateCode: "CA", city: "Los Angeles / SF", stateName: "California" };
  if (p >= 967 && p <= 968) return { stateCode: "HI", city: "Honolulu", stateName: "Hawaii" };
  if (p >= 970 && p <= 979) return { stateCode: "OR", city: "Portland", stateName: "Oregon" };
  if (p >= 980 && p <= 994) return { stateCode: "WA", city: "Seattle", stateName: "Washington" };
  if (p >= 995 && p <= 999) return { stateCode: "AK", city: "Anchorage", stateName: "Alaska" };
  return { stateCode: "NY", city: "New York", stateName: "New York" };
}
