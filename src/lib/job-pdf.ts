// Generate a printable run sheet PDF for a single production job.
// Uses jsPDF. Mock-data friendly: pulls live values from the job +
// stock check + best-match line setup preset, but degrades gracefully
// when fields are missing so this works on seed data today and on
// real job data later.

import jsPDF from "jspdf";
import type { Job } from "@/lib/types";
import { computeJobStockCheck } from "@/lib/job-stock";
import { findSetupForJob, type LineSetupPreset } from "@/lib/line-setups";
import { fmtDate, fmtDateTime } from "@/lib/utils-domain";
import { getBranding, hexToRgb, type Branding } from "@/lib/branding";
import { getSpecForCustomerSync, type CustomerSpec } from "@/lib/customer-specs";

// Default brand (overridden per-call by tenant branding)
const BRAND = {
  primary: [14, 116, 144] as [number, number, number], // teal-ish
  accent: [56, 189, 248] as [number, number, number],
  ink: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  line: [203, 213, 225] as [number, number, number],
  panel: [241, 245, 249] as [number, number, number],
};

const M = 40; // page margin

function header(doc: jsPDF, title: string, subtitle: string, b: Branding) {
  const w = doc.internal.pageSize.getWidth();
  const primary = hexToRgb(b.primaryColor);
  const accent = hexToRgb(b.secondaryColor);
  // Brand band
  doc.setFillColor(primary[0], primary[1], primary[2]);
  doc.rect(0, 0, w, 60, "F");
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 60, w, 4, "F");

  // Logo mark
  if (b.pdfLogo) {
    try {
      doc.addImage(b.pdfLogo, "PNG", M, 12, 36, 36);
    } catch {
      /* ignore bad image */
    }
  } else {
    doc.setFillColor(255, 255, 255);
    doc.circle(M + 12, 30, 12, "F");
    doc.setTextColor(primary[0], primary[1], primary[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(b.companyName.slice(0, 2).toUpperCase(), M + 12, 34, { align: "center" });
  }

  // Wordmark
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(b.appName, M + 48, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`${b.companyName} · Production Run Sheet`, M + 48, 44);

  // Title (right side)
  doc.setFontSize(11);
  doc.text(title, w - M, 28, { align: "right" });
  doc.setFontSize(9);
  doc.text(subtitle, w - M, 44, { align: "right" });
}

function footer(doc: jsPDF, jobId: string, page: number, total: number, b: Branding) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...BRAND.line);
  doc.line(M, h - 36, w - M, h - 36);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  doc.text(`${b.appName} · Job ${jobId} · Generated ${fmtDateTime(new Date())}`, M, h - 22);
  doc.text(`Page ${page} of ${total}`, w - M, h - 22, { align: "right" });
}

function sectionTitle(doc: jsPDF, y: number, label: string): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BRAND.panel);
  doc.rect(M, y, w - M * 2, 22, "F");
  doc.setFillColor(...BRAND.primary);
  doc.rect(M, y, 4, 22, "F");
  doc.setTextColor(...BRAND.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(label.toUpperCase(), M + 12, y + 15);
  return y + 32;
}

function kvGrid(
  doc: jsPDF,
  y: number,
  rows: Array<[string, string]>,
  cols = 2,
): number {
  const w = doc.internal.pageSize.getWidth() - M * 2;
  const colW = w / cols;
  const rowH = 30;
  rows.forEach((row, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = M + c * colW;
    const yy = y + r * rowH;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(row[0].toUpperCase(), x, yy + 9);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.ink);
    const txt = doc.splitTextToSize(row[1] || "—", colW - 12);
    doc.text(txt, x, yy + 22);
  });
  const rowsUsed = Math.ceil(rows.length / cols);
  return y + rowsUsed * rowH + 6;
}

function tableSimple(
  doc: jsPDF,
  y: number,
  headers: string[],
  rows: string[][],
): number {
  const w = doc.internal.pageSize.getWidth() - M * 2;
  const colW = w / headers.length;
  const rowH = 20;

  // header
  doc.setFillColor(...BRAND.primary);
  doc.rect(M, y, w, rowH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  headers.forEach((h, i) => {
    doc.text(h.toUpperCase(), M + i * colW + 8, y + 13);
  });
  let yy = y + rowH;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  rows.forEach((r, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(M, yy, w, rowH, "F");
    }
    doc.setTextColor(...BRAND.ink);
    r.forEach((cell, i) => {
      const txt = doc.splitTextToSize(cell, colW - 12);
      doc.text(txt, M + i * colW + 8, yy + 13);
    });
    yy += rowH;
  });
  doc.setDrawColor(...BRAND.line);
  doc.rect(M, y, w, yy - y);
  return yy + 10;
}

function paragraph(doc: jsPDF, y: number, label: string, body: string): number {
  const w = doc.internal.pageSize.getWidth() - M * 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.muted);
  doc.text(label.toUpperCase(), M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.ink);
  const lines = doc.splitTextToSize(body || "—", w);
  doc.text(lines, M, y + 14);
  return y + 14 + lines.length * 12 + 8;
}

