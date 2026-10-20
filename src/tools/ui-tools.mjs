/**
 * Dynamic Echo Show UI Surface & Formal Dispute Document Tools (src/tools/ui-tools.mjs)
 *
 * Allows Alexa+ to take the raw outputs of `api_*` and `calc_*` tools (or an `execute_codemode` plan)
 * and render them directly onto the Echo Show 3-Mode display (`Inline`, `Fullscreen`, `Voice-only`)
 * or compile a mathematically traced formal dispute packet.
 */

function roundCents(v) {
  return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
}

/**
 * 7.1a: Renders dynamic calculation results onto the Echo Show surface (`ui://billshield/agent-surface`).
 */
export function renderEchoShowSurface(params = {}) {
  const title = String(params.title || "Alexa+ Dynamic Financial Surface").trim();
  const subtitle = String(
    params.subtitle || "Live API Data + Agent-Supplied Mathematical Formula"
  ).trim();
  const badge = String(params.badge || "CODE MODE & ATOMIC TOOLS").trim();
  const voiceSummary = String(
    params.voiceSummary ||
      `${title}. Verify the itemized mathematical trace on your Echo Show screen.`
  ).trim();

  const metrics = Array.isArray(params.metrics)
    ? params.metrics.map((m) => ({
        label: String(m.label || "Metric"),
        value: String(m.value ?? "—"),
        tone: m.tone || "default"
      }))
    : [];

  const rawRows = Array.isArray(params.rows) ? params.rows : [];
  const rows = rawRows.map((r, idx) => ({
    id: String(r.id || `row-${idx + 1}`),
    title: String(r.title || r.code || `Item ${idx + 1}`),
    subtitle: String(r.subtitle || r.formulaTrace || ""),
    originalLabel: String(r.originalLabel || "—"),
    fairLabel: String(r.fairLabel || "—"),
    deltaLabel: String(r.deltaLabel || "—"),
    status: String(r.status || "VERIFIED"),
    citation: String(r.citation || "Dynamic Agent Calculation")
  }));

  const actions = Array.isArray(params.actions) ? params.actions : [];

  return {
    title,
    subtitle,
    badge,
    voiceSummary,
    metrics,
    rows,
    actions,
    rowCount: rows.length,
    renderedAt: new Date().toISOString()
  };
}

/**
 * 7.1b: Compiles a formal dispute or claim packet embedding the exact mathematical formulaTraces
 * produced by `calc_*` tools.
 */
export function buildDisputeDocument(params = {}) {
  const recipientName = String(params.recipientName || "Billing & Compliance Department").trim();
  const claimType = String(params.claimType || "MEDICAL_BILL_DISPUTE").trim();
  const conversionFactorUsed =
    params.conversionFactorUsed !== undefined ? Number(params.conversionFactorUsed) : null;
  const disputedItems = Array.isArray(params.disputedItems) ? params.disputedItems : [];

  if (disputedItems.length === 0) {
    throw new Error("build_dispute_document requires a non-empty 'disputedItems' array.");
  }

  let totalBilled = 0;
  let totalAllowed = 0;
  let totalOvercharge = 0;
  const itemLines = [];
  const rows = [];

  for (let i = 0; i < disputedItems.length; i++) {
    const item = disputedItems[i];
    const code = String(item.code || `ITEM-${i + 1}`);
    const description = String(item.description || "Billed Service");
    const billed = roundCents(Number(item.billedAmount) || 0);
    const allowed = roundCents(Number(item.allowedCeiling) || 0);
    const overcharge = roundCents(
      item.overchargeAmount !== undefined
        ? Number(item.overchargeAmount)
        : Math.max(0, billed - allowed)
    );
    const trace = String(
      item.formulaTrace || `Allowed=$${allowed.toFixed(2)}, Overcharge=$${overcharge.toFixed(2)}`
    );
    const citation = String(item.citation || "CMS RVU/GPCI Formula & NCCI Edits");

    totalBilled = roundCents(totalBilled + billed);
    totalAllowed = roundCents(totalAllowed + allowed);
    totalOvercharge = roundCents(totalOvercharge + overcharge);

    itemLines.push(
      `- [${code}] ${description}: Billed $${billed.toFixed(2)} vs. Allowed $${allowed.toFixed(
        2
      )} -> Overcharge $${overcharge.toFixed(2)} | Math Trace: ${trace} (${citation})`
    );

    rows.push({
      id: `dispute-item-${i + 1}`,
      title: `${code} — ${description}`,
      subtitle: trace,
      originalLabel: `Billed: $${billed.toFixed(2)}`,
      fairLabel: `Allowed: $${allowed.toFixed(2)}`,
      deltaLabel: `-$${overcharge.toFixed(2)}`,
      status: overcharge > 0 ? "DISPUTED_LINE" : "COMPLIANT",
      citation
    });
  }

  const cfClause =
    conversionFactorUsed !== null && Number.isFinite(conversionFactorUsed)
      ? ` using Conversion Factor $${conversionFactorUsed.toFixed(2)}/RVU`
      : "";

  const letterBody = [
    `TO: ${recipientName}`,
    `RE: FORMAL MATHEMATICAL AUDIT & BILLING DISPUTE (${claimType})`,
    ``,
    `Pursuant to federal billing transparency standards (45 CFR § 149.140 / CMS RVU-GPCI methodology${cfClause}), I formally dispute the following line items totaling $${totalOvercharge.toFixed(
      2
    )} in excess charges:`,
    ``,
    ...itemLines,
    ``,
    `SUMMARY: Total Billed $${totalBilled.toFixed(
      2
    )} | Fair Allowed Ceiling $${totalAllowed.toFixed(
      2
    )} | Demanded Adjustment: -$${totalOvercharge.toFixed(2)}.`,
    `Please issue an adjusted statement reflecting the verified mathematical calculations above within 30 days.`
  ].join("\n");

  const documentTitle = `Formal Audit Dispute: ${recipientName}`;
  const voiceSummary = `I compiled your formal dispute packet for ${recipientName}${cfClause}, documenting ${disputedItems.length} audited items and $${totalOvercharge.toFixed(
    2
  )} in recoverable overcharges.`;

  return {
    documentTitle,
    recipientName,
    claimType,
    conversionFactorUsed,
    totalBilled,
    totalAllowed,
    totalOvercharge,
    disputedItemCount: disputedItems.length,
    letterBody,
    voiceSummary,
    rows
  };
}
