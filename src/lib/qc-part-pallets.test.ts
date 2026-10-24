import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/auth", () => ({ useAuth: vi.fn() }));
import { partPalletWrite, type PartPalletValues } from "./qc-part-pallets";
import { EMPTY_QC_CHECKS, validateQCForm } from "./qc-validation";

const unfinished: PartPalletValues = {
  standalone: false, linkedJobId: "job-test", wantAssembly: true, title: "",
  palletNumber: 2, mNumber: "", logDate: "2026-10-24", operatorName: "Test operator",
  bottleWeight: "", capWeight: "", liquidWeightPer100ml: "", totalWeightGrams: "",
  palletRowVolumes: [{ row: "1", pump1: "", pump2: "" }], startTime: "14:00", finishTime: "",
  minimumVolume: "", maximumVolume: "", boxesPerPallet: 12, bottleCount: 72,
  palletQuantity: 72, palletType: "CHEP", bottleQcOperator: "", capperOperator: "",
  packagingOperator: "", checks: { ...EMPTY_QC_CHECKS }, supervisorName: "", notes: "",
  fillOperator: "", finishedProductFileName: "", finalProductPhotoName: "",
};
describe("unfinished part pallets", () => {
  it("preserves incomplete fields and entered bottles for tomorrow", () => {
    const saved = partPalletWrite(unfinished);
    expect(saved.job_id).toBe("job-test");
    expect(saved.pallet_number).toBe(2);
    expect(saved.data.bottleCount).toBe(72);
    expect(saved.data.finishTime).toBe("");
    expect(saved.data.checks.fillLevel).toBe("");
  });
  it("does not produce an approved QC record or completed production", () => {
    const saved = partPalletWrite(unfinished);
    expect(saved).not.toHaveProperty("result");
    expect(saved.data).not.toHaveProperty("qcApproved");
    expect(saved.data).not.toHaveProperty("bottlesCompleted");
    expect(saved.data).not.toHaveProperty("unleashedAssemblyId");
  });
  it("still requires all details and signature before final submission", () => {
    expect(validateQCForm(unfinished)).toHaveProperty("Signature", "Supervisor signature is required.");
    expect(validateQCForm(unfinished)).toHaveProperty("M Number", "M Number is required.");
    expect(validateQCForm(unfinished)).toHaveProperty("Finish time");
  });
  it("keeps standalone draft and assembly opt-out", () => {
    const saved = partPalletWrite({ ...unfinished, standalone: true, linkedJobId: "", wantAssembly: false, title: "Incoming inspection" });
    expect(saved.job_id).toBe("standalone");
    expect(saved.data.wantAssembly).toBe(false);
    expect(saved.data.title).toBe("Incoming inspection");
  });
});