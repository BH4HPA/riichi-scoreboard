import { useState } from "react";
import type { EvaluatedHand, HandInput, RoomRules, Tile } from "@riichi/core";
import { withoutLoc, type TileLoc } from "@/features/hand/tileLoc";
import { confirmable, withHandEdit, type ValueDraft } from "../valueDraft";
import { TileKeyboard } from "../TileKeyboard";
import { HandConfirm } from "./HandConfirm";
import { replaceAt, withWinTile } from "./handEdits";
import { TileReplaceSheet } from "./TileReplaceSheet";

/**
 * 牌面页的装配：识别结果自洽就收起键盘只展示牌（确认态），否则展开全键盘（编辑态）。
 * 点过「改牌」就一直留在编辑态，直到下一次识别把 recognition 换掉：用户的显式选择优先于自动判定。
 */
export function HandEditor({
  draft,
  onChange,
  rules,
  evaluated,
  evaluating,
  evalError,
  camera,
  showValue = true,
  isDealer,
  riichiLocked,
}: {
  draft: ValueDraft;
  onChange: (update: (d: ValueDraft) => ValueDraft) => void;
  rules: RoomRules;
  evaluated: EvaluatedHand | null;
  evaluating: boolean;
  evalError: string | null;
  camera: React.ReactNode;
  /** 算点数页核对阶段不算番：不显示番符与役种那一块，免得永远停在「计算中…」 */
  showValue?: boolean;
  /** 和牌者是否庄家：决定第一巡自摸叫天和还是地和 */
  isDealer: boolean;
  /** 立直开关被外部事实锁定时的原因文案（见 ValuePicker `riichiLock`）；不传 = 可自由勾选 */
  riichiLocked?: string | undefined;
}) {
  const [picking, setPicking] = useState<TileLoc | null>(null);

  const setHand = (next: HandInput, clear?: TileLoc) =>
    onChange((d) => ({
      ...withHandEdit(d, next),
      evaluated: null,
      // 换完这一张就别再提示它了；增删牌会让下标失配，那时整批清掉（在 TileKeyboard 那条路上）
      recognition:
        d.recognition && clear
          ? { ...d.recognition, uncertain: withoutLoc(d.recognition.uncertain, clear) }
          : d.recognition,
    }));

  if (!confirmable(draft)) {
    return (
      <>
        {camera}
        <TileKeyboard
          hand={draft.hand}
          onChange={(hand) =>
            onChange((d) => ({
              ...withHandEdit(d, hand),
              evaluated: null,
              // 增删牌之后下标全错位，记号宁可全清也不能钉在别的牌上
              recognition: d.recognition ? { ...d.recognition, uncertain: [] } : null,
            }))
          }
          rules={rules}
          evaluated={evaluated}
          evaluating={evaluating}
          evalError={evalError}
          uncertain={draft.recognition?.uncertain ?? []}
          showValue={showValue}
          isDealer={isDealer}
          riichiLocked={riichiLocked}
        />
      </>
    );
  }

  return (
    <>
      {camera}
      <HandConfirm
        hand={draft.hand}
        rules={rules}
        uncertain={draft.recognition?.uncertain ?? []}
        riichiAuto={draft.riichiAuto}
        isDealer={isDealer}
        riichiLocked={riichiLocked}
        evaluated={evaluated}
        evaluating={evaluating}
        evalError={evalError}
        showValue={showValue}
        onHandChange={(next) => setHand(next)}
        onTileClick={setPicking}
        onEdit={() => onChange((d) => ({ ...d, editing: true }))}
      />
      <TileReplaceSheet
        hand={draft.hand}
        loc={picking}
        rules={rules}
        onReplace={(loc: TileLoc, tile: Tile) => {
          setHand(replaceAt(draft.hand, loc, tile), loc);
          setPicking(null);
        }}
        onSetWinTile={(loc: TileLoc) => {
          setHand(withWinTile(draft.hand, loc.i), loc);
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    </>
  );
}
