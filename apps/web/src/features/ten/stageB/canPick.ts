import { isLocalPlayer, type PlayerRef, type Seat, type TenStage } from "@riichi/core";

/**
 * 谁可以在全牌型板上划牌（那是防守方的排除记号）——与宣言同一条规则：设备玩家的事由本人在自己的手机上做；
 * 本地玩家没有手机，任何端（主控台、别的手机）都可以代做。服务端不鉴权（房间内人人是管理员），这里只管界面。
 */
export function canPickFor(
  stage: Extract<TenStage, { kind: "B" }>,
  seats: readonly (PlayerRef | null)[],
  mySeat: Seat | null,
): boolean {
  const defender = 1 - stage.attacker;
  return mySeat === defender || isLocalPlayer(seats[defender]);
}
