// Preset templates to pre-fill the QC / Filling Line Log Sheet.
// Edit values here to match the most common products on the line.

export interface QCPreset {
  id: string;
  name: string;
  description: string;
  values: {
    mNumber?: string;
    bottleWeight?: number;
    capWeight?: number;
    liquidWeightPer100ml?: number;
    totalWeightGrams?: number;
    minimumVolume?: number;
    maximumVolume?: number;
    boxesPerPallet?: number;
    bottleCount?: number;
    palletRowVolumes?: { row: string; pump1: string; pump2: string }[];
    notes?: string;
  };
}

export const QC_PRESETS: QCPreset[] = [
  {
    id: "500ml-standard",
    name: "500ml standard fill",
    description: "Common 500ml bottle run defaults",
    values: {
      bottleWeight: 22,
      capWeight: 3,
      liquidWeightPer100ml: 100,
      totalWeightGrams: 525,
      minimumVolume: 498,
      maximumVolume: 505,
      boxesPerPallet: 60,
      bottleCount: 1200,
      palletRowVolumes: [
        { row: "1", pump1: "", pump2: "" },
        { row: "2", pump1: "", pump2: "" },
        { row: "3", pump1: "", pump2: "" },
        { row: "4", pump1: "", pump2: "" },
        { row: "5", pump1: "", pump2: "" },
      ],
    },
  },
  {
    id: "1l-standard",
    name: "1L standard fill",
    description: "Common 1L bottle run defaults",
    values: {
      bottleWeight: 38,
      capWeight: 4,
      liquidWeightPer100ml: 100,
      totalWeightGrams: 1042,
      minimumVolume: 998,
      maximumVolume: 1006,
      boxesPerPallet: 48,
      bottleCount: 720,
      palletRowVolumes: [
        { row: "1", pump1: "", pump2: "" },
        { row: "2", pump1: "", pump2: "" },
        { row: "3", pump1: "", pump2: "" },
        { row: "4", pump1: "", pump2: "" },
      ],
    },
  },
  {
    id: "5l-standard",
    name: "5L standard fill",
    description: "Common 5L bottle run defaults",
    values: {
      bottleWeight: 145,
      capWeight: 8,
      liquidWeightPer100ml: 100,
      totalWeightGrams: 5153,
      minimumVolume: 4990,
      maximumVolume: 5020,
      boxesPerPallet: 24,
      bottleCount: 240,
      palletRowVolumes: [
        { row: "1", pump1: "", pump2: "" },
        { row: "2", pump1: "", pump2: "" },
        { row: "3", pump1: "", pump2: "" },
      ],
    },
  },
];
