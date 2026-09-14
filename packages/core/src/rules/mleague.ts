import type { RoomRules, RulesPreset } from "../types/rules";

/** M-League 规定（2026-09 核实）。 */
export const MLEAGUE_RULES: RoomRules = {
  scoring: {
    kiriageMangan: true,
    kazoeYakuman: false,
    doubleYakuman: false,
    yakumanStacking: true,
    pao: true,
    honbaValue: 300,
    notenBappu: 3000,
  },
  hand: {
    akaCount: 3,
    uraDora: true,
    kanDora: true,
    kuitan: true,
    ippatsu: true,
    renhou: "none",
    nagashiMangan: false,
    kokushiAnkanChankan: false,
  },
  win: {
    multiRon: "atamahane",
  },
  progress: {
    length: "hanchan",
    tobi: { enabled: false, threshold: "below0", bonus: 0 },
    enchousen: { enabled: false, threshold: 30000 },
    agariYame: false,
    tenpaiYame: false,
    abortiveDraws: false,
    chombo: "none",
    riichiBelow1000: true,
  },
  final: {
    startPoints: 25000,
    returnPoints: 30000,
    uma: [30, 10, -10, -30],
    tieRule: "split",
    leftoverKyotaku: "top",
  },
};

export const MLEAGUE_PRESET: RulesPreset = {
  id: "mleague",
  name: "M-League",
  rules: MLEAGUE_RULES,
};

export const BUILTIN_PRESETS: readonly RulesPreset[] = [MLEAGUE_PRESET];
