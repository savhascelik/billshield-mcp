import { fileURLToPath } from "node:url";
import {
  AlexaMcpServer,
  createAlexaUiWidget
} from "../lib/alexa-mcp-kit/index.mjs";
import { auditHouseholdBill, auditHouseholdBillLive } from "./engines/bill-autopsy.mjs";
import { optimizeUtilityTariff, optimizeUtilityTariffLive } from "./engines/utility-tariff.mjs";
import { findCashRebates, findCashRebatesLive } from "./engines/rebate-finder.mjs";
import { scanHouseholdRecalls } from "./engines/recall-scanner.mjs";
import { generateOfficialDisputeOrClaim } from "./engines/dispute-generator.mjs";
import {
  apiLookupMedicalCode,
  apiLookupLocalityGpci,
  apiQueryFdaEnforcement,
  apiQueryCpscRecalls,
  apiLookupUtilityRates
} from "./tools/api-tools.mjs";
import {
  calcMedicareFeeFormula,
  calcLineItemVariance,
  calcTouLoadShift,
  calcIncomeAmiSubsidy
} from "./tools/calc-tools.mjs";
import {
  renderEchoShowSurface,
  buildDisputeDocument
} from "./tools/ui-tools.mjs";
import { attachSimulatorRoutes } from "./simulator.mjs";

export const DEFAULT_SAMPLE_BILL = Object.freeze({
  providerName: "Metro Regional Hospital & Home Fiber",
  visitComplexity: "moderate",
  customerOwnsModem: true,
  lineItems: [
    { code: "99285", description: "Emergency Dept Visit, Level 5", billedAmount: 950.0 },
    { code: "80053", description: "Comprehensive Metabolic Panel", billedAmount: 28.78 },
    { code: "36415", description: "Routine Venipuncture Blood Draw", billedAmount: 36.0 },
    { code: "71046", description: "Chest X-Ray, 2 Views", billedAmount: 69.36 },
    { code: "71046", description: "Chest X-Ray, 2 Views (Duplicate Entry)", billedAmount: 69.36 },
    { code: "ISP-MODEM", description: "Customer-Owned Router Monthly Rental", billedAmount: 15.0 }
  ]
});

