import type { RoomRules } from "../types/rules";
import { tenTimeMark, type TenTimeMark } from "../ten/clock";
import type { TenGameState } from "../ten/state";
import { isLocalPlayer, type GameState, type PlayerRef, type RoomState } from "../types/state";
import type { Seat } from "../types/tiles";

/** 广播给客户端的对局视图：不含撤销栈本体，只含深度。 */
export interface GameViewOf<G> {
  present: G;
  undoDepth: number;
  redoDepth: number;
}
export type GameView = GameViewOf<GameState>;
export type TenGameView = GameViewOf<TenGameState>;

/** 房间视图里与房型无关的部分（与 `RoomState` 的壳对应） */
interface RoomViewShell {
  code: string;
  seq: number;
  phase: RoomState["phase"];
  rules: RoomRules;
  seats: (PlayerRef | null)[];
  ready: boolean[];
  /** 各座位是否在线：空座 false，本地玩家恒为 true，设备玩家看是否有活动连接 */
  online: boolean[];
  /** 距自动开局的剩余毫秒（广播时刻计）；null 表示未在倒计时。用剩余量而非时刻，手机时钟偏差不影响显示 */
  autoStartIn: number | null;
  /** 电视正在播放的立直音乐；内存态，不进事件表 */
  music: MusicState | null;
  gameNo: number;
}

export interface YonmaRoomView extends RoomViewShell {
  kind: "yonma";
  game: GameView | null;
}

export interface TenRoomView extends RoomViewShell {
  kind: "ten";
  game: TenGameView | null;
  /** 暗计时的提示档（广播时刻计，见 `ten/clock.ts`）；未在对局中为 0。只给档位、不给剩余时间 */
  timeMark: TenTimeMark;
}

/** 以 `kind` 判别；旧服务端不发 `kind`，客户端一律 `kind === "ten" ? 二人 : 四人` */
export type RoomView = YonmaRoomView | TenRoomView;

/**
 * 谁按下了立直、放哪首：track 为曲库 id；seat 为 null 表示按下者没有座位（主控台代按）。
 * 名字由客户端按座位快照派生，不进协议；at 单调递增，客户端用它区分「同曲重按」。
 */
export interface MusicState {
  track: string;
  seat: Seat | null;
  at: number;
}

export function seatsOnline(state: RoomState, onlinePlayerIds: ReadonlySet<string>): boolean[] {
  return state.seats.map((p) => p !== null && (isLocalPlayer(p) || onlinePlayerIds.has(p.id)));
}

/** 全是本地玩家时不自动开局：由主控台手动开。 */
export function autoStartEligible(state: RoomState, online: boolean[]): boolean {
  if (state.phase !== "lobby") return false;
  if (state.seats.some((p) => p === null)) return false;
  if (state.ready.some((r) => !r) || online.some((o) => !o)) return false;
  return state.seats.some((p) => p !== null && !isLocalPlayer(p));
}

function gameView<G>(game: { past: G[]; present: G; future: G[] } | null): GameViewOf<G> | null {
  return game
    ? { present: game.present, undoDepth: game.past.length, redoDepth: game.future.length }
    : null;
}

export function toRoomView(
  state: RoomState,
  seq: number,
  onlinePlayerIds: ReadonlySet<string>,
  autoStartIn: number | null,
  music: MusicState | null,
  now: number,
): RoomView {
  const shell: RoomViewShell = {
    code: state.code,
    seq,
    phase: state.phase,
    rules: state.rules,
    seats: state.seats,
    ready: state.ready,
    online: seatsOnline(state, onlinePlayerIds),
    autoStartIn,
    music,
    gameNo: state.gameNo,
  };
  if (state.kind !== "ten") return { ...shell, kind: "yonma", game: gameView(state.game) };
  const playing = state.game?.present.status === "playing" ? state.game.present : null;
  return {
    ...shell,
    kind: "ten",
    game: gameView(state.game),
    timeMark: playing ? tenTimeMark(playing.startedAt, now) : 0,
  };
}
