import type { ClientCommand, Command } from "../types/commands";

/**
 * WebSocket 保活节奏。线上经腾讯云 CDN 回源，CDN 对约 10 s 无数据的连接会静默回收且不通知两端：
 * 客户端每 pingMs 发一次 ping，staleMs 内没收到任何服务端消息就主动重连；
 * 服务端 serverIdleMs 内没收到任何客户端消息就断开（手机被系统杀掉时不会发 close 帧）。
 */
export const WS_KEEPALIVE = { pingMs: 5_000, staleMs: 8_000, serverIdleMs: 20_000 } as const;

/** 全员准备且在线后自动开局的倒计时 */
export const AUTO_START_MS = 3_000;

/**
 * 提交后应停止立直音乐的命令：这一局结束或对局阶段变化。穷举，新增命令时必须表态。
 * redo 等于再提交一次结算所以停；undo 回到这一局，不停；declareRiichi 就是放曲的同一下点击，不停。
 */
export const STOPS_MUSIC: Record<Command["type"], boolean> = {
  tsumo: true,
  ron: true,
  draw: true,
  abortive: true,
  chombo: true,
  adjust: true,
  declareRiichi: false,
  endGame: true,
  newGame: true,
  toLobby: true,
  start: true,
  dissolve: true,
  setRules: false,
  sit: false,
  leave: false,
  setReady: false,
  syncProfile: false,
  undo: false,
  redo: true,
  // 二人房：宣言就是放曲的同一下点击，划牌时曲子接着放；记下一局的结果才停
  tenDeclare: false,
  tenMark: false,
  tenDraw: true,
  tenTsumo: true,
};

/**
 * baseSeq 落后时仍然执行的命令：可行性完全由服务端按当前快照判定，不需要发起者看到的是最新状态
 * （座位类的目标是绝对的座位号，权限按当前占位者重校验；start 由 requireLobby + 满座判定；
 * dissolve 任何阶段都合法；declareRiichi 自带按下时的局面，对不上由 reducer 拒绝，且幂等）。穷举，新增命令时必须表态。
 *
 * 其余命令都必须拒绝：结算/撤销/重做/调整/终局/回大厅的含义是「对我看到的这一局」，别人刚提交的
 * 结算会改变它的后果；setRules 是整份规则覆盖，落后的提交会盖掉别人刚改的。
 *
 * 为什么需要这张表：房间里任何一个人的操作都会让 seq 前进，广播到别的客户端要几十毫秒；
 * 这段窗口里别人点按钮就会带着旧 seq 到达，座位类操作因此被拒是纯粹的误伤。
 * 残留：leave 对本地玩家永远放行，命令在途中座位换成另一个本地玩家时会请离后来的那个；
 * 要消掉得让命令带上「我看到的占位者 id」。
 */
export const TOLERATES_STALE: Record<ClientCommand["type"], boolean> = {
  sit: true,
  sitLocal: true,
  leave: true,
  setReady: true,
  start: true,
  dissolve: true,
  setRules: false,
  toLobby: false,
  tsumo: false,
  ron: false,
  draw: false,
  abortive: false,
  chombo: false,
  adjust: false,
  declareRiichi: true,
  undo: false,
  redo: false,
  endGame: false,
  newGame: false,
  // 与 declareRiichi 同理：自带按下时的历史条数，且幂等；两人同时按，后到的得到「对方已宣言」而不是 stale。
  // 划牌是连续的点按：上一下的广播还在路上，下一下就带着旧 seq 到了——目标是绝对的（哪张牌、划不划），照样执行
  tenDeclare: true,
  tenMark: true,
  tenDraw: false,
  tenTsumo: false,
};

/** 服务端主动关闭连接的关闭码；除 idle 外客户端都不应重连。 */
export const WS_CLOSE = {
  unauthorized: 4001,
  notFound: 4004,
  dissolved: 4010,
  /** 服务端空闲超时断开；客户端应重连 */
  idle: 4008,
} as const;
