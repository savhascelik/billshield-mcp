/**
 * Renter & Homeowner Cash Rebate and Utility Bill Credit Engine
 *
 * Why this exists:
 * Most energy incentives assume the user owns a single-family house and can replace a furnace.
 * BillShield separates incentives by tenure ("renter" vs "owner") and Area Median Income (AMI),
 * surfacing 100% portable, zero-landlord-approval rebates and monthly bill credits for renters.
 */

import {
  STATE_REFERENCE_INDEX,
  inferStateFromZipPrefix,
  apiLookupLocalityGpci
} from "../tools/api-tools.mjs";

export const REBATE_CATALOG = Object.freeze([
  {
    id: "window-heat-pump",
    title: "Portable / Saddle Window Heat Pump (Heating & Cooling)",
    eligibleTenures: ["renter", "owner"],
    retailEstimate: 1200,
    lowIncomeRebate: 1200, // 100% covered under HEAR (<80% AMI)
    moderateIncomeRebate: 600, // 50% covered under HEAR (80%-150% AMI) + 25C
    highIncomeRebate: 360, // 30% IRA 25C Tax Credit
    portableForRenter: true,
    authority: "IRA Sec. 50122 (HEAR Point-of-Sale Rebate) & IRC Sec. 25C"
  },
  {
    id: "heat-pump-dryer",
    title: "Ventless 120V Plug-In Heat Pump Clothes Dryer",
    eligibleTenures: ["renter", "owner"],
    retailEstimate: 950,
    lowIncomeRebate: 840,
    moderateIncomeRebate: 420,
    highIncomeRebate: 150,
    portableForRenter: true,
    authority: "IRA Sec. 50122 (HEAR Electric Dryer Cap $840) & ENERGY STAR Utility Rebate"
  },
  {
    id: "smart-thermostat-credit",
    title: "Smart Thermostat + Demand Response Annual Bill Credit",
    eligibleTenures: ["renter", "owner"],
    retailEstimate: 160,
    lowIncomeRebate: 160,
    moderateIncomeRebate: 125,
    highIncomeRebate: 85,
    portableForRenter: true,
    authority: "Local Utility Demand Response Program (Instant Enrollment Credit)"
  },
  {
    id: "community-solar-credit",
    title: "Community Solar Subscription (No Rooftop Panels Required)",
    eligibleTenures: ["renter", "owner"],
    retailEstimate: 0,
    lowIncomeRebate: 360, // 15% guaranteed annual electric bill credit
    moderateIncomeRebate: 240,
    highIncomeRebate: 180,
    portableForRenter: true,
    authority: "DOE Community Solar Subscription Credit (10%-15% Utility Bill Offset)"
  },
  {
    id: "whole-home-heat-pump",
    title: "Ducted Whole-Home Air-Source Heat Pump HVAC",
    eligibleTenures: ["owner"],
    retailEstimate: 9500,
    lowIncomeRebate: 8000,
    moderateIncomeRebate: 4000,
    highIncomeRebate: 2000,
    portableForRenter: false,
    authority: "IRA Sec. 50122 (HEAR $8,000 Cap) & IRC Sec. 25C ($2,000 Cap)"
  },
  {
    id: "panel-upgrade",
    title: "200-Amp Smart Breaker Panel Upgrade",
    eligibleTenures: ["owner"],
    retailEstimate: 4200,
    lowIncomeRebate: 4000,
    moderateIncomeRebate: 2000,
    highIncomeRebate: 600,
    portableForRenter: false,
    authority: "IRA Sec. 50122 ($4,000 Panel Rebate) & IRC Sec. 25C"
  }
]);