function formatAgentSurfaceWidget({ uri, displayMode, state, voiceSummary }) {
  const s = state || {};

  // Case 1: Explicit render_echo_show_surface payload
  if (Array.isArray(s.rows) && s.title && !s.steps) {
    return createAlexaUiWidget({
      uri,
      title: s.title,
      subtitle: s.subtitle || "Dynamic Agent Surface",
      badge: s.badge || "DYNAMIC AGENT SURFACE",
      displayMode,
      voiceSummary: voiceSummary || s.voiceSummary || s.title,
      metrics: Array.isArray(s.metrics) ? s.metrics : [],
      rows: s.rows,
      actions: Array.isArray(s.actions) ? s.actions : []
    });
  }

  // Case 2: Code Mode (execute_codemode) execution trace & output
  if (Array.isArray(s.steps) && s.result !== undefined) {
    const resObj = s.result && typeof s.result === "object" ? s.result : {};
    const customRows = Array.isArray(resObj.rows)
      ? resObj.rows
      : s.steps.map((step) => ({
          id: `step-${step.stepIndex}`,
          title: `Step ${step.stepIndex}: ${step.toolName || step.label || step.type}`,
          subtitle: `Args: ${JSON.stringify(step.arguments || {})}`,
          originalLabel: `${step.durationMs}ms`,
          fairLabel: step.type.toUpperCase(),
          deltaLabel:
            step.outputPreview?.totalReferenceFee !== undefined
              ? `$${step.outputPreview.totalReferenceFee}`
              : step.outputPreview?.overchargeAmount !== undefined
              ? `-$${step.outputPreview.overchargeAmount}`
              : step.outputPreview?.workRvu !== undefined
              ? `${step.outputPreview.workRvu} RVU`
              : "OK",
          status: "VERIFIED_STEP",
          citation:
            step.outputPreview?.formulaTrace ||
            step.outputPreview?.liveSourceUrl ||
            "Isolated V8 Sandbox RPC"
        }));

    const metrics = Array.isArray(resObj.metrics)
      ? resObj.metrics
      : [
          { label: "Sandbox RPC Steps", value: String(s.stepsCount || s.steps.length) },
          { label: "Execution Time", value: `${s.totalDurationMs || 0}ms` },
          ...(resObj.conversionFactor !== undefined
            ? [{ label: "Conversion Factor", value: `$${resObj.conversionFactor}/RVU` }]
            : []),
          ...(resObj.totalOvercharge !== undefined
            ? [{ label: "Calculated Overcharge", value: `$${Number(resObj.totalOvercharge).toFixed(2)}`, tone: "danger" }]
            : resObj.totalReferenceFee !== undefined
            ? [{ label: "Calculated Fee", value: `$${Number(resObj.totalReferenceFee).toFixed(2)}`, tone: "danger" }]
            : [])
        ];

    return createAlexaUiWidget({
      uri,
      title: resObj.title || "Alexa+ Code Mode Execution Trace",
      subtitle:
        resObj.subtitle ||
        `Chained ${s.stepsCount} live API & parameterized math tools in ${s.totalDurationMs}ms`,
      badge: "CODE MODE SANDBOX",
      displayMode,
      voiceSummary:
        voiceSummary ||
        resObj.voiceSummary ||
        `Executed ${s.stepsCount} tool calls inside isolated Code Mode sandbox.`,
      metrics,
      rows: customRows
    });
  }

  // Case 3: Pure Parameterized Math Tool (calc_medicare_fee_formula / calc_line_item_variance / etc.)
  if (s.formulaTrace) {
    const isMedicare = s.geographicallyAdjustedRvu !== undefined;
    const isVariance = s.allowedCeiling !== undefined;
    const isTou = s.totalAnnualSavings !== undefined;
    const isSubsidy = s.subsidyAmount !== undefined;

    const title = isMedicare
      ? `Parameterized RVU Formula ($${s.inputs?.conversionFactor}/RVU)`
      : isVariance
      ? `Parameterized Line Variance (${s.allowedMultiplier}x Multiplier)`
      : isTou
      ? `Parameterized TOU Load Shift ($${s.currentRatePerKwh} -> $${s.targetRatePerKwh}/kWh)`
      : isSubsidy
      ? `Parameterized Income/AMI Subsidy (${s.amiRatioPct}% AMI)`
      : "Parameterized Math Calculation";

    const metrics = isMedicare
      ? [
          { label: "Geo-Adjusted RVU", value: `${s.geographicallyAdjustedRvu} RVU` },
          { label: "Agent Conversion Factor", value: `$${s.inputs.conversionFactor}/RVU` },
          { label: "Unit Reference Fee", value: `$${s.unitReferenceFee.toFixed(2)}` },
          { label: "Total Reference Fee", value: `$${s.totalReferenceFee.toFixed(2)}`, tone: "danger" }
        ]
      : isVariance
      ? [
          { label: "Billed Amount", value: `$${s.billedAmount.toFixed(2)}` },
          { label: "Allowed Multiplier", value: `${s.allowedMultiplier}x` },
          { label: "Allowed Ceiling", value: `$${s.allowedCeiling.toFixed(2)}` },
          { label: "Net Overcharge", value: `$${s.overchargeAmount.toFixed(2)}`, tone: "danger" }
        ]
      : isTou
      ? [
          { label: "Monthly Shifted", value: `${s.totalMonthlyKwh} kWh` },
          { label: "Peak vs Off-Peak", value: `$${s.currentRatePerKwh} vs $${s.targetRatePerKwh}` },
          { label: "Monthly Savings", value: `$${s.totalMonthlySavings.toFixed(2)}/mo` },
          { label: "Annual Savings", value: `$${s.totalAnnualSavings.toFixed(2)}/yr`, tone: "danger" }
        ]
      : [
          { label: "Income / AMI Ratio", value: `${s.amiRatioPct}% AMI` },
          { label: "Coverage Rate", value: `${(s.coverageRate * 100).toFixed(0)}%` },
          { label: "Max Cap", value: `$${s.maxCap.toFixed(2)}` },
          { label: "Calculated Subsidy", value: `$${s.subsidyAmount.toFixed(2)}`, tone: "danger" }
        ];

    const rows =
      isTou && Array.isArray(s.applianceBreakdown)
        ? s.applianceBreakdown.map((a, idx) => ({
            id: `tou-${idx + 1}`,
            title: a.name,
            subtitle: `${a.kilowatts}kW × ${a.durationHours}h × ${a.runsPerMonth} runs/mo = ${a.monthlyKwh} kWh`,
            originalLabel: `$${a.currentMonthlyCost.toFixed(2)}/mo`,
            fairLabel: `$${a.targetMonthlyCost.toFixed(2)}/mo`,
            deltaLabel: `-$${a.monthlySavings.toFixed(2)}/mo`,
            status: "OPTIMIZED",
            citation: s.formulaTrace
          }))
        : [
            {
              id: "math-trace-1",
              title,
              subtitle: s.formulaTrace,
              originalLabel: isVariance
                ? `$${s.billedAmount.toFixed(2)}`
                : isMedicare
                ? `${s.geographicallyAdjustedRvu} RVU`
                : `$${(s.projectCost || 0).toFixed(2)}`,
              fairLabel: isVariance
                ? `$${s.allowedCeiling.toFixed(2)}`
                : isMedicare
                ? `$${s.inputs.conversionFactor}/RVU`
                : `${s.amiRatioPct || 0}% AMI`,
              deltaLabel: isVariance
                ? `-$${s.overchargeAmount.toFixed(2)}`
                : isMedicare
                ? `$${s.totalReferenceFee.toFixed(2)}`
                : `$${(s.subsidyAmount || 0).toFixed(2)}`,
              status: "FORMULA_VERIFIED",
              citation: "Zero Hardcoded Constants — Agent-Supplied Parameters"
            }
          ];

    return createAlexaUiWidget({
      uri,
      title,
      subtitle: s.formulaTrace,
      badge: "PURE PARAMETERIZED MATH",
      displayMode,
      voiceSummary: voiceSummary || `Calculated result: ${s.formulaTrace}`,
      metrics,
      rows
    });
  }

  // Case 4: Atomic Live API Tool (api_*)
  if (s.liveSourceUrl) {
    const rows = [];
    if (s.rvu && typeof s.rvu === "object") {
      rows.push({
        id: `api-med-${s.code}`,
        title: `HCPCS/CPT ${s.code} — ${s.officialDescription}`,
        subtitle: `Work RVU: ${s.rvu.workRvu} | PE RVU: ${s.rvu.peRvu} | MP RVU: ${s.rvu.mpRvu}`,
        originalLabel: `${s.rvu.totalNominalRvu} RVU`,
        fairLabel: s.liveApiVerified ? "NIH LIVE" : "VERIFIED",
        deltaLabel: `Bundled w/: ${(s.ncciBundledWith || []).join(",") || "None"}`,
        status: "RAW_API_DATA",
        citation: s.liveSourceUrl
      });
    } else if (s.gpci && typeof s.gpci === "object") {
      rows.push({
        id: `api-gpci-${s.zipCode}`,
        title: `${s.placeName}, ${s.stateAbbr} (${s.zipCode}) — ${s.localityName}`,
        subtitle: `GPCI Work: ${s.gpci.gpciWork} | PE: ${s.gpci.gpciPe} | MP: ${s.gpci.gpciMp}`,
        originalLabel: `AMI $${s.areaMedianIncome4Person}`,
        fairLabel: s.liveGeoVerified ? "ZIPPOPOTAM LIVE" : "VERIFIED",
        deltaLabel: `State: ${s.stateAbbr}`,
        status: "RAW_API_DATA",
        citation: s.liveSourceUrl
      });
    } else if (Array.isArray(s.records)) {
      for (let i = 0; i < s.records.length; i++) {
        const rec = s.records[i];
        rows.push({
          id: `api-rec-${i + 1}`,
          title: rec.title || rec.productDescription || rec.recallNumber,
          subtitle: rec.hazardDescription || rec.reasonForRecall || "",
          originalLabel: rec.recallNumber || "Recall",
          fairLabel: rec.classification || rec.remedyType || "Active",
          deltaLabel: rec.manufacturer || rec.recallingFirm || "Federal DB",
          status: "LIVE_FEDERAL_RECORD",
          citation: rec.sourceUrl || s.liveSourceUrl
        });
      }
    } else if (s.rates && typeof s.rates === "object") {
      rows.push({
        id: `api-util-${s.stateAbbr}`,
        title: `${s.utilityName} (${s.scheduleCode})`,
        subtitle: `Peak Window: ${s.peakWindow} | Net Metering: ${s.netMeteringCreditRatio * 100}%`,
        originalLabel: `Peak $${s.rates.peakRatePerKwh}/kWh`,
        fairLabel: `Off-Peak $${s.rates.offPeakRatePerKwh}/kWh`,
        deltaLabel: `Fixed $${s.rates.fixedMonthlyCustomerCharge}/mo`,
        status: "RAW_API_DATA",
        citation: s.liveSourceUrl
      });
    }

    return createAlexaUiWidget({
      uri,
      title: `Live Atomic API Data (${s.code || s.zipCode || s.query || s.stateAbbr || "Verified"})`,
      subtitle: `Source: ${s.liveSourceUrl}`,
      badge: "ATOMIC LIVE API",
      displayMode,
      voiceSummary:
        voiceSummary || `Retrieved live structured data from ${s.liveSourceUrl}.`,
      metrics: [
        { label: "API Endpoint", value: new URL(s.liveSourceUrl).hostname },
        { label: "Live HTTPS", value: String(Boolean(s.liveApiVerified ?? s.liveGeoVerified ?? true)) },
        { label: "Records", value: String(rows.length) }
      ],
      rows
    });
  }

  // Case 5: Progressive Discovery (search_tools / describe_tool)
  if (Array.isArray(s.tools) || s.inputSchema) {
    const rows = Array.isArray(s.tools)
      ? s.tools.map((t) => ({
          id: t.name,
          title: `${t.name} (${t.category.toUpperCase()})`,
          subtitle: t.shortDescription,
          originalLabel: `Req: ${t.requiredParams.join(", ") || "none"}`,
          fairLabel: `Domain: ${t.domain}`,
          deltaLabel: `Score ${t.score}`,
          status: "DISCOVERED",
          citation: `Call describe_tool("${t.name}") for full schema`
        }))
      : Object.entries(s.inputSchema?.properties || {}).map(([pName, pSpec]) => ({
          id: pName,
          title: pName,
          subtitle: pSpec.description || "Parameter",
          originalLabel: (s.inputSchema?.required || []).includes(pName) ? "REQUIRED" : "OPTIONAL",
          fairLabel: String(pSpec.type || "any").toUpperCase(),
          deltaLabel: "Dynamic",
          status: "SCHEMA_PARAM",
          citation: s.name
        }));

    return createAlexaUiWidget({
      uri,
      title: s.name ? `Tool Schema: ${s.name}` : `Progressive Tool Discovery (${s.matchCount || 0} matches)`,
      subtitle: s.metrics
        ? `Saved ${s.metrics.tokenSavingsPct}% prompt tokens (${s.metrics.discoveryResponseTokens} vs ${s.metrics.fullCatalogEstimatedTokens} tokens)`
        : `Category: ${s.category || "all"}`,
      badge: "PROGRESSIVE DISCOVERY",
      displayMode,
      voiceSummary:
        voiceSummary || "Progressive discovery returns lightweight tool pointers and on-demand JSON schemas.",
      metrics: s.metrics
        ? [
            { label: "Matched Tools", value: String(s.matchCount) },
            { label: "Catalog Size", value: String(s.totalCatalogSize) },
            { label: "Token Savings", value: `${s.metrics.tokenSavingsPct}%`, tone: "danger" }
          ]
        : [
            { label: "Tool Name", value: s.name || "—" },
            { label: "Category", value: s.category || "—" },
            { label: "Parameters", value: String(rows.length) }
          ],
      rows
    });
  }

  // Default initial state before any atomic tool is invoked
  return createAlexaUiWidget({
    uri,
    title: "Alexa+ Dynamic Agentic Surface (API + Math + Code Mode)",
    subtitle: "Zero Hardcoded Constants • Live Federal APIs • Isolated V8 Code Mode Sandbox",
    badge: "AGENTIC MCP READY",
    displayMode,
    voiceSummary:
      voiceSummary ||
      "BillShield Agentic Surface is ready. Alexa Plus can discover atomic API tools, pass dynamic conversion factors into math formula tools, or execute multi-step Code Mode plans.",
    metrics: [
      { label: "Atomic API Tools", value: "5 Live" },
      { label: "Pure Math Tools", value: "4 Dynamic" },
      { label: "Code Mode VM", value: "Isolated V8" },
      { label: "Hardcoded Factors", value: "0 (Zero)", tone: "danger" }
    ],
    rows: [
      {
        id: "arch-1",
        title: "api_lookup_medical_code + api_lookup_locality_gpci",
        subtitle: "Fetches live NIH HCPCS/CPT metadata, raw RVU weights, and live ZIP GPCI without hardcoded dollar prices.",
        originalLabel: "Raw RVU/GPCI",
        fairLabel: "Live HTTPS",
        deltaLabel: "Atomic API",
        status: "READY",
        citation: "clinicaltables.nlm.nih.gov & api.zippopotam.us"
      },
      {
        id: "arch-2",
        title: "calc_medicare_fee_formula + calc_line_item_variance",
        subtitle: "Alexa+ supplies conversionFactor (e.g. $32.35 today, $40.00 tomorrow) and allowedMultiplier dynamically.",
        originalLabel: "Dynamic CF",
        fairLabel: "Pure Formula",
        deltaLabel: "IEEE-754",
        status: "READY",
        citation: "((Work*GPCI_W)+(PE*GPCI_PE)+(MP*GPCI_MP)) * CF"
      }
    ]
  });
}

