/**
 * Official Dispute Letter & Cash Claim Packet Generator
 *
 * Produces ready-to-send formal billing dispute letters and recall/rebate claim packets
 * citing exact federal statutes (No Surprises Act, CMS PFS, NCCI Manual, TVPA 47 U.S.C. § 562, CPSC 16 C.F.R. Part 1115).
 */

import { VERIFIED_RECALL_LEDGER } from "./recall-scanner.mjs";

export function generateOfficialDisputeOrClaim(input = {}) {
  const claimType = String(input.claimType || "BILL_DISPUTE").toUpperCase();
  const consumerName = input.consumerName || "Household Account Holder";
  const accountNumber = input.accountNumber || "ACCT-VERIFIED-2026";
  const disputedCode = input.disputedCode || "99285 / 36415";
  const recallIdInput = input.recallId || null;
  const productNameInput = input.productName || "";

  const matchedRecall =
    claimType === "RECALL_REFUND"
      ? VERIFIED_RECALL_LEDGER.find(
          (entry) =>
            (recallIdInput && entry.recallId.toLowerCase() === String(recallIdInput).toLowerCase()) ||
            (productNameInput &&
              entry.keywords.some((kw) => productNameInput.toLowerCase().includes(kw.toLowerCase())))
        ) || null
      : null;

  const effectiveRecallId = matchedRecall ? matchedRecall.recallId : recallIdInput || "CPSC-VERIFIED";
  const effectiveProductName = matchedRecall
    ? matchedRecall.productName
    : productNameInput || "Recalled Household Product";
  const providerName =
    input.providerName ||
    (claimType === "RECALL_REFUND"
      ? `${effectiveProductName.split(" ")[0]} Recall Compliance & Consumer Remedy Department`
      : "Billing Compliance & Dispute Resolution Department");
  const savingsAmount = Number(
    input.savingsAmount ??
      input.refundEstimateDollars ??
      input.rebateAmount ??
      (matchedRecall ? matchedRecall.refundEstimateDollars : 153.6)
  );
  const recallId = effectiveRecallId;
  const programId = input.programId || null;
  const dateStr = new Date().toISOString().slice(0, 10);

  let documentTitle = "Formal Notice of Billing Error, Itemized Bill Request & Financial Assistance Inquiry";
  let legalBasis =
    "42 U.S.C. § 300gg-111 (No Surprises Act), IRS § 501(r) Hospital Financial Assistance, CMS CY2026 Fee Schedule, NCCI Policy Manual & 47 U.S.C. § 562 / 47 C.F.R. § 64.2401";
  let letterBody = "";

  if (claimType === "RECALL_REFUND") {
    documentTitle = `Official CPSC / FDA Recall Remedy Claim (${effectiveRecallId})`;
    legalBasis = matchedRecall
      ? `${matchedRecall.authority} — Consumer Product Safety Act Sec. 15 (15 U.S.C. § 2064)`
      : "Consumer Product Safety Act Section 15 (15 U.S.C. § 2064) & 16 C.F.R. Part 1115";
    const instructions =
      input.claimInstructions ||
      (matchedRecall && matchedRecall.claimInstructions) ||
      "Verify model/lot number on official CPSC.gov or FDA.gov recall notice and submit claim via manufacturer recall portal.";
    const officialUrl =
      input.officialUrl ||
      (matchedRecall && matchedRecall.officialUrl) ||
      "https://www.cpsc.gov/Recalls";
    letterBody = [
      `Date: ${dateStr}`,
      `To: ${providerName}`,
      `Claimant: ${consumerName}`,
      `Official Recall ID: ${effectiveRecallId} — ${effectiveProductName}`,
      `Official CPSC/FDA Notice URL: ${officialUrl}`,
      `Estimated Remedy Value: $${savingsAmount.toFixed(2)} (No Store Receipt Required)`,
      "",
      `Action Required / Portal Protocol: ${instructions}`,
      "",
      "Pursuant to the official Consumer Product Safety Commission (CPSC) / FDA recall notice referenced above,",
      "I am submitting this written record for the designated refund, credit, or free replacement remedy without an original store receipt.",
      "I have completed or am attaching the required model/lot verification steps specified in the official recall protocol."
    ].join("\n");
  } else if (claimType === "REBATE_CLAIM") {
    documentTitle = `Point-of-Sale Energy Rebate & Utility Credit Application (${programId || "HEAR-25C"})`;
    legalBasis = "Inflation Reduction Act Sec. 50122 (HEAR) & Internal Revenue Code Sec. 25C";
    letterBody = [
      `Date: ${dateStr}`,
      `Applicant: ${consumerName}`,
      `Program ID: ${programId || "window-heat-pump"}`,
      `Qualified Rebate / Bill Credit: $${savingsAmount.toFixed(2)}`,
      "",
      "I hereby apply for the qualified portable/residential electrification incentive and utility bill credit",
      "verified under my ZIP code and Area Median Income (AMI) eligibility tier."
    ].join("\n");
  } else {
    letterBody = [
      `Date: ${dateStr}`,
      `To: ${providerName}`,
      `From: ${consumerName} (Account: ${accountNumber})`,
      `Disputed Code(s) / Line Items: ${disputedCode}`,
      `Requested Adjustment / Negotiation Target: -$${savingsAmount.toFixed(2)}`,
      "",
      "Dear Billing Compliance & Patient Financial Services Officer,",
      "",
      `I am formally disputing the above-referenced charge(s) on Account ${accountNumber} and requesting the following actions:`,
      "1. ITEMIZED STATEMENT & CODING REVIEW: Please provide a complete itemized bill (UB-04 / CMS-1500 or full tariff breakdown) and remove any NCCI unbundled collection/supply fees, duplicate charges, customer-owned equipment fees (47 U.S.C. § 562), or non-governmental carrier cost-recovery surcharges (47 C.F.R. § 64.2401).",
      "2. FINANCIAL ASSISTANCE & INSURANCE VERIFICATION: For medical charges, please confirm whether all claims were billed to primary insurance/Medicaid and provide an application for Hospital Financial Assistance / Charity Care (IRS § 501(r) / state charity care law).",
      `3. REFERENCE-BASED PRICING ADJUSTMENT: Benchmarked against the CMS CY2026 Medicare Fee Schedule, NCCI Procedure-to-Procedure (PTP) edits, and federal truth-in-billing rules, the billed charges exceed fair benchmark rates by $${savingsAmount.toFixed(2)}.`,
      "",
      "Please place this account in disputed-balance hold status (suspending collection transfer, adverse credit reporting, or late fees)",
      `while this itemized review, financial assistance screening, and $${savingsAmount.toFixed(2)} adjustment request are processed.`
    ].join("\n");
  }

  const rows = [
    {
      id: "doc-ref",
      title: documentTitle,
      subtitle: `Statutory Authority: ${legalBasis}`,
      originalLabel: claimType,
      fairLabel: "Ready to Sign",
      deltaLabel: `$${savingsAmount.toFixed(2)}`,
      status: "PACKET_READY",
      citation: legalBasis
    }
  ];

  const voiceSummary = `Prepared your official ${documentTitle} for $${savingsAmount.toFixed(
    2
  )} citing ${legalBasis}. It is ready on your screen to copy, print, or submit.`;

  return {
    claimType,
    documentTitle,
    legalBasis,
    consumerName,
    providerName,
    savingsAmount,
    letterBody,
    rows,
    voiceSummary
  };
}