export function findCashRebates(input = {}) {
  const zipCode = String(input.zipCode || "10001").trim();
  const tenure = String(input.tenure || "renter").toLowerCase() === "owner" ? "owner" : "renter";
  const householdIncome = Number(input.householdIncome ?? 58000);
  const householdSize = Math.max(1, Number(input.householdSize ?? 2));

  // Regional Area Median Income (AMI) baseline across all 50 states + DC adjusted for household size
  const digits = zipCode.replace(/[^0-9]/g, "");
  const resolvedLoc =
    input.resolvedLocality ||
    (digits.length >= 3 ? inferStateFromZipPrefix(digits.padEnd(5, "0").slice(0, 5)) : null);
  const stateAmi4 =
    resolvedLoc && STATE_REFERENCE_INDEX[resolvedLoc.stateCode]
      ? STATE_REFERENCE_INDEX[resolvedLoc.stateCode].ami4
      : 88000;
  const baseRegionalAmi =
    zipCode.startsWith("941") || zipCode.startsWith("100") ? 118000 : stateAmi4;
  const sizeMultiplier = 0.7 + Math.min(householdSize, 6) * 0.1;
  const adjustedAmi = Math.round(baseRegionalAmi * sizeMultiplier);
  const amiRatio = Number(((householdIncome / adjustedAmi) * 100).toFixed(1));

  let incomeTier = "high";
  let tierLabel = "Above 150% AMI (Federal 25C Tax Credit + Utility Rebates)";
  if (amiRatio <= 80) {
    incomeTier = "low";
    tierLabel = "Low-Income Tier (<=80% AMI — Up to 100% Point-of-Sale Cash Rebate)";
  } else if (amiRatio <= 150) {
    incomeTier = "moderate";
    tierLabel = "Moderate-Income Tier (80%–150% AMI — Up to 50% Point-of-Sale Cash Rebate)";
  }

  const eligiblePrograms = REBATE_CATALOG.filter((prog) => prog.eligibleTenures.includes(tenure));

  let totalRebateDollars = 0;
  const rows = [];

  for (const prog of eligiblePrograms) {
    let rebateAmount = prog.highIncomeRebate;
    if (incomeTier === "low") rebateAmount = prog.lowIncomeRebate;
    else if (incomeTier === "moderate") rebateAmount = prog.moderateIncomeRebate;

    const netOutOfPocket = Math.max(0, prog.retailEstimate - rebateAmount);
    totalRebateDollars += rebateAmount;

    rows.push({
      id: prog.id,
      title: prog.title,
      subtitle: prog.portableForRenter
        ? "Portable / Renter-Safe (Zero Landlord Construction)"
        : "Homeowner Structural Upgrade",
      retailEstimate: prog.retailEstimate,
      rebateAmount,
      netOutOfPocket,
      portableForRenter: prog.portableForRenter,
      originalLabel: prog.retailEstimate > 0 ? `$${prog.retailEstimate.toFixed(2)}` : "$0 Upfront",
      fairLabel: `$${netOutOfPocket.toFixed(2)} Net`,
      deltaLabel: `+$${rebateAmount.toFixed(2)} Cash/Credit`,
      status: prog.portableForRenter ? "RENTER_PORTABLE" : "OWNER_UPGRADE",
      citation: prog.authority,
      actionTool: "generate_official_dispute_or_claim",
      actionLabel: "Prepare Claim",
      actionArgs: {
        claimType: "REBATE_CLAIM",
        programId: prog.id,
        rebateAmount
      }
    });
  }

  const voiceSummary = `For a ${tenure} household in ZIP ${zipCode} (${amiRatio}% of Area Median Income), BillShield unlocked ${
    rows.length
  } eligible programs worth $${totalRebateDollars.toFixed(
    2
  )} in direct point-of-sale rebates and utility bill credits.`;

  return {
    zipCode,
    localityName: resolvedLoc ? resolvedLoc.localityName || `${resolvedLoc.city}, ${resolvedLoc.stateCode}` : "US",
    liveGeoVerified: Boolean(resolvedLoc && resolvedLoc.liveGeoVerified),
    tenure,
    householdIncome,
    householdSize,
    adjustedAmi,
    amiRatio,
    incomeTier,
    tierLabel,
    totalRebateDollars,
    programCount: rows.length,
    rows,
    voiceSummary
  };
}

/**
 * Live-First wrapper for findCashRebates:
 * Queries live api.zippopotam.us (apiLookupLocalityGpci) to resolve exact city & state before computing AMI rebates.
 */
export async function findCashRebatesLive(input = {}, options = {}) {
  const zipCode = String(input.zipCode || "10001").trim();
  let resolvedLocality = null;
  if (zipCode.replace(/[^0-9]/g, "").length === 5) {
    try {
      resolvedLocality = await apiLookupLocalityGpci({ zipCode }, options);
    } catch {
      resolvedLocality = null;
    }
  }
  return findCashRebates({ ...input, resolvedLocality });
}
