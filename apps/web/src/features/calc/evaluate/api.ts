import type { EvaluatedHand, EvaluateRequest } from "@riichi/core";
import { api } from "@/api/client";

export function evaluateOutsideRoom(req: EvaluateRequest, token: string): Promise<EvaluatedHand> {
  return api<EvaluatedHand>("/api/evaluate", { method: "POST", body: req, token });
}
