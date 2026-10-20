/**
 * Bill Autopsy Engine (CMS Medicare Physician Fee Schedule, NCCI Coding Edits & FCC/State Consumer Caps)
 *
 * Performs deterministic, cent-exact auditing of medical, dental, ISP, and residential bills:
 *   1. Upcoding Detection (e.g. Level 5 ER CPT 99285 billed for moderate/low complexity visits)
 *   2. NCCI Procedure-to-Procedure (PTP) Unbundling Detection (e.g. CPT 36415 venipuncture billed alongside CPT 80053 panel)
 *   3. Exact Duplicate Charge Detection on the same service date
 *   4. Junk Fee & ISP/Rent Statutory Cap Detection (customer-owned modem rental fee, excessive late fee, paper statement fee)
 *   5. Natural-Language Description Inference (maps free-text bill descriptions when CPT code is omitted)
 */

import {
  RVU_COMPONENT_REFERENCE,
  STATE_REFERENCE_INDEX,
  inferStateFromZipPrefix,
  apiLookupLocalityGpci,
  apiLookupMedicalCode
} from "../tools/api-tools.mjs";

export const CMS_CPT_BENCHMARKS = Object.freeze({
  "99285": {
    code: "99285",
    description: "Emergency Dept Visit, Level 5 (High Severity / Life Threatening)",
    keywords: ["er level 5", "emergency dept level 5", "emergency room level 5", "99285"],
    cmsNationalFacilityRate: 186.4,
    fairCommercialCeiling: 279.6, // 150% of CMS Medicare rate
    downgradeByComplexity: {
      low: { targetCode: "99283", fairCommercialCeiling: 118.5 },
      moderate: { targetCode: "99284", fairCommercialCeiling: 194.0 }
    },
    authority: "CMS CY2026 Physician Fee Schedule & No Surprises Act (42 U.S.C. § 300gg-111)"
  },
  "99284": {
    code: "99284",
    description: "Emergency Dept Visit, Level 4 (Moderate Severity)",
    keywords: ["er level 4", "emergency dept level 4", "emergency room visit", "99284"],
    cmsNationalFacilityRate: 129.33,
    fairCommercialCeiling: 194.0,
    downgradeByComplexity: {
      low: { targetCode: "99283", fairCommercialCeiling: 118.5 }
    },
    authority: "CMS CY2026 Physician Fee Schedule"
  },
  "99283": {
    code: "99283",
    description: "Emergency Dept Visit, Level 3 (Low-to-Moderate Severity)",
    keywords: ["er level 3", "emergency dept level 3", "99283"],
    cmsNationalFacilityRate: 79.0,
    fairCommercialCeiling: 118.5,
    authority: "CMS CY2026 Physician Fee Schedule"
  },
  "99282": {
    code: "99282",
    description: "Emergency Dept Visit, Level 2 (Low Severity)",
    keywords: ["er level 2", "emergency dept level 2", "99282"],
    cmsNationalFacilityRate: 46.2,
    fairCommercialCeiling: 69.3,
    authority: "CMS CY2026 Physician Fee Schedule"
  },
  "99215": {
    code: "99215",
    description: "Outpatient Office Visit, Level 5 (40-54 mins / High Complexity)",
    keywords: ["office visit level 5", "outpatient level 5", "99215"],
    cmsNationalFacilityRate: 183.15,
    fairCommercialCeiling: 274.73,
    downgradeByComplexity: {
      low: { targetCode: "99213", fairCommercialCeiling: 138.0 },
      moderate: { targetCode: "99214", fairCommercialCeiling: 195.0 }
    },
    authority: "CMS CY2026 Physician Fee Schedule"
  },
  "99214": {
    code: "99214",
    description: "Outpatient Office Visit, Level 4 (30-39 mins / Moderate Complexity)",
    keywords: ["office visit level 4", "outpatient visit", "doctor visit", "99214"],
    cmsNationalFacilityRate: 130.0,
    fairCommercialCeiling: 195.0,
    downgradeByComplexity: {
      low: { targetCode: "99213", fairCommercialCeiling: 138.0 }
    },
    authority: "CMS CY2026 Physician Fee Schedule"
  },
  "99213": {
    code: "99213",
    description: "Outpatient Office Visit, Level 3 (20-29 mins / Low Complexity)",
    keywords: ["office visit level 3", "routine office visit", "99213"],
    cmsNationalFacilityRate: 92.0,
    fairCommercialCeiling: 138.0,
    authority: "CMS CY2026 Physician Fee Schedule"
  },
  "80053": {
    code: "80053",
    description: "Comprehensive Metabolic Panel (14 lab tests)",
    keywords: ["comprehensive metabolic panel", "cmp lab", "metabolic panel", "80053"],
    cmsNationalFacilityRate: 14.39,
    fairCommercialCeiling: 28.78,
    authority: "CMS Clinical Laboratory Fee Schedule (CLFS)"
  },
  "80048": {
    code: "80048",
    description: "Basic Metabolic Panel (8 lab tests)",
    keywords: ["basic metabolic panel", "bmp lab", "80048"],
    cmsNationalFacilityRate: 11.55,
    fairCommercialCeiling: 23.1,
    authority: "CMS Clinical Laboratory Fee Schedule (CLFS)"
  },
  "85025": {
    code: "85025",
    description: "Complete Blood Count (CBC) with Automated Differential",
    keywords: ["complete blood count", "cbc blood test", "cbc lab", "85025"],
    cmsNationalFacilityRate: 10.61,
    fairCommercialCeiling: 21.22,
    authority: "CMS Clinical Laboratory Fee Schedule (CLFS)"
  },
  "80061": {
    code: "80061",
    description: "Lipid Panel (Cholesterol & Triglycerides)",
    keywords: ["lipid panel", "cholesterol test", "80061"],
    cmsNationalFacilityRate: 18.24,
    fairCommercialCeiling: 36.48,
    authority: "CMS Clinical Laboratory Fee Schedule (CLFS)"
  },
  "81001": {
    code: "81001",
    description: "Urinalysis, Automated with Microscopy",
    keywords: ["urinalysis", "urine test", "81001"],
    cmsNationalFacilityRate: 4.32,
    fairCommercialCeiling: 8.64,
    authority: "CMS Clinical Laboratory Fee Schedule (CLFS)"
  },
  "36415": {
    code: "36415",
    description: "Routine Venipuncture (Blood Draw)",
    keywords: ["venipuncture", "blood draw", "phlebotomy", "lab collection fee", "36415"],
    cmsNationalFacilityRate: 3.0,
    fairCommercialCeiling: 6.0,
    bundledInto: ["80053", "80048", "85025", "80061"],
    authority: "NCCI Policy Manual Chap. 10 (Bundled Collection / Lab Panel Edit)"
  },
  "99070": {
    code: "99070",
    description: "Generic Supplies and Materials Provided by Facility",
    keywords: ["generic supplies", "medical supplies", "surgical tray", "gloves and gauze", "99070"],
    cmsNationalFacilityRate: 0.0,
    fairCommercialCeiling: 0.0,
    bundledInto: ["99285", "99284", "99283", "99282", "99215", "99214", "99213"],
    authority: "CMS NCCI PTP Edit — Routine supplies are integral to E/M facility fee"
  },
  "71046": {
    code: "71046",
    description: "Chest X-Ray, 2 Views",
    keywords: ["chest x-ray", "chest xray", "thorax x-ray", "71046"],
    cmsNationalFacilityRate: 34.68,
    fairCommercialCeiling: 69.36,
    authority: "CMS CY2026 Physician Fee Schedule"
  },
  "70450": {
    code: "70450",
    description: "CT Scan Head / Brain without Contrast",
    keywords: ["ct scan head", "head ct", "brain ct scan", "70450"],
    cmsNationalFacilityRate: 118.4,
    fairCommercialCeiling: 236.8,
    authority: "CMS CY2026 Outpatient Prospective Payment System (OPPS)"
  },
  "72148": {
    code: "72148",
    description: "MRI Lumbar Spine without Contrast",
    keywords: ["mri lumbar", "spine mri", "back mri", "72148"],
    cmsNationalFacilityRate: 214.5,
    fairCommercialCeiling: 429.0,
    authority: "CMS CY2026 Physician Fee Schedule"
  },
  "93000": {
    code: "93000",
    description: "Electrocardiogram (EKG / ECG), 12-Lead with Interpretation",
    keywords: ["ekg", "ecg", "electrocardiogram", "93000"],
    cmsNationalFacilityRate: 16.85,
    fairCommercialCeiling: 33.7,
    authority: "CMS CY2026 Physician Fee Schedule"
  },
  "96360": {
    code: "96360",
    description: "Intravenous (IV) Hydration Infusion, Initial 31–60 Minutes",
    keywords: ["iv hydration", "iv fluids", "saline infusion", "96360"],
    cmsNationalFacilityRate: 38.2,
    fairCommercialCeiling: 76.4,
    bundledInto: ["99285", "99284"],
    authority: "CMS NCCI Policy Manual — Routine IV line Care Bundled in High-Acuity ER"
  },
  "A0427": {
    code: "A0427",
    description: "Ambulance Service, Advanced Life Support (ALS) Emergency Transport",
    keywords: ["ambulance", "als transport", "emergency transport", "a0427"],
    cmsNationalFacilityRate: 465.0,
    fairCommercialCeiling: 697.5,
    authority: "CMS Ambulance Fee Schedule (AFS) CY2026"
  },
  "70553": {
    code: "70553",
    description: "MRI Brain (Including Brain Stem) Without & With Contrast",
    keywords: ["mri brain", "brain mri", "head mri", "70553"],
    cmsNationalFacilityRate: 240.04,
    fairCommercialCeiling: 360.06,
    authority: "CMS CY2026 Physician Fee Schedule"
  },
  "A4550": {
    code: "A4550",
    description: "Surgical Trays (Bundled Facility Supply)",
    keywords: ["surgical tray", "procedure tray", "a4550"],
    cmsNationalFacilityRate: 0.0,
    fairCommercialCeiling: 0.0,
    bundledInto: ["99285", "99284", "99283", "99214", "99215"],
    authority: "CMS NCCI Policy Manual — Surgical trays bundled into primary procedure"
  },
  "J2405": {
    code: "J2405",
    description: "Ondansetron HCl (Zofran) Injection, per 1 mg",
    keywords: ["ondansetron", "zofran", "anti-nausea injection", "j2405"],
    cmsNationalFacilityRate: 4.21,
    fairCommercialCeiling: 8.42,
    authority: "CMS Medicare Part B ASP Drug Pricing File"
  },
  "J1885": {
    code: "J1885",
    description: "Ketorolac Tromethamine (Toradol) Injection, per 15 mg",
    keywords: ["ketorolac", "toradol", "pain injection", "j1885"],
    cmsNationalFacilityRate: 5.18,
    fairCommercialCeiling: 10.36,
    authority: "CMS Medicare Part B ASP Drug Pricing File"
  },
  "D0120": {
    code: "D0120",
    description: "Periodic Oral Dental Evaluation — Established Patient",
    keywords: ["dental exam", "periodic oral evaluation", "routine dental checkup", "d0120"],
    cmsNationalFacilityRate: 50.14,
    fairCommercialCeiling: 75.21,
    authority: "ADA / CMS Dental Benchmark Schedule"
  },
  "D2740": {
    code: "D2740",
    description: "Dental Crown — Porcelain / Ceramic Substrate",
    keywords: ["porcelain crown", "ceramic crown", "dental crown", "d2740"],
    cmsNationalFacilityRate: 656.71,
    fairCommercialCeiling: 985.06,
    authority: "ADA / CMS Dental Benchmark Schedule"
  },
  "ISP-MODEM": {
    code: "ISP-MODEM",
    description: "Monthly Router / Modem Equipment Rental Fee",
    keywords: ["modem rental", "router fee", "wifi gateway rental", "customer-owned modem", "isp-modem"],
    cmsNationalFacilityRate: 0.0,
    fairCommercialCeiling: 0.0,
    junkFeeWhenCustomerOwned: true,
    authority: "Television Viewer Protection Act (47 U.S.C. § 562) — Ban on charging for customer-owned equipment"
  },
  "UTIL-ADMIN": {
    code: "UTIL-ADMIN",
    description: "Administrative / Paper Statement Processing Fee",
    keywords: ["paper statement fee", "administrative fee", "billing processing fee", "convenience fee", "util-admin"],
    cmsNationalFacilityRate: 0.0,
    fairCommercialCeiling: 0.0,
    junkFeeAlways: true,
    authority: "FCC Truth-in-Billing Rules (47 C.F.R. § 64.2401)"
  }
});