export function generateJobPdf(job: Job, presets: LineSetupPreset[], branding?: Branding): jsPDF {
  const b = branding ?? getBranding();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const check = computeJobStockCheck(job);
  const setup = findSetupForJob(presets, job.product, job.bottleSize);
  const customerSpec = getSpecForCustomerSync(job.customer);
  const totalPages = customerSpec ? 3 : 2;

  const subtitle = `${job.customer} · ${job.product}`;

  // ===== Page 1: Job Details =====
  header(doc, `Job ${job.id}`, subtitle, b);

  let y = 90;
  y = sectionTitle(doc, y, "Job details");
  y = kvGrid(doc, y, [
    ["Job number", job.id],
    ["Status", job.status],
    ["Customer", job.customer],
    ["Product", `${job.product}${job.sku ? ` · ${job.sku}` : ""}`],
    ["Bottle size", job.bottleSize],
    ["Planned quantity", `${job.quantity.toLocaleString()} bottles`],
    ["Filling line", job.line],
    ["Operator", job.operator || "—"],
    ["Scheduled start", fmtDateTime(job.scheduledStart)],
    ["Due date", fmtDate(job.dueDate)],
    ["Priority", job.priority],
    ["Pallets planned", String(job.pallets)],
  ]);

  y = sectionTitle(doc, y, "Required stock items");
  y = tableSimple(
    doc,
    y,
    ["Item", "Required", "Available", "Status"],
    check.requirements.map((r) => [
      `${r.description}${r.stock ? ` (${r.stock.sku})` : ""}`,
      `${r.required.toLocaleString()} ${r.unit}`,
      `${r.available.toLocaleString()} ${r.unit}`,
      r.status === "ok" ? "OK" : r.status === "low" ? "LOW" : "SHORT",
    ]),
  );

  // Readiness banner
  const w = doc.internal.pageSize.getWidth();
  const ok = check.ready;
  doc.setFillColor(ok ? 220 : 254, ok ? 252 : 226, ok ? 231 : 226);
  doc.rect(M, y, w - M * 2, 36, "F");
  doc.setTextColor(ok ? 22 : 153, ok ? 101 : 27, ok ? 52 : 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(
    ok ? "STOCK READINESS: READY TO RUN" : "STOCK READINESS: SHORTAGE DETECTED",
    M + 12,
    y + 16,
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    ok
      ? "All required materials are available for this run."
      : `${check.shortCount} item(s) short. Resolve shortages before starting the run.`,
    M + 12,
    y + 30,
  );

  footer(doc, job.id, 1, totalPages, b);

  // ===== Page 2: Line Setup & Notes =====
  doc.addPage();
  header(doc, `Job ${job.id} · Setup`, subtitle, b);

  y = 90;
  y = sectionTitle(doc, y, "Materials selected");
  y = kvGrid(doc, y, [
    ["Liquid / product to fill", job.liquidSku || job.product],
    ["Bottle", job.bottleSku || `${job.bottleSize} bottle`],
    ["Cap", job.capSku || "Standard cap"],
    ["Label", job.labelSku || `${job.sku} label`],
    ["Carton", job.cartonSku || "Standard carton"],
  ]);

  y = sectionTitle(doc, y, "Line setup values");
  if (setup) {
    y = kvGrid(
      doc,
      y,
      [
        ["Fill level (volume)", `${setup.fillVolumeMl} ml`],
        ["Fill nozzle height", `${setup.fillNozzleHeightMm} mm`],
        ["Fill speed", `${setup.fillSpeedPct} %`],
        ["Conveyor speed", `${setup.conveyorSpeedHz} Hz`],
        ["Conveyor tension", `${setup.conveyorTensionPct} %`],
        ["Capper torque", `${setup.capperTorqueNm} Nm`],
        ["Capper head height", `${setup.capperHeadHeightMm} mm`],
        ["Label offset", `${setup.labelOffsetMm} mm`],
        ["Label temperature", `${setup.labelTempC} °C`],
        ["Start delay", `${setup.startDelayMs} ms`],
        ["Stop delay", `${setup.stopDelayMs} ms`],
        ["Sensor — fill", `${setup.sensorFillPositionMm} mm`],
        ["Sensor — cap", `${setup.sensorCapPositionMm} mm`],
        ["Sensor — label", `${setup.sensorLabelPositionMm} mm`],
      ],
      3,
    );
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.muted);
    doc.text(
      "No saved line setup preset for this product/bottle size. Operator to dial in during changeover.",
      M,
      y + 4,
    );
    y += 24;
  }

  y = paragraph(
    doc,
    y,
    "Sensor / settings notes",
    setup?.notes ||
      "Verify all sensor positions against the bottle profile before starting. Run 10 sample bottles at low speed.",
  );
  y = paragraph(
    doc,
    y,
    "Special instructions",
    job.notes || "No special instructions.",
  );
  y = paragraph(
    doc,
    y,
    "Changeover notes",
    setup
      ? `Reuse preset from ${setup.line}. Successful runs to date: ${setup.successfulRuns}.`
      : "First run for this product/size combination — record successful values to save as a preset.",
  );
  y = paragraph(
    doc,
    y,
    "QC notes",
    "Pull QC samples every pallet. Record fill weight, cap torque, label alignment and leak check in the QC log.",
  );

  footer(doc, job.id, 2, 2, b);
  return doc;
}

export function downloadJobPdf(job: Job, presets: LineSetupPreset[]) {
  const b = getBranding();
  const doc = generateJobPdf(job, presets, b);
  doc.save(`${b.appName}_${job.id}_${job.customer.replace(/\s+/g, "-")}.pdf`);
}

export function printJobPdf(job: Job, presets: LineSetupPreset[]) {
  const doc = generateJobPdf(job, presets);
  doc.autoPrint();
  const url = doc.output("bloburl");
  window.open(url, "_blank");
}
