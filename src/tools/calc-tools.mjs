/**
 * Pure Parameterized Mathematical & Formula Tools (calc_*) for BillShield MCP.
 *
 * Architectural Rule:
 * ZERO hardcoded conversion factors (no $32.35, no 2.2x markup threshold, no 0.38 fallback).
 * Every constant, conversion factor, multiplier, rate, or cap MUST be supplied as an
 * explicit parameter by Alexa+ (either directly or inside a Code Mode plan after calling api_* tools).
 */

function roundCents(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function round4(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

/**
 * 6.1: Calculates the reference fee from RVU components, GPCI geographic indices,
 * and an agent-supplied conversionFactor (e.g. 32.35 today, 40.00 tomorrow).
 */
export function calcMedicareFeeFormula(params = {}) {
  const workRvu = Number(params.workRvu);
  const peRvu = Number(params.peRvu);
  const mpRvu = Number(params.mpRvu);
  const conversionFactor = Number(params.conversionFactor);

  if (
    !Number.isFinite(workRvu) ||
    !Number.isFinite(peRvu) ||
    !Number.isFinite(mpRvu)
  ) {
    throw new Error(
      "calc_medicare_fee_formula requires numeric 'workRvu', 'peRvu', and 'mpRvu' parameters."
    );
  }
  if (!Number.isFinite(conversionFactor) || conversionFactor <= 0) {
    throw new Error(
      "calc_medicare_fee_formula requires a positive numeric 'conversionFactor' supplied by the caller (no hardcoded conversion factor is allowed)."
    );
  }

  const gpciWork = params.gpciWork !== undefined ? Number(params.gpciWork) : 1.0;
  const gpciPe = params.gpciPe !== undefined ? Number(params.gpciPe) : 1.0;
  const gpciMp = params.gpciMp !== undefined ? Number(params.gpciMp) : 1.0;
  const modifierMultiplier =
    params.modifierMultiplier !== undefined ? Number(params.modifierMultiplier) : 1.0;
  const units = params.units !== undefined ? Math.max(1, Number(params.units)) : 1;

  const weightedWork = round4(workRvu * gpciWork);
  const weightedPe = round4(peRvu * gpciPe);
  const weightedMp = round4(mpRvu * gpciMp);
  const geographicallyAdjustedRvu = round4(weightedWork + weightedPe + weightedMp);

  const rawUnitFee = geographicallyAdjustedRvu * conversionFactor * modifierMultiplier;

  const unitReferenceFee = roundCents(rawUnitFee);
  const totalReferenceFee = roundCents(unitReferenceFee * units);

  const formulaTrace = `((${workRvu} * ${gpciWork}) + (${peRvu} * ${gpciPe}) + (${mpRvu} * ${gpciMp})) * $${conversionFactor} * ${modifierMultiplier} * ${units}u = $${totalReferenceFee.toFixed(
    2
  )}`;

  return {
    inputs: {
      workRvu,
      peRvu,
      mpRvu,
      gpciWork,
      gpciPe,
      gpciMp,
      conversionFactor,
      modifierMultiplier,
      units
    },
    geographicallyAdjustedRvu,
    unitReferenceFee,
    totalReferenceFee,
    formulaTrace
  };
}

/**
 * 6.2: Calculates variance, allowed ceiling, markup ratio, and net overcharge
 * for a billed line item using an agent-supplied allowedMultiplier.
 */
export function calcLineItemVariance(params = {}) {
  const billedAmount = Number(params.billedAmount);
  const referenceAmount = Number(params.referenceAmount);
  const allowedMultiplier = Number(params.allowedMultiplier);
  const isBundledOrDuplicate = Boolean(params.isBundledOrDuplicate);

  if (!Number.isFinite(billedAmount) || billedAmount < 0) {
    throw new Error("calc_line_item_variance requires a non-negative numeric 'billedAmount'.");
  }
  if (!Number.isFinite(referenceAmount) || referenceAmount < 0) {
    throw new Error("calc_line_item_variance requires a non-negative numeric 'referenceAmount'.");
  }
  if (!Number.isFinite(allowedMultiplier) || allowedMultiplier < 0) {
    throw new Error(
      "calc_line_item_variance requires a numeric 'allowedMultiplier' supplied by the caller."
    );
  }

  const allowedCeiling = isBundledOrDuplicate
    ? 0
    : roundCents(referenceAmount * allowedMultiplier);

  const rawOvercharge = Math.max(0, billedAmount - allowedCeiling);

  const overchargeAmount = roundCents(rawOvercharge);
  const markupRatio =
    referenceAmount > 0 ? roundCents(billedAmount / referenceAmount) : 0;

  const formulaTrace = isBundledOrDuplicate
    ? `Bundled/Duplicate Flag=true -> Allowed=$0.00, Overcharge=$${billedAmount.toFixed(2)}`
    : `Allowed = $${referenceAmount.toFixed(2)} * ${allowedMultiplier}x = $${allowedCeiling.toFixed(
        2
      )}; Overcharge = max(0, $${billedAmount.toFixed(2)} - $${allowedCeiling.toFixed(
        2
      )}) = $${overchargeAmount.toFixed(2)} (${markupRatio}x reference)`;

  return {
    billedAmount: roundCents(billedAmount),
    referenceAmount: roundCents(referenceAmount),
    allowedMultiplier,
    isBundledOrDuplicate,
    allowedCeiling,
    overchargeAmount,
    markupRatio,
    exceedsAllowedCeiling: overchargeAmount > 0,
    formulaTrace
  };
}

/**
 * 6.3: Calculates appliance Time-of-Use (TOU) load shift savings from agent-supplied
 * currentRatePerKwh and targetRatePerKwh parameters.
 */
export function calcTouLoadShift(params = {}) {
  const appliances = Array.isArray(params.appliances) ? params.appliances : [];
  const currentRatePerKwh = Number(params.currentRatePerKwh);
  const targetRatePerKwh = Number(params.targetRatePerKwh);
  const fixedMonthlyFee = params.fixedMonthlyFee !== undefined ? Number(params.fixedMonthlyFee) : 0;
  const maxAllowedFixedFee =
    params.maxAllowedFixedFee !== undefined ? Number(params.maxAllowedFixedFee) : fixedMonthlyFee;

  if (appliances.length === 0) {
    throw new Error("calc_tou_load_shift requires a non-empty 'appliances' array.");
  }
  if (!Number.isFinite(currentRatePerKwh) || !Number.isFinite(targetRatePerKwh)) {
    throw new Error(
      "calc_tou_load_shift requires numeric 'currentRatePerKwh' and 'targetRatePerKwh' parameters."
    );
  }

  const breakdown = [];
  let totalMonthlyKwh = 0;
  let totalCurrentMonthlyCost = 0;
  let totalTargetMonthlyCost = 0;

  for (const app of appliances) {
    const kw = Math.max(0, Number(app.kilowatts) || 0);
    const hrs = Math.max(0, Number(app.durationHours) || 0);
    const runs = Math.max(0, Number(app.runsPerMonth) || 0);
    const monthlyKwh = roundCents(kw * hrs * runs);
    const currentCost = roundCents(monthlyKwh * currentRatePerKwh);
    const targetCost = roundCents(monthlyKwh * targetRatePerKwh);
    const monthlySavings = roundCents(Math.max(0, currentCost - targetCost));

    totalMonthlyKwh = roundCents(totalMonthlyKwh + monthlyKwh);
    totalCurrentMonthlyCost = roundCents(totalCurrentMonthlyCost + currentCost);
    totalTargetMonthlyCost = roundCents(totalTargetMonthlyCost + targetCost);

    breakdown.push({
      name: String(app.name || "Appliance"),
      kilowatts: kw,
      durationHours: hrs,
      runsPerMonth: runs,
      monthlyKwh,
      currentMonthlyCost: currentCost,
      targetMonthlyCost: targetCost,
      monthlySavings,
      annualSavings: roundCents(monthlySavings * 12)
    });
  }

  const fixedFeeExcessMonthly = roundCents(Math.max(0, fixedMonthlyFee - maxAllowedFixedFee));
  const loadShiftMonthlySavings = roundCents(
    Math.max(0, totalCurrentMonthlyCost - totalTargetMonthlyCost)
  );
  const totalMonthlySavings = roundCents(loadShiftMonthlySavings + fixedFeeExcessMonthly);
  const totalAnnualSavings = roundCents(totalMonthlySavings * 12);

  return {
    currentRatePerKwh,
    targetRatePerKwh,
    totalMonthlyKwh,
    totalCurrentMonthlyCost,
    totalTargetMonthlyCost,
    fixedFeeExcessMonthly,
    loadShiftMonthlySavings,
    totalMonthlySavings,
    totalAnnualSavings,
    applianceBreakdown: breakdown,
    formulaTrace: `${totalMonthlyKwh} kWh/mo * ($${currentRatePerKwh} - $${targetRatePerKwh}) + $${fixedFeeExcessMonthly} fixed excess = $${totalMonthlySavings.toFixed(
      2
    )}/mo ($${totalAnnualSavings.toFixed(2)}/yr)`
  };
}

/**
 * 6.4: Calculates household income as a ratio of Area Median Income (AMI) and applies
 * caller-supplied coverageRate and maxCap to a project cost.
 */
export function calcIncomeAmiSubsidy(params = {}) {
  const annualHouseholdIncome = Number(params.annualHouseholdIncome);
  const areaMedianIncome = Number(params.areaMedianIncome);
  const projectCost = Number(params.projectCost);
  const coverageRate = Number(params.coverageRate);
  const maxCap = Number(params.maxCap);

  if (
    !Number.isFinite(annualHouseholdIncome) ||
    !Number.isFinite(areaMedianIncome) ||
    areaMedianIncome <= 0
  ) {
    throw new Error(
      "calc_income_ami_subsidy requires numeric 'annualHouseholdIncome' and positive 'areaMedianIncome'."
    );
  }
  if (
    !Number.isFinite(projectCost) ||
    !Number.isFinite(coverageRate) ||
    !Number.isFinite(maxCap)
  ) {
    throw new Error(
      "calc_income_ami_subsidy requires numeric 'projectCost', 'coverageRate', and 'maxCap'."
    );
  }

  const householdSize = params.householdSize !== undefined ? Math.max(1, Number(params.householdSize)) : 4;
  const baseSizeAdjustmentPerPerson =
    params.baseSizeAdjustmentPerPerson !== undefined
      ? Number(params.baseSizeAdjustmentPerPerson)
      : 0.08;

  const sizeMultiplier = Math.max(
    0.5,
    Math.min(1.6, 1 + (householdSize - 4) * baseSizeAdjustmentPerPerson)
  );
  const sizeAdjustedAmi = roundCents(areaMedianIncome * sizeMultiplier);
  const amiRatioPct = roundCents((annualHouseholdIncome / sizeAdjustedAmi) * 100);

  const uncappedSubsidy = roundCents(projectCost * coverageRate);
  const subsidyAmount = roundCents(Math.min(uncappedSubsidy, maxCap));
  const netOutOfPocket = roundCents(Math.max(0, projectCost - subsidyAmount));

  return {
    annualHouseholdIncome,
    areaMedianIncome,
    householdSize,
    sizeAdjustedAmi,
    amiRatioPct,
    projectCost,
    coverageRate,
    maxCap,
    subsidyAmount,
    netOutOfPocket,
    formulaTrace: `Income $${annualHouseholdIncome} / AdjustedAMI $${sizeAdjustedAmi} = ${amiRatioPct}% AMI; Subsidy = min($${projectCost} * ${coverageRate}, $${maxCap}) = $${subsidyAmount.toFixed(
      2
    )}`
  };
}