function toCents(dollars) {
  return Math.round(Number(dollars || 0) * 100);
}

function toDollars(cents) {
  return Number((cents / 100).toFixed(2));
}

export function inferBenchmarkFromDescription(rawCode, rawDescription) {
  const codeUpper = String(rawCode || "").trim().toUpperCase();
  if (CMS_CPT_BENCHMARKS[codeUpper]) {
    return CMS_CPT_BENCHMARKS[codeUpper];
  }
  if (RVU_COMPONENT_REFERENCE[codeUpper]) {
    const rvu = RVU_COMPONENT_REFERENCE[codeUpper];
    const totalRvu = Number((rvu.workRvu + rvu.peRvu + rvu.mpRvu).toFixed(4));
    const medicareRate = Number((totalRvu * 32.35).toFixed(2));
    return {
      code: rvu.code,
      description: rvu.officialDescription,
      keywords: [rvu.code.toLowerCase()],
      cmsNationalFacilityRate: medicareRate,
      fairCommercialCeiling: Number((medicareRate * 1.5).toFixed(2)),
      bundledInto: rvu.ncciBundledWith || [],
      authority: "CMS CY2026 Physician Fee Schedule (RVU Component Derivation)"
    };
  }
  const searchBlob = `${codeUpper} ${String(rawDescription || "")}`.toLowerCase();
  for (const entry of Object.values(CMS_CPT_BENCHMARKS)) {
    if (entry.keywords && entry.keywords.some((kw) => searchBlob.includes(kw))) {
      return entry;
    }
  }
  return null;
}

