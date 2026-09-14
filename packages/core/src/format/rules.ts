import type { RoomRules } from "../types/rules";
import { formatPoints } from "./round";

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** 终局结算规则的一句话描述：起返点、顺位马、oka、同点处理。 */
export function umaDescription(rules: RoomRules): string {
  const [a, b, c, d] = rules.final.uma;
  const oka = ((rules.final.returnPoints - rules.final.startPoints) * 4) / 1000;
  return `${formatPoints(rules.final.startPoints)} 起 / ${formatPoints(rules.final.returnPoints)} 返，顺位马 ${signed(a)}/${signed(b)}/${signed(c)}/${signed(d)}${oka ? `，oka ${signed(oka)} 归一位` : ""}${rules.final.tieRule === "split" ? "，同点按分" : "，同点起家优先"}`;
}

/** 关键规则摘要标签（大厅与电视镜像用）。 */
export function rulesSummary(rules: RoomRules): string[] {
  return [
    rules.progress.length === "east" ? "东风战" : "半庄",
    `${formatPoints(rules.final.startPoints)} 起 / ${formatPoints(rules.final.returnPoints)} 返`,
    `马 ${rules.final.uma.join("/")}`,
    rules.scoring.kiriageMangan ? "切上满贯" : "无切上",
    rules.scoring.kazoeYakuman ? "累计役满" : "13 番封顶三倍满",
    rules.scoring.doubleYakuman ? "多倍役满" : "无多倍役满",
    `赤 ${rules.hand.akaCount}`,
    rules.hand.kuitan ? "食断" : "无食断",
    rules.win.multiRon === "atamahane" ? "头跳" : rules.win.multiRon === "double" ? "双响" : "三响",
    rules.progress.tobi.enabled ? "击飞" : "无击飞",
    rules.progress.enchousen.enabled
      ? `西入 ${formatPoints(rules.progress.enchousen.threshold)}`
      : "无西入",
    rules.progress.agariYame ? "和了止" : "无和了止",
    rules.progress.abortiveDraws ? "途中流局" : "无途中流局",
    rules.final.tieRule === "split" ? "同点按分" : "同点起家优先",
  ];
}
