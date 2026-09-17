import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { scoreTier, TIER_LABELS, yakumanLabel, type RoomRules, type Seat } from "@riichi/core";
import { ChipGroup, Label, Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/controls";
import { useSocket } from "@/ws/useRoom";
import { CommandError } from "@/ws/socket";
import { HandEditor } from "./hand/HandEditor";

/** 拍照识别（相机、推理、布局规则）只在打开牌面页时才加载，主包不带 */
const CameraButton = lazy(() =>
  import("@/features/recognition/CameraButton").then((m) => ({ default: m.CameraButton })),
);
import { isHandComplete, type ValueDraft } from "./valueDraft";
import { writeValueMode } from "./valueModePref";

const HAN_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((n) => ({
  value: n,
  label: n,
}));
const FU_OPTIONS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110].map((n) => ({
  value: n,
  label: n,
}));

/** 手牌录满后自动评估的防抖时间 */
const EVALUATE_DEBOUNCE_MS = 300;

export function ValuePicker({
  draft,
  onChange,
  rules,
  seat,
  dealer,
}: {
  draft: ValueDraft;
  /** 函数式更新：评估结果异步回来时只改仍然匹配的草稿 */
  onChange: (update: (d: ValueDraft) => ValueDraft) => void;
  rules: RoomRules;
  /** 和牌者；还没选时为 null，牌面照常录入但不送评估 */
  seat: Seat | null;
  /** 本局庄家座位 */
  dealer: Seat;
}) {
  const socket = useSocket();
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const tier =
    draft.yakuman === 0 && draft.han !== null && draft.fu !== null
      ? scoreTier({ han: draft.han, fu: draft.fu, yakuman: 0 }, rules)
      : "normal";
  const maxYakuman = rules.scoring.yakumanStacking ? 6 : 1;

  // 牌面完整即自动算番；回包只在手牌快照未变时写回（防乱序与覆盖期间改动）。
  // onChange 走 ref：调用方可以传每次渲染新建的函数，不会触发 effect 重跑（否则荣和框会无限轮询）。
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const handKey = JSON.stringify(draft.hand);
  const complete = isHandComplete(draft.hand);
  useEffect(() => {
    if (!complete || seat === null) return;
    const hand = JSON.parse(handKey) as ValueDraft["hand"];
    let cancelled = false;
    // 座位或手牌变了，旧结果立即失效
    onChangeRef.current((d) => (d.evaluated ? { ...d, evaluated: null } : d));
    const timer = setTimeout(() => {
      setEvaluating(true);
      setEvalError(null);
      socket
        .evaluate(seat, hand)
        .then((evaluated) => {
          if (cancelled) return;
          onChangeRef.current((d) =>
            JSON.stringify(d.hand) === handKey ? { ...d, evaluated } : d,
          );
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setEvalError(err instanceof CommandError ? err.message : "计算失败");
        })
        .finally(() => {
          if (!cancelled) setEvaluating(false);
        });
    }, EVALUATE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setEvaluating(false);
    };
  }, [handKey, complete, seat, socket]);

  return (
    <Tabs
      value={draft.mode}
      onValueChange={(v) => {
        const mode = v as ValueDraft["mode"];
        writeValueMode(mode);
        onChange((d) => ({ ...d, mode }));
      }}
    >
      <TabsList className="w-full">
        <TabsTrigger value="manual" className="flex-1">
          番符
        </TabsTrigger>
        <TabsTrigger value="hand" className="flex-1">
          牌面
        </TabsTrigger>
      </TabsList>
      <TabsContent value="manual" className="mt-3 space-y-3">
        <div>
          <div className="flex items-center justify-between">
            <Label>番数</Label>
            {draft.yakuman === 0 && TIER_LABELS[tier] && (
              <span className="text-xs text-accent">{TIER_LABELS[tier]}</span>
            )}
          </div>
          <ChipGroup
            value={draft.yakuman === 0 ? draft.han : null}
            onChange={(han) => onChange((d) => ({ ...d, han, yakuman: 0 }))}
            options={HAN_OPTIONS}
            className="mt-1"
          />
        </div>
        <div>
          <Label>符数</Label>
          <ChipGroup
            value={draft.yakuman === 0 ? draft.fu : null}
            onChange={(fu) => onChange((d) => ({ ...d, fu, yakuman: 0 }))}
            options={FU_OPTIONS}
            className="mt-1"
          />
        </div>
        <div>
          <Label>役满</Label>
          <ChipGroup
            value={draft.yakuman || null}
            onChange={(yakuman) => onChange((d) => ({ ...d, yakuman }))}
            options={Array.from({ length: maxYakuman }, (_, i) => ({
              value: i + 1,
              label: yakumanLabel(i + 1),
            }))}
            className="mt-1"
          />
        </div>
      </TabsContent>
      <TabsContent value="hand" className="mt-3 space-y-3">
        <HandEditor
          draft={draft}
          onChange={onChange}
          rules={rules}
          evaluated={draft.evaluated}
          evaluating={evaluating}
          evalError={seat === null && complete ? "先选和牌者" : evalError}
          isDealer={seat === dealer}
          camera={
            <Suspense fallback={null}>
              <CameraButton draft={draft} onChange={onChange} rules={rules} />
            </Suspense>
          }
        />
      </TabsContent>
    </Tabs>
  );
}