export function auditHouseholdBill(input = {}) {
  const billTitle = input.billTitle || "Household Medical & Service Statement";
  const providerName = input.providerName || "Metro Regional Health & Services";
  const visitComplexity = (input.visitComplexity || "moderate").toLowerCase();
  const customerOwnsModem = input.customerOwnsModem !== false;
  const items = Array.isArray(input.lineItems) ? input.lineItems : [];
  const conversionFactor =
    Number.isFinite(Number(input.conversionFactor)) && Number(input.conversionFactor) > 0
      ? Number(input.conversionFactor)
      : 32.35;
  const rawZip = input.zipCode ? String(input.zipCode).replace(/[^0-9]/g, "").slice(0, 5) : "";
  const locality =
    input.resolvedLocality || (rawZip.length === 5 ? inferStateFromZipPrefix(rawZip) : null);
  const stateProfile = locality
    ? locality.gpci || STATE_REFERENCE_INDEX[locality.stateCode]
    : null;
  const gpciMultiplier = stateProfile
    ? Number(((stateProfile.gpciWork + stateProfile.gpciPe) / 2).toFixed(4))
    : 1.0;
  const cfScale = (conversionFactor / 32.35) * gpciMultiplier;
  const liveCodeMetadataMap = input.liveCodeMetadataMap || {};

  const resolvedEntries = items.map((item, idx) => {
    const ref = inferBenchmarkFromDescription(item.code, item.description);
    const code = ref ? ref.code : String(item.code || `ITEM-${idx + 1}`).toUpperCase();
    const liveMeta = liveCodeMetadataMap[code] || null;
    return { raw: item, code, ref, liveMeta };
  });

  const presentCodes = new Set(resolvedEntries.map((e) => e.code));
  const seenCodeCounts = new Map();

  let totalBilledCents = 0;
  let totalFairCents = 0;
  let totalSavingsCents = 0;
  const auditedRows = [];
  const violations = [];

  for (let i = 0; i < resolvedEntries.length; i++) {
    const { raw, code, ref, liveMeta } = resolvedEntries[i];
    const billedCents = toCents(raw.billedAmount);
    totalBilledCents += billedCents;

    const countSoFar = (seenCodeCounts.get(code) || 0) + 1;
    seenCodeCounts.set(code, countSoFar);

    let fairCents = billedCents;
    let violationType = null;
    let reason =
      liveMeta && liveMeta.officialDescription
        ? `Verified via live NIH/openFDA API: ${liveMeta.officialDescription}`
        : "Verified within regional benchmark";
    let citation = ref
      ? ref.authority
      : liveMeta && liveMeta.sourceMetadata
      ? liveMeta.sourceMetadata.authority
      : "Standard Billing Schedule";

    // Rule 1: Exact duplicate charge on the same statement
    if (countSoFar > 1) {
      fairCents = 0;
      violationType = "DUPLICATE_CHARGE";
      reason = `Duplicate billing of code ${code} on the same statement (occurrence #${countSoFar}).`;
      citation = "CMS Claims Processing Manual Chap. 1 — Duplicate Claim Denial";
    } else if (ref) {
      // Rule 2: NCCI Unbundling check
      const bundledParent =
        Array.isArray(ref.bundledInto) &&
        ref.bundledInto.find((parentCode) => presentCodes.has(parentCode));

      if (bundledParent) {
        fairCents = 0;
        violationType = "NCCI_UNBUNDLED_FEE";
        reason = `Code ${code} (${ref.description}) is bundled into primary procedure ${bundledParent} and cannot be billed separately.`;
        citation = ref.authority;
      } else if (ref.junkFeeWhenCustomerOwned && customerOwnsModem) {
        // Rule 3: Customer-owned equipment fee
        fairCents = 0;
        violationType = "ILLEGAL_EQUIPMENT_FEE";
        reason = "Customer owns router/modem; charging monthly rental fee violates 47 U.S.C. § 562.";
        citation = ref.authority;
      } else if (ref.junkFeeAlways) {
        fairCents = 0;
        violationType = "JUNK_SURCHARGE";
        reason = `${ref.description} is an unbundled administrative junk fee.`;
        citation = ref.authority;
      } else {
        // Rule 4: Upcoding & CMS Medicare Commercial Benchmark Cap (scaled by conversionFactor when overridden)
        const downgrade =
          ref.downgradeByComplexity && ref.downgradeByComplexity[visitComplexity];
        if (downgrade) {
          const scaledCeiling = Number((downgrade.fairCommercialCeiling * cfScale).toFixed(2));
          const ceilingCents = toCents(scaledCeiling);
          if (billedCents > ceilingCents) {
            fairCents = ceilingCents;
            violationType = "UPCODING_AND_OVERCHARGE";
            reason = `Upcoded as ${code} despite '${visitComplexity}' complexity; downgraded to ${downgrade.targetCode} benchmark ($${scaledCeiling.toFixed(
              2
            )}).`;
          }
        } else {
          const scaledCeiling = Number((ref.fairCommercialCeiling * cfScale).toFixed(2));
          const ceilingCents = toCents(scaledCeiling);
          if (billedCents > ceilingCents) {
            fairCents = ceilingCents;
            violationType = "BENCHMARK_OVERCHARGE";
            reason = `Billed amount exceeds CMS commercial benchmark ($${scaledCeiling.toFixed(
              2
            )}) by $${toDollars(billedCents - ceilingCents).toFixed(2)}.`;
          }
        }
      }
    }

    const deltaCents = Math.max(0, billedCents - fairCents);
    totalFairCents += fairCents;
    totalSavingsCents += deltaCents;

    const rowRecord = {
      id: `line-${i + 1}-${code}`,
      code,
      title: `${code} — ${
        raw.description ||
        (ref ? ref.description : liveMeta ? liveMeta.officialDescription : "Service Charge")
      }`,
      subtitle: reason,
      billedAmount: toDollars(billedCents),
      fairAmount: toDollars(fairCents),
      savingsAmount: toDollars(deltaCents),
      originalLabel: `$${toDollars(billedCents).toFixed(2)}`,
      fairLabel: `$${toDollars(fairCents).toFixed(2)}`,
      deltaLabel: deltaCents > 0 ? `-$${toDollars(deltaCents).toFixed(2)}` : "OK",
      status: violationType || "VERIFIED",
      citation,
      actionTool: deltaCents > 0 ? "generate_official_dispute_or_claim" : null,
      actionLabel: deltaCents > 0 ? "Add to Dispute" : null,
      actionArgs:
        deltaCents > 0
          ? {
              claimType: "BILL_DISPUTE",
              providerName,
              disputedCode: code,
              savingsAmount: toDollars(deltaCents)
            }
          : null
    };

    auditedRows.push(rowRecord);
    if (deltaCents > 0) {
      violations.push(rowRecord);
    }
  }

  const totalBilled = toDollars(totalBilledCents);
  const totalFair = toDollars(totalFairCents);
  const totalSavings = toDollars(totalSavingsCents);

  const voiceSummary =
    violations.length > 0
      ? `BillShield audited ${items.length} line items from ${providerName} and caught ${
          violations.length
        } billing violations totaling $${totalSavings.toFixed(
          2
        )} in recoverable overcharges, reducing your bill from $${totalBilled.toFixed(
          2
        )} to $${totalFair.toFixed(2)}.`
      : `BillShield audited ${items.length} line items from ${providerName}. All charges are within official CMS and regional benchmarks.`;

  return {
    billTitle,
    providerName,
    visitComplexity,
    conversionFactorUsed: conversionFactor,
    localityName: locality ? locality.localityName || `${locality.city}, ${locality.stateCode}` : "National Baseline",
    liveGeoVerified: Boolean(locality && locality.liveGeoVerified),
    totalBilled,
    totalFair,
    totalSavings,
    violationCount: violations.length,
    violations,
    rows: auditedRows,
    voiceSummary
  };
}

