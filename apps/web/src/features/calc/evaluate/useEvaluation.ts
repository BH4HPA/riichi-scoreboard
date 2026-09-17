import { useEffect, useState } from "react";
import type { EvaluatedHand, EvaluateRequest } from "@riichi/core";
import { ApiError } from "@/api/client";
import { useSession } from "@/api/session";
import { evaluateOutsideRoom } from "./api";

interface Outcome {
  key: string;
  result: EvaluatedHand | null;
  error: string | null;
}

/**
 * 请求为 null 时不算。结果连同它属于哪份请求一起存：请求一变就自动算「计算中」，
 * 旧回包对不上 key 直接丢，不用在 effect 里同步重置状态。本场不在请求里（只影响本地点数派生）。
 */
export function useEvaluation(req: EvaluateRequest | null): {
  evaluated: EvaluatedHand | null;
  evaluating: boolean;
  error: string | null;
} {
  const key = req ? JSON.stringify(req) : "";
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const body = JSON.parse(key) as EvaluateRequest;
    useSession
      .getState()
      .ensure()
      .then(({ token }) => evaluateOutsideRoom(body, token))
      .then((result) => !cancelled && setOutcome({ key, result, error: null }))
      .catch((err: unknown) => {
        if (cancelled) return;
        const error = err instanceof ApiError ? err.message : "计算失败，请检查网络";
        setOutcome({ key, result: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = key && outcome?.key === key ? outcome : null;
  return {
    evaluated: current?.result ?? null,
    evaluating: Boolean(key) && !current,
    error: current?.error ?? null,
  };
}