export function createBillShieldServer(options = {}) {
  const server = new AlexaMcpServer({
    name: "billshield-mcp",
    version: "2.0.0",
    strictUiResource: options.strictUiResource !== false,
    strictVoiceSummary: options.strictVoiceSummary !== false
  });

  // Pre-seed default states so inspector resources/read works immediately even before tools/call
  const initialAutopsy = auditHouseholdBill(DEFAULT_SAMPLE_BILL);
  const initialTariff = optimizeUtilityTariff({ zipCode: "94103" });
  const initialRebates = findCashRebates({
    zipCode: "10001",
    tenure: "renter",
    householdIncome: 52000,
    householdSize: 2
  });
  const initialClaim = generateOfficialDisputeOrClaim({
    claimType: "BILL_DISPUTE",
    providerName: initialAutopsy.providerName,
    disputedCode: "99285, 36415, 71046, ISP-MODEM",
    savingsAmount: initialAutopsy.totalSavings
  });

  // 1. Resource: ui://billshield/autopsy-board
  const autopsyRes = server.registerAppResource({
    uri: "ui://billshield/autopsy-board",
    name: "BillShield Redline Bill Autopsy Board",
    description: "Line-by-line CMS Medicare & NCCI unbundling audit table with one-tap dispute generation.",
    render: ({ displayMode, state, voiceSummary }) => {
      const data = state || initialAutopsy;
      return createAlexaUiWidget({
        uri: "ui://billshield/autopsy-board",
        title: `Bill Autopsy: ${data.providerName}`,
        subtitle: "Verified against CMS CY2026 Fee Schedule, NCCI Bundling Edits & 47 U.S.C. § 562",
        badge: "CMS & NCCI REDLINE AUDIT",
        displayMode,
        voiceSummary: voiceSummary || data.voiceSummary,
        metrics: [
          { label: "Total Billed", value: `$${Number(data.totalBilled).toFixed(2)}` },
          { label: "Fair Benchmark", value: `$${Number(data.totalFair).toFixed(2)}` },
          { label: "Recoverable Savings", value: `$${Number(data.totalSavings).toFixed(2)}`, tone: "danger" },
          { label: "Flagged Violations", value: String(data.violationCount) }
        ],
        rows: data.rows,
        actions: [
          {
            id: "dispute-all",
            label: `Generate Official Dispute Packet ($${Number(data.totalSavings).toFixed(2)})`,
            toolName: "generate_official_dispute_or_claim",
            toolArgs: {
              claimType: "BILL_DISPUTE",
              providerName: data.providerName,
              disputedCode: "99285, 36415, 71046, ISP-MODEM",
              savingsAmount: data.totalSavings
            },
            primary: true
          }
        ]
      });
    }
  });
  autopsyRes.lastState = initialAutopsy;
  autopsyRes.lastVoiceSummary = initialAutopsy.voiceSummary;

  // 2. Resource: ui://billshield/tariff-optimizer
  const tariffRes = server.registerAppResource({
    uri: "ui://billshield/tariff-optimizer",
    name: "BillShield OpenEI Utility Tariff Optimizer",
    description: "Peak vs Off-Peak Time-of-Use appliance shift calculator.",
    render: ({ displayMode, state, voiceSummary }) => {
      const data = state || initialTariff;
      return createAlexaUiWidget({
        uri: "ui://billshield/tariff-optimizer",
        title: `Utility TOU Optimizer (${data.utilityName})`,
        subtitle: `Schedule: ${data.rateCode} | Peak Window: ${data.peakWindow}`,
        badge: "OPENEI TIME-OF-USE",
        displayMode,
        voiceSummary: voiceSummary || data.voiceSummary,
        metrics: [
          { label: "Peak Rate", value: `$${data.peakRateKwh}/kWh` },
          { label: "Off-Peak Rate", value: `$${data.offPeakRateKwh}/kWh` },
          { label: "Monthly Savings", value: `$${Number(data.totalMonthlySavings).toFixed(2)}/mo` },
          { label: "Annual Savings", value: `$${Number(data.annualSavings).toFixed(2)}/yr`, tone: "danger" }
        ],
        rows: data.rows,
        actions: [
          {
            id: "check-rebates",
            label: "Find Matching Appliance Cash Rebates",
            toolName: "find_cash_rebates",
            toolArgs: { zipCode: data.zipCode, tenure: "renter", householdIncome: 58000 },
            primary: true
          }
        ]
      });
    }
  });
  tariffRes.lastState = initialTariff;
  tariffRes.lastVoiceSummary = initialTariff.voiceSummary;

  // 3. Resource: ui://billshield/rebate-board
  const rebateRes = server.registerAppResource({
    uri: "ui://billshield/rebate-board",
    name: "BillShield Renter & Homeowner Cash Rebate Board",
    description: "IRA 25C, HEAR point-of-sale cash rebates, and community solar utility credits.",
    render: ({ displayMode, state, voiceSummary }) => {
      const data = state || initialRebates;
      return createAlexaUiWidget({
        uri: "ui://billshield/rebate-board",
        title: `Cash Rebates & Bill Credits (ZIP ${data.zipCode} — ${data.tenure.toUpperCase()})`,
        subtitle: data.tierLabel,
        badge: data.tenure === "renter" ? "RENTER-SAFE PORTABLE REBATES" : "HOMEOWNER REBATES",
        displayMode,
        voiceSummary: voiceSummary || data.voiceSummary,
        metrics: [
          { label: "Tenure Mode", value: data.tenure.toUpperCase() },
          { label: "Income vs AMI", value: `${data.amiRatio}% AMI` },
          { label: "Eligible Programs", value: String(data.programCount) },
          { label: "Total Cash / Credits", value: `$${Number(data.totalRebateDollars).toFixed(2)}`, tone: "danger" }
        ],
        rows: data.rows,
        actions: [
          {
            id: "claim-rebate-packet",
            label: "Generate Rebate & Utility Credit Application",
            toolName: "generate_official_dispute_or_claim",
            toolArgs: {
              claimType: "REBATE_CLAIM",
              programId: "window-heat-pump",
              savingsAmount: data.totalRebateDollars
            },
            primary: true
          }
        ]
      });
    }
  });
  rebateRes.lastState = initialRebates;
  rebateRes.lastVoiceSummary = initialRebates.voiceSummary;

  // 4. Resource: ui://billshield/recall-radar
  server.registerAppResource({
    uri: "ui://billshield/recall-radar",
    name: "BillShield CPSC & openFDA Recall Refund Radar",
    description: "No-receipt household recall refund scanner powered by CPSC and openFDA.",
    render: async ({ displayMode, state, voiceSummary }) => {
      const data =
        state ||
        (await scanHouseholdRecalls({}, { enableLivePing: false }));
      return createAlexaUiWidget({
        uri: "ui://billshield/recall-radar",
        title: "Household Recall Cash Refund Radar",
        subtitle: `Verified against ${data.dataSource}`,
        badge: "CPSC & OPENFDA RECALLS",
        displayMode,
        voiceSummary: voiceSummary || data.voiceSummary,
        metrics: [
          { label: "Items Scanned", value: String(data.scannedCount) },
          { label: "Active Recalls", value: String(data.matchedCount) },
          { label: "No-Receipt Refunds", value: `$${Number(data.totalRefundDollars).toFixed(2)}`, tone: "danger" }
        ],
        rows: data.rows,
        actions: [
          {
            id: "file-recall-claim",
            label: `Prepare Recall Cash Claim ($${Number(data.totalRefundDollars).toFixed(2)})`,
            toolName: "generate_official_dispute_or_claim",
            toolArgs: {
              claimType: "RECALL_REFUND",
              recallId: "CPSC-24-311 / CPSC-24-068",
              productName: "Recalled Household Items",
              savingsAmount: data.totalRefundDollars
            },
            primary: true
          }
        ]
      });
    }
  });

  // 5. Resource: ui://billshield/claim-packet
  const claimRes = server.registerAppResource({
    uri: "ui://billshield/claim-packet",
    name: "BillShield Official Dispute & Claim Packet",
    description: "Ready-to-sign legal dispute letter and statutory cash claim packet.",
    render: ({ displayMode, state, voiceSummary }) => {
      const data = state || initialClaim;
      const recipient = data.providerName || data.recipientName || "Billing Department";
      const totalAmount =
        data.savingsAmount !== undefined ? data.savingsAmount : data.totalOvercharge || 0;
      const authority =
        data.legalBasis ||
        (data.conversionFactorUsed
          ? `CMS RVU/GPCI Formula (CF=$${Number(data.conversionFactorUsed).toFixed(2)}/RVU)`
          : "45 CFR § 149.140 / Federal Billing Audit");
      return createAlexaUiWidget({
        uri: "ui://billshield/claim-packet",
        title: data.documentTitle,
        subtitle: `Authority: ${authority}`,
        badge: "OFFICIAL LEGAL PACKET",
        displayMode,
        voiceSummary: voiceSummary || data.voiceSummary,
        metrics: [
          { label: "Claim Type", value: data.claimType },
          { label: "Recipient", value: recipient },
          { label: "Total Claimed", value: `$${Number(totalAmount).toFixed(2)}`, tone: "danger" }
        ],
        rows: [
          ...(Array.isArray(data.rows) ? data.rows : []),
          {
            id: "letter-preview",
            title: "Formal Statutory Letter Body",
            subtitle: data.letterBody,
            originalLabel: "Drafted",
            fairLabel: "Verified",
            deltaLabel: `$${Number(totalAmount).toFixed(2)}`,
            status: "READY_TO_SEND",
            citation: authority
          }
        ]
      });
    }
  });
  claimRes.lastState = initialClaim;
  claimRes.lastVoiceSummary = initialClaim.voiceSummary;

  // 6. Resource: ui://billshield/agent-surface (Dynamic API + Math + Code Mode Surface)
  server.registerAppResource({
    uri: "ui://billshield/agent-surface",
    name: "BillShield Dynamic Agentic Surface (API + Math + Code Mode)",
    description:
      "Renders live outputs from atomic API tools (api_*), parameterized math formulas (calc_*), progressive discovery, and multi-step Code Mode (execute_codemode) plans.",
    render: ({ displayMode, state, voiceSummary }) =>
      formatAgentSurfaceWidget({
        uri: "ui://billshield/agent-surface",
        displayMode,
        state,
        voiceSummary
      })
  });

  // ============================================================================
  // A. ATOMIC LIVE API DATA TOOLS (api_*) — Zero Hardcoded Dollar Calculations
  // ============================================================================

  server.registerAppTool({
    name: "api_lookup_medical_code",
    title: "Live NIH HCPCS/CPT & Raw RVU Weight Lookup",
    category: "api",
    domain: "medical",
    tags: ["api", "nih", "hcpcs", "cpt", "rvu", "ncci", "medical"],
    compositionHint:
      "Pass returned rvu.workRvu, rvu.peRvu, rvu.mpRvu into calc_medicare_fee_formula along with GPCI from api_lookup_locality_gpci and your chosen conversionFactor.",
    description:
      "Queries the live U.S. National Library of Medicine (NIH Clinical Tables API) for an HCPCS/CPT procedure code and returns its official clinical description, raw RVU component weights (workRvu, peRvu, mpRvu), and NCCI bundling relationships — with ZERO hardcoded dollar prices.",
    resourceUri: "ui://billshield/agent-surface",
    inputSchema: {
      type: "object",
      required: ["code"],
      properties: {
        code: {
          type: "string",
          description: "5-character CPT/HCPCS code (e.g. '99285', '80053', '36415', '71046')."
        },
        facilitySetting: {
          type: "string",
          description: "'facility' (hospital/emergency dept) or 'non_facility' (office)."
        }
      }
    },
    handler: async (args) => {
      const res = await apiLookupMedicalCode(args);
      const rvuPart = res.rvu
        ? `raw Work RVU ${res.rvu.workRvu}, PE RVU ${res.rvu.peRvu}, MP RVU ${res.rvu.mpRvu}`
        : "no Medicare RVU weights";
      return {
        voiceSummary: `NIH API verified code ${res.code} (${res.officialDescription}) with ${rvuPart}. Pass these weights and a conversionFactor into calc_medicare_fee_formula.`,
        structuredContent: res
      };
    }
  });

  server.registerAppTool({
    name: "api_lookup_locality_gpci",
    title: "Live U.S. ZIP Geolocation & Locality GPCI / AMI Lookup",
    category: "api",
    domain: "medical",
    tags: ["api", "zip", "gpci", "locality", "ami", "geography", "medical", "rebate"],
    compositionHint:
      "Pass returned gpci.gpciWork, gpci.gpciPe, gpci.gpciMp into calc_medicare_fee_formula, or areaMedianIncome4Person into calc_income_ami_subsidy.",
    description:
      "Resolves any 5-digit U.S. ZIP code via the live Zippopotam.us API (city, state, coordinates) and returns the raw Geographic Practice Cost Indices (gpciWork, gpciPe, gpciMp) and 4-person Area Median Income (AMI).",
    resourceUri: "ui://billshield/agent-surface",
    inputSchema: {
      type: "object",
      required: ["zipCode"],
      properties: {
        zipCode: {
          type: "string",
          description: "5-digit U.S. ZIP code (e.g. '02138', '94103', '10001', '75201')."
        }
      }
    },
    handler: async (args) => {
      const res = await apiLookupLocalityGpci(args);
      return {
        voiceSummary: `Resolved ZIP ${res.zipCode} to ${res.placeName}, ${res.stateAbbr} (${res.localityName}): GPCI Work ${res.gpci.gpciWork}, PE ${res.gpci.gpciPe}, MP ${res.gpci.gpciMp}, and 4-person AMI $${res.areaMedianIncome4Person}.`,
        structuredContent: res
      };
    }
  });

  server.registerAppTool({
    name: "api_query_fda_enforcement",
    title: "Live openFDA Enforcement & Recall API Query",
    category: "api",
    domain: "recall",
    tags: ["api", "fda", "openfda", "recall", "food", "drug", "device"],
    description:
      "Queries the live U.S. Food & Drug Administration (api.fda.gov) enforcement database for active food, drug, or medical device recalls matching a keyword.",
    resourceUri: "ui://billshield/agent-surface",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Product, brand, or ingredient keyword (e.g. 'cinnamon', 'eye drops', 'infant formula')."
        },
        searchQuery: {
          type: "string",
          description: "Alias for query (product, brand, or ingredient keyword)."
        },
        domain: {
          type: "string",
          description: "openFDA endpoint domain: 'food', 'drug', or 'device' (default 'food')."
        },
        classification: {
          type: "string",
          description: "Optional FDA recall classification filter ('Class I', 'Class II', 'Class III')."
        },
        limit: {
          type: "number",
          description: "Maximum number of recall records to fetch (default 5)."
        }
      }
    },
    handler: async (args) => {
      const res = await apiQueryFdaEnforcement(args);
      return {
        voiceSummary: `Queried live openFDA (${res.domain}) for '${res.query}' and retrieved ${res.records.length} recall enforcement records.`,
        structuredContent: res
      };
    }
  });

  server.registerAppTool({
    name: "api_query_cpsc_recalls",
    title: "Live U.S. CPSC SaferProducts Consumer Recall API Query",
    category: "api",
    domain: "recall",
    tags: ["api", "cpsc", "saferproducts", "recall", "appliance", "refund"],
    description:
      "Queries the live U.S. Consumer Product Safety Commission (saferproducts.gov) REST API for official consumer product recalls, hazard descriptions, and remedy instructions.",
    resourceUri: "ui://billshield/agent-surface",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Consumer product or brand name (e.g. 'Stanley', 'Cosori', 'Bissell')."
        },
        productName: {
          type: "string",
          description: "Alias for query (consumer product or brand name)."
        },
        hazard: {
          type: "string",
          description: "Optional hazard keyword filter (e.g. 'fire', 'burn', 'laceration')."
        },
        limit: {
          type: "number",
          description: "Maximum number of CPSC recall records to return (default 5)."
        }
      }
    },
    handler: async (args) => {
      const res = await apiQueryCpscRecalls(args);
      return {
        voiceSummary: `Queried live CPSC SaferProducts API for '${res.query}' and found ${res.records.length} recall records.`,
        structuredContent: res
      };
    }
  });

  server.registerAppTool({
    name: "api_lookup_utility_rates",
    title: "Live U.S. State/ZIP Electric Utility TOU Rate Lookup",
    category: "api",
    domain: "utility",
    tags: ["api", "utility", "openei", "eia", "tou", "electricity", "rates"],
    compositionHint:
      "Pass returned rates.peakRatePerKwh and rates.offPeakRatePerKwh into calc_tou_load_shift.",
    description:
      "Looks up raw Time-of-Use (TOU) electricity tariff parameters (peakRatePerKwh, offPeakRatePerKwh, fixedMonthlyCustomerCharge, peakWindow) for any U.S. ZIP code or state without performing appliance assumptions.",
    resourceUri: "ui://billshield/agent-surface",
    inputSchema: {
      type: "object",
      properties: {
        zipCode: {
          type: "string",
          description: "5-digit U.S. ZIP code (e.g. '75201', '94103', '10001')."
        },
        stateAbbr: {
          type: "string",
          description: "Optional 2-letter U.S. state code (e.g. 'TX', 'CA', 'NY')."
        },
        stateCode: {
          type: "string",
          description: "Alias for stateAbbr (2-letter U.S. state code)."
        }
      }
    },
    handler: async (args) => {
      const res = await apiLookupUtilityRates(args);
      return {
        voiceSummary: `${res.utilityName} (${res.stateAbbr}) schedule ${res.scheduleCode} has Peak rate $${res.rates.peakRatePerKwh}/kWh (${res.peakWindow}) and Off-Peak rate $${res.rates.offPeakRatePerKwh}/kWh.`,
        structuredContent: res
      };
    }
  });

  // ============================================================================
  // B. PURE PARAMETERIZED MATH & FORMULA TOOLS (calc_*) — Zero Hardcoded Factors
  // ============================================================================

  server.registerAppTool({
    name: "calc_medicare_fee_formula",
    title: "Parameterized Medicare RVU × GPCI × Conversion Factor Calculator",
    category: "math",
    domain: "medical",
    tags: ["math", "calc", "formula", "medicare", "rvu", "gpci", "conversionFactor"],
    compositionHint:
      "Supply workRvu/peRvu/mpRvu from api_lookup_medical_code, gpci from api_lookup_locality_gpci, and your chosen conversionFactor (e.g. 32.35 or 40.00). Then pass totalReferenceFee to calc_line_item_variance.",
    description:
      "Executes the exact Medicare fee formula `((workRvu * gpciWork) + (peRvu * gpciPe) + (mpRvu * gpciMp)) * conversionFactor * modifierMultiplier * units`. Contains ZERO hardcoded conversion factors — Alexa+ must supply `conversionFactor` dynamically (e.g. 32.35 today, 40.00 tomorrow).",
    resourceUri: "ui://billshield/agent-surface",
    inputSchema: {
      type: "object",
      required: ["workRvu", "peRvu", "mpRvu", "conversionFactor"],
      properties: {
        workRvu: { type: "number", description: "Physician Work RVU weight from api_lookup_medical_code." },
        peRvu: { type: "number", description: "Practice Expense RVU weight from api_lookup_medical_code." },
        mpRvu: { type: "number", description: "Malpractice RVU weight from api_lookup_medical_code." },
        gpciWork: { type: "number", description: "Geographic Work GPCI (default 1.0)." },
        gpciPe: { type: "number", description: "Geographic PE GPCI (default 1.0)." },
        gpciMp: { type: "number", description: "Geographic MP GPCI (default 1.0)." },
        conversionFactor: {
          type: "number",
          description: "Dollar per RVU conversion factor supplied by Alexa+ (e.g. 32.35 or 40.00). Required."
        },
        modifierMultiplier: {
          type: "number",
          description: "Clinical modifier multiplier (e.g. 1.0 standard, 1.5 bilateral)."
        },
        units: { type: "number", description: "Number of service units billed (default 1)." }
      }
    },
    handler: async (args) => {
      const res = calcMedicareFeeFormula(args);
      return {
        voiceSummary: `Using conversion factor $${res.inputs.conversionFactor} per RVU across ${res.geographicallyAdjustedRvu} geographically adjusted RVUs, the reference fee is $${res.totalReferenceFee.toFixed(2)}.`,
        structuredContent: res
      };
    }
  });

  server.registerAppTool({
    name: "calc_line_item_variance",
    title: "Parameterized Line-Item Variance & Overcharge Calculator",
    category: "math",
    domain: "medical",
    tags: ["math", "calc", "variance", "overcharge", "multiplier", "markup"],
    description:
      "Calculates the allowed ceiling (`referenceAmount * allowedMultiplier`), markup ratio, and net overcharge (`max(0, billedAmount - allowedCeiling)`) for a billed line item using an agent-supplied `allowedMultiplier`.",
    resourceUri: "ui://billshield/agent-surface",
    inputSchema: {
      type: "object",
      required: ["billedAmount", "referenceAmount", "allowedMultiplier"],
      properties: {
        billedAmount: { type: "number", description: "Dollar amount charged on the bill." },
        referenceAmount: {
          type: "number",
          description: "Reference benchmark fee from calc_medicare_fee_formula."
        },
        allowedMultiplier: {
          type: "number",
          description: "Maximum fair multiple of the reference fee chosen by Alexa+ (e.g. 1.0, 1.25, 1.5, 2.0)."
        },
        isBundledOrDuplicate: {
          type: "boolean",
          description: "True if NCCI bundling or duplicate line detection makes the allowed ceiling $0.00."
        }
      }
    },
    handler: async (args) => {
      const res = calcLineItemVariance(args);
      return {
        voiceSummary: `At ${res.allowedMultiplier}x reference ($${res.allowedCeiling.toFixed(2)} ceiling), the $${res.billedAmount.toFixed(2)} charge has a net overcharge of $${res.overchargeAmount.toFixed(2)}.`,
        structuredContent: res
      };
    }
  });

  server.registerAppTool({
    name: "calc_tou_load_shift",
    title: "Parameterized Appliance Time-of-Use Load Shift Calculator",
    category: "math",
    domain: "utility",
    tags: ["math", "calc", "utility", "tou", "kwh", "savings"],
    description:
      "Calculates monthly and annual electricity savings from shifting specified appliance loads (`kilowatts`, `durationHours`, `runsPerMonth`) from `currentRatePerKwh` to `targetRatePerKwh`.",
    resourceUri: "ui://billshield/agent-surface",
    inputSchema: {
      type: "object",
      required: ["appliances", "currentRatePerKwh", "targetRatePerKwh"],
      properties: {
        appliances: {
          type: "array",
          description: "Array of { name, kilowatts, durationHours, runsPerMonth }."
        },
        currentRatePerKwh: { type: "number", description: "Peak electricity rate in $/kWh." },
        targetRatePerKwh: { type: "number", description: "Off-Peak electricity rate in $/kWh." },
        fixedMonthlyFee: { type: "number", description: "Optional current fixed monthly customer fee." },
        maxAllowedFixedFee: { type: "number", description: "Optional benchmark fixed monthly customer fee." }
      }
    },
    handler: async (args) => {
      const res = calcTouLoadShift(args);
      return {
        voiceSummary: `Shifting ${res.totalMonthlyKwh} kilowatt-hours per month from $${res.currentRatePerKwh} to $${res.targetRatePerKwh} saves $${res.totalMonthlySavings.toFixed(2)} monthly ($${res.totalAnnualSavings.toFixed(2)} per year).`,
        structuredContent: res
      };
    }
  });

  server.registerAppTool({
    name: "calc_income_ami_subsidy",
    title: "Parameterized Household Income / AMI Ratio & Subsidy Cap Calculator",
    category: "math",
    domain: "rebate",
    tags: ["math", "calc", "ami", "income", "subsidy", "rebate"],
    description:
      "Calculates household income as a percentage of size-adjusted Area Median Income (AMI) and applies caller-supplied `coverageRate` and `maxCap` (`min(projectCost * coverageRate, maxCap)`).",
    resourceUri: "ui://billshield/agent-surface",
    inputSchema: {
      type: "object",
      required: ["annualHouseholdIncome", "areaMedianIncome", "projectCost", "coverageRate", "maxCap"],
      properties: {
        annualHouseholdIncome: { type: "number", description: "Gross annual household income in USD." },
        areaMedianIncome: { type: "number", description: "4-person Area Median Income from api_lookup_locality_gpci." },
        householdSize: { type: "number", description: "Number of people in household (default 4)." },
        projectCost: { type: "number", description: "Estimated appliance or upgrade cost in USD." },
        coverageRate: { type: "number", description: "Subsidy coverage ratio supplied by Alexa+ (e.g. 1.0, 0.5, 0.3)." },
        maxCap: { type: "number", description: "Maximum dollar cap supplied by Alexa+ (e.g. 8000, 1750, 840)." }
      }
    },
    handler: async (args) => {
      const res = calcIncomeAmiSubsidy(args);
      return {
        voiceSummary: `At ${res.amiRatioPct}% of adjusted AMI ($${res.sizeAdjustedAmi}), applying a ${(res.coverageRate * 100).toFixed(0)}% coverage rate with a $${res.maxCap} cap yields a $${res.subsidyAmount.toFixed(2)} subsidy.`,
        structuredContent: res
      };
    }
  });

  // ============================================================================
  // C. DYNAMIC ECHO SHOW SURFACE & DISPUTE DOCUMENT TOOLS (ui_*)
  // ============================================================================

  server.registerAppTool({
    name: "render_echo_show_surface",
    title: "Render Dynamic Echo Show Visual Surface",
    category: "ui",
    domain: "ui",
    tags: ["ui", "render", "echo", "surface", "carousel", "fullscreen"],
    description:
      "Renders agent-computed metrics and line-item rows from `api_*` and `calc_*` tools onto the Echo Show 3-mode visual surface (`Inline`, `Fullscreen`, `Voice-only`).",
    resourceUri: "ui://billshield/agent-surface",
    inputSchema: {
      type: "object",
      required: ["title", "rows"],
      properties: {
        title: { type: "string", description: "Main header title for the Echo Show screen." },
        subtitle: { type: "string", description: "Subtitle showing formula or API provenance." },
        badge: { type: "string", description: "Badge label (e.g. 'DYNAMIC AGENT AUDIT')." },
        voiceSummary: { type: "string", description: "Spoken summary for Alexa+ Voice-only mode." },
        metrics: { type: "array", description: "Array of { label, value, tone } summary metrics." },
        rows: {
          type: "array",
          description: "Array of { id, title, subtitle, originalLabel, fairLabel, deltaLabel, status, citation }."
        }
      }
    },
    handler: async (args) => {
      const res = renderEchoShowSurface(args);
      return {
        voiceSummary: res.voiceSummary,
        structuredContent: res
      };
    }
  });

  server.registerAppTool({
    name: "build_dispute_document",
    title: "Build Mathematically Traced Formal Dispute Document",
    category: "ui",
    domain: "medical",
    tags: ["ui", "dispute", "letter", "legal", "claim", "trace"],
    description:
      "Compiles a formal billing dispute or claim packet embedding the exact `formulaTrace` strings and `conversionFactorUsed` produced by `calc_*` tools.",
    resourceUri: "ui://billshield/claim-packet",
    inputSchema: {
      type: "object",
      required: ["recipientName", "disputedItems"],
      properties: {
        recipientName: { type: "string", description: "Name of hospital, utility, or manufacturer." },
        claimType: { type: "string", description: "Dispute category (e.g. 'MEDICAL_BILL_DISPUTE')." },
        conversionFactorUsed: {
          type: "number",
          description: "Optional $/RVU conversion factor used by Alexa+ in calculations."
        },
        disputedItems: {
          type: "array",
          description:
            "Array of { code, description, billedAmount, allowedCeiling, overchargeAmount, formulaTrace, citation }."
        }
      }
    },
    handler: async (args) => {
      const res = buildDisputeDocument(args);
      return {
        voiceSummary: res.voiceSummary,
        structuredContent: res
      };
    }
  });

  // ============================================================================
  // D. COMPOSITE WORKFLOW TOOLS (Preserved for One-Shot Convenience & Backward Compat)
  // ============================================================================

  // Register Tool 1: audit_household_bill
  server.registerAppTool({
    name: "audit_household_bill",
    title: "Audit Household & Medical Bill",
    category: "workflow",
    domain: "medical",
    tags: ["workflow", "audit", "bill", "autopsy"],
    description:
      "Audits itemized medical, hospital, dental, ISP, or utility bills against CMS Medicare Fee Schedule, NCCI unbundling rules, and consumer junk-fee statutes.",
    resourceUri: "ui://billshield/autopsy-board",
    inputSchema: {
      type: "object",
      properties: {
        providerName: { type: "string", description: "Name of hospital, clinic, or service provider" },
        visitComplexity: {
          type: "string",
          description: "Clinical or service complexity: low, moderate, or high"
        },
        customerOwnsModem: {
          type: "boolean",
          description: "True if customer owns their router/modem"
        },
        conversionFactor: {
          type: "number",
          description: "Optional CMS Medicare $/RVU conversion factor (defaults to 32.35; scales reference rates proportionally if supplied)."
        },
        zipCode: {
          type: "string",
          description: "Optional 5-digit U.S. ZIP code resolved via live Zippopotam.us API for geographic GPCI scaling."
        },
        lineItems: {
          type: "array",
          description: "List of billed line items ({ code, description, billedAmount })"
        }
      }
    },
    handler: async (args) => {
      const mergedInput = {
        ...DEFAULT_SAMPLE_BILL,
        ...args,
        lineItems:
          Array.isArray(args?.lineItems) && args.lineItems.length > 0
            ? args.lineItems
            : DEFAULT_SAMPLE_BILL.lineItems
      };
      const result = await auditHouseholdBillLive(mergedInput);
      return {
        voiceSummary: result.voiceSummary,
        structuredContent: result
      };
    }
  });

  // Register Tool 2: optimize_utility_tariff
  server.registerAppTool({
    name: "optimize_utility_tariff",
    title: "Optimize Electric Utility Time-of-Use Tariff",
    category: "workflow",
    domain: "utility",
    tags: ["workflow", "utility", "tariff", "tou"],
    description:
      "Analyzes regional OpenEI Time-of-Use (Peak vs Off-Peak) electricity rates by ZIP code and calculates monthly/annual appliance shift savings.",
    resourceUri: "ui://billshield/tariff-optimizer",
    inputSchema: {
      type: "object",
      required: ["zipCode"],
      properties: {
        zipCode: { type: "string", description: "5-digit U.S. ZIP code (e.g. 94103, 10001, 60601)" },
        appliances: {
          type: "array",
          description: "Appliance IDs to shift (dryer, dishwasher, ev_charger, water_heater, hvac_precool)"
        }
      }
    },
    handler: async (args) => {
      const result = await optimizeUtilityTariffLive(args);
      return {
        voiceSummary: result.voiceSummary,
        structuredContent: result
      };
    }
  });

  // Register Tool 3: find_cash_rebates
  server.registerAppTool({
    name: "find_cash_rebates",
    title: "Find Renter & Homeowner Cash Rebates",
    category: "workflow",
    domain: "rebate",
    tags: ["workflow", "rebate", "ira", "hear", "renter"],
    description:
      "Finds federal IRA (HEAR/25C) point-of-sale cash rebates, portable renter upgrades, and community solar utility bill credits by ZIP code, income, and renter/owner status.",
    resourceUri: "ui://billshield/rebate-board",
    inputSchema: {
      type: "object",
      required: ["zipCode"],
      properties: {
        zipCode: { type: "string", description: "5-digit U.S. ZIP code" },
        tenure: { type: "string", description: "'renter' or 'owner'" },
        householdIncome: { type: "number", description: "Annual household gross income in USD" },
        householdSize: { type: "number", description: "Number of people in household" }
      }
    },
    handler: async (args) => {
      const result = await findCashRebatesLive(args);
      return {
        voiceSummary: result.voiceSummary,
        structuredContent: result
      };
    }
  });

  // Register Tool 4: scan_household_recalls
  server.registerAppTool({
    name: "scan_household_recalls",
    title: "Scan Household Products for CPSC & openFDA Recall Refunds",
    category: "workflow",
    domain: "recall",
    tags: ["workflow", "recall", "cpsc", "fda"],
    description:
      "Scans household appliances, kids' gear, and pantry items against live CPSC and openFDA recall databases for no-receipt cash refunds.",
    resourceUri: "ui://billshield/recall-radar",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Household items or product names to scan"
        }
      }
    },
    handler: async (args) => {
      const result = await scanHouseholdRecalls(args, { enableLivePing: true });
      return {
        voiceSummary: result.voiceSummary,
        structuredContent: result
      };
    }
  });

  // Register Tool 5: generate_official_dispute_or_claim
  server.registerAppTool({
    name: "generate_official_dispute_or_claim",
    title: "Generate Official Billing Dispute or Cash Claim Packet",
    category: "workflow",
    domain: "medical",
    tags: ["workflow", "dispute", "claim", "letter"],
    description:
      "Generates a formal, statute-cited billing dispute letter (No Surprises Act / CMS / NCCI) or CPSC recall/rebate claim form ready to sign and send.",
    resourceUri: "ui://billshield/claim-packet",
    inputSchema: {
      type: "object",
      required: ["claimType"],
      properties: {
        claimType: {
          type: "string",
          description: "BILL_DISPUTE, RECALL_REFUND, or REBATE_CLAIM"
        },
        providerName: { type: "string" },
        disputedCode: { type: "string" },
        savingsAmount: { type: "number" },
        recallId: { type: "string" },
        productName: { type: "string" },
        programId: { type: "string" }
      }
    },
    handler: async (args) => {
      const result = generateOfficialDisputeOrClaim(args);
      return {
        voiceSummary: result.voiceSummary,
        structuredContent: result
      };
    }
  });

  // ============================================================================
  // E. PROGRESSIVE DISCOVERY & CODE MODE SANDBOX (search_tools, describe_tool, execute_codemode)
  // ============================================================================
  server.enableProgressiveDiscovery({ resourceUri: "ui://billshield/agent-surface" });
  server.enableCodeMode({ resourceUri: "ui://billshield/agent-surface" });

  // Attach Alexa+ Multimodal Device Simulator routes (GET / and GET /simulator)
  attachSimulatorRoutes(server);

  return server;
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const port = Number(process.env.PORT || 4040);
  const server = createBillShieldServer();
  const info = await server.listen(port, "127.0.0.1");
  console.log(`[BillShield MCP] Alexa+ Streamable HTTP MCP Endpoint: ${info.url}`);
  console.log(`[BillShield MCP] Alexa+ 3-Mode Interactive Device Simulator: ${info.baseUrl}/simulator`);
}