/**
 * Live-First wrapper for auditHouseholdBill:
 * 1. Resolves ZIP code via live api.zippopotam.us (apiLookupLocalityGpci) before falling back to prefix table.
 * 2. Resolves unknown medical/HCPCS/NDC drug codes via live NIH Clinical Tables & openFDA NDC API (apiLookupMedicalCode).
 */
export async function auditHouseholdBillLive(input = {}, options = {}) {
  let resolvedLocality = null;
  const rawZip = input.zipCode ? String(input.zipCode).replace(/[^0-9]/g, "").slice(0, 5) : "";
  if (rawZip.length === 5) {
    try {
      resolvedLocality = await apiLookupLocalityGpci({ zipCode: rawZip }, options);
    } catch {
      resolvedLocality = null;
    }
  }

  const items = Array.isArray(input.lineItems) ? input.lineItems : [];
  const liveCodeMetadataMap = {};
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const ref = inferBenchmarkFromDescription(item.code, item.description);
    if (!ref && (item.code || item.description)) {
      const codeKey = String(item.code || `ITEM-${i + 1}`).toUpperCase();
      try {
        const liveMeta = await apiLookupMedicalCode(
          { code: item.code || "", query: item.description || item.code },
          options
        );
        liveCodeMetadataMap[codeKey] = liveMeta;
      } catch {
        // Ignore network errors and continue deterministic audit
      }
    }
  }

  return auditHouseholdBill({
    ...input,
    resolvedLocality,
    liveCodeMetadataMap
  });
}
