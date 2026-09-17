import { useState } from "react";
import type { RoomRules } from "@riichi/core";
import { readCalcRules, writeCalcRules } from "./rulesPref";

export function useCalcRules(): [RoomRules, (rules: RoomRules) => void] {
  const [rules, setRules] = useState(readCalcRules);
  return [
    rules,
    (next) => {
      writeCalcRules(next);
      setRules(next);
    },
  ];
}
