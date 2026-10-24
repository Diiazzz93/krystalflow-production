import { describe, expect, it } from "vitest";
import { isCompletePalletRow, isDiggersProduct, validateQCForm, type QCFormValues, QC_CHECK_KEYS } from "./qc-validation";

const complete = (): QCFormValues => ({
  standalone: false, title: "", mNumber: ".", logDate: "2026-10-23", operatorName: "Operator",
  bottleWeight: 30, capWeight: 2, liquidWeightPer100ml: 80, totalWeightGrams: 432,
  palletRowVolumes: [{ row: "1", pump1: "500", pump2: "500" }], startTime: "09:00", finishTime: "10:00",
  minimumVolume: 495, maximumVolume: 505, palletNumber: 1, boxesPerPallet: 100, bottleCount: 600,
  palletQuantity: 600, palletType: "CHEP", bottleQcOperator: "QC", capperOperator: "Capper", packagingOperator: "Packer",
  checks: { fillLevel: "Pass", capTightness: "Pass", labelAlignment: "Pass", batchCode: "Pass", leakCheck: "Pass", bottleCondition: "Pass" },
  supervisorName: "Supervisor", supervisorSignatureDataUrl: "data:image/png;base64,c2lnbmF0dXJl", notes: "No issues",
});

describe("QC completion requirements", () => {
  it("allows a complete form with a full stop for M Number and no photos", () => {
    expect(validateQCForm(complete())).toEqual({});
  });
  const required = ["operatorName", "bottleWeight", "capWeight", "liquidWeightPer100ml", "totalWeightGrams", "startTime", "finishTime", "minimumVolume", "maximumVolume", "boxesPerPallet", "bottleCount", "palletQuantity", "palletType", "bottleQcOperator", "capperOperator", "packagingOperator", "supervisorName", "notes", "logDate"] as const;
  it.each(required)("blocks a missing %s", field => {
    expect(Object.keys(validateQCForm({ ...complete(), [field]: "" })).length).toBeGreaterThan(0);
  });
  it("requires a drawn supervisor signature", () => {
    expect(validateQCForm({ ...complete(), supervisorSignatureDataUrl: undefined }).Signature).toBeDefined();
  });
  it("requires an M Number entry on every form", () => {
    expect(validateQCForm({ ...complete(), mNumber: "" })["M Number"]).toBeDefined();
    expect(validateQCForm({ ...complete(), standalone: true, title: "Inspection", mNumber: " " })["M Number"]).toBeDefined();
    expect(validateQCForm({ ...complete(), mNumber: "M-123" })).toEqual({});
  });
  it("detects the Diggers brand in job identity", () => {
    expect(isDiggersProduct({ product: "Diggers product" })).toBe(true);
    expect(isDiggersProduct({ customer: "DIGGERS" })).toBe(true);
    expect(isDiggersProduct({ product: "IPA", customer: "Other" })).toBe(false);
  });
  it.each(QC_CHECK_KEYS)("requires an explicit %s inspection", key => {
    const form = complete(); form.checks[key] = "";
    expect(validateQCForm(form)["Inspection checks"]).toBeDefined();
  });
  it("allows a failed inspection to be recorded with sign-off", () => {
    const form = complete(); form.checks.leakCheck = "Fail";
    expect(validateQCForm(form)).toEqual({});
  });
  it("requires all added row readings", () => {
    expect(isCompletePalletRow({ row: "1", pump1: "500", pump2: "500" })).toBe(true);
    expect(isCompletePalletRow({ row: "1", pump1: "", pump2: "" })).toBe(false);
    expect(isCompletePalletRow({ row: " ", pump1: "500", pump2: "500" })).toBe(false);
    expect(validateQCForm({ ...complete(), palletRowVolumes: [{ row: "1", pump1: "500", pump2: "" }] })["Pallet row volumes"]).toBeDefined();
    expect(validateQCForm({ ...complete(), palletRowVolumes: [] })["Pallet row volumes"]).toBeDefined();
  });
  it("requires a standalone subject", () => {
    expect(validateQCForm({ ...complete(), standalone: true })["What is this QC check for?"]).toBeDefined();
  });
  it("rejects whitespace, zero quantities and invalid readings", () => {
    expect(validateQCForm({ ...complete(), supervisorName: " " }).Supervisor).toBeDefined();
    expect(validateQCForm({ ...complete(), bottleCount: 0 })["Bottle count"]).toBeDefined();
    expect(validateQCForm({ ...complete(), bottleWeight: NaN })["Bottle weight (g)"]).toBeDefined();
  });
});