import assert from "node:assert/strict";
import {
  calcMedicareFeeFormula,
  calcLineItemVariance,
  calcTouLoadShift,
  calcIncomeAmiSubsidy
} from "../src/tools/calc-tools.mjs";

async function runNormalVerification() {
  // 1. calc_medicare_fee_formula: dynamic conversionFactor ($32.35 vs $40.00) & zero hardcoded fallback
  assert.throws(
    () => calcMedicareFeeFormula({ workRvu: 4.0, peRvu: 1.4, mpRvu: 0.52 }),
    /requires a positive numeric 'conversionFactor'/,
    "calcMedicareFeeFormula must reject missing conversionFactor (zero hardcoded constants allowed)"
  );

  const feeAt3235 = calcMedicareFeeFormula({
    workRvu: 4.0,
    peRvu: 1.4,
    mpRvu: 0.52,
    gpciWork: 1.0,
    gpciPe: 1.0,
    gpciMp: 1.0,
    conversionFactor: 32.35
  });
  const feeAt4000 = calcMedicareFeeFormula({
    workRvu: 4.0,
    peRvu: 1.4,
    mpRvu: 0.52,
    gpciWork: 1.0,
    gpciPe: 1.0,
    gpciMp: 1.0,
    conversionFactor: 40.0
  });

  assert.equal(feeAt3235.totalReferenceFee, 191.51, "5.92 RVU * $32.35 must equal $191.51");
  assert.equal(feeAt4000.totalReferenceFee, 236.8, "5.92 RVU * $40.00 must equal $236.80");

  // 2. calc_line_item_variance: dynamic allowedMultiplier & bundled flag
  assert.throws(
    () => calcLineItemVariance({ billedAmount: 1850, referenceAmount: 191.51 }),
    /requires a numeric 'allowedMultiplier'/,
    "calcLineItemVariance must reject missing allowedMultiplier"
  );

  const var1x = calcLineItemVariance({
    billedAmount: 1850,
    referenceAmount: 191.51,
    allowedMultiplier: 1.0,
    isBundledOrDuplicate: false
  });
  const var2x = calcLineItemVariance({
    billedAmount: 1850,
    referenceAmount: 191.51,
    allowedMultiplier: 2.0,
    isBundledOrDuplicate: false
  });
  const varBundled = calcLineItemVariance({
    billedAmount: 310,
    referenceAmount: 36.88,
    allowedMultiplier: 1.5,
    isBundledOrDuplicate: true
  });

  assert.equal(var1x.overchargeAmount, 1658.49, "At 1.0x multiplier, overcharge must be $1658.49");
  assert.equal(var2x.allowedCeiling, 383.02, "At 2.0x multiplier, allowed ceiling must be $383.02");
  assert.equal(var2x.overchargeAmount, 1466.98, "At 2.0x multiplier, overcharge must be $1466.98");
  assert.equal(varBundled.allowedCeiling, 0, "Bundled item must have $0.00 allowed ceiling");
  assert.equal(varBundled.overchargeAmount, 310, "Bundled item full billed amount is overcharge");

  // 3. calc_tou_load_shift: dynamic currentRatePerKwh & targetRatePerKwh
  const touResult = calcTouLoadShift({
    appliances: [
      { name: "Level-2 EV Charger", kilowatts: 7.2, durationHours: 2.5, runsPerMonth: 20 }
    ],
    currentRatePerKwh: 0.29,
    targetRatePerKwh: 0.11,
    fixedMonthlyFee: 24,
    maxAllowedFixedFee: 15
  });
  assert.equal(touResult.totalMonthlyKwh, 360, "7.2kW * 2.5h * 20 runs = 360 kWh/mo");
  assert.equal(touResult.loadShiftMonthlySavings, 64.8, "360 kWh * ($0.29 - $0.11) = $64.80/mo");
  assert.equal(touResult.fixedFeeExcessMonthly, 9, "$24 - $15 = $9/mo fixed excess");
  assert.equal(touResult.totalMonthlySavings, 73.8, "$64.80 + $9.00 = $73.80/mo");
  assert.equal(touResult.totalAnnualSavings, 885.6, "$73.80 * 12 = $885.60/yr");

  // 4. calc_income_ami_subsidy: dynamic coverageRate & maxCap
  const subsidyResult = calcIncomeAmiSubsidy({
    annualHouseholdIncome: 58000,
    areaMedianIncome: 95000,
    householdSize: 4,
    projectCost: 12000,
    coverageRate: 1.0,
    maxCap: 8000
  });
  assert.equal(subsidyResult.amiRatioPct, 61.05, "$58k / $95k = 61.05% AMI");
  assert.equal(subsidyResult.subsidyAmount, 8000, "min($12,000 * 1.0, $8,000 cap) = $8,000");
  assert.equal(subsidyResult.netOutOfPocket, 4000, "$12,000 - $8,000 = $4,000");

  console.log(
    `[PASS] Phase 6 (Pure Parameterized Calc Tools) verified (CF_32.35=$${feeAt3235.totalReferenceFee}, CF_40.00=$${feeAt4000.totalReferenceFee}, Variance1x=$${var1x.overchargeAmount}, TOU_Annual=$${touResult.totalAnnualSavings}, Subsidy=$${subsidyResult.subsidyAmount}).`
  );
}

await runNormalVerification();
