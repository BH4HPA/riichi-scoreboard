import { TILE, type Tile } from "@riichi/core";
import { TileFace } from "@/features/hand/TileFace";

function Row({ tiles, sideways = [] }: { tiles: Tile[]; sideways?: number[] }) {
  return (
    <span className="inline-flex items-end gap-px">
      {tiles.map((t, i) => (
        <TileFace key={i} tile={t} size="xs" rotated={sideways.includes(i)} />
      ))}
    </span>
  );
}

/**
 * 「怎么摆」：识别依赖的摆牌约定（与 layoutHand 一致），用牌图拼一张静态示意。
 * 宝牌指示牌在最上一行、里宝在它下面；手牌连成一排，和张横放在一端；副露放右边、叫的那张横放。
 */
export function LayoutGuide({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-10 flex flex-col justify-center gap-4 overflow-y-auto bg-black/90 p-5 text-white"
      role="dialog"
      aria-label="摆牌示意"
    >
      <h2 className="text-base font-semibold">怎么摆，识别最准</h2>
      <div className="space-y-3 rounded-xl bg-white/5 p-3">
        <div className="space-y-1">
          <Row tiles={[TILE.P3]} />
          <p className="text-xs text-white/70">最上一行：宝牌指示牌</p>
        </div>
        <div className="space-y-1">
          <Row tiles={[TILE.S7]} />
          <p className="text-xs text-white/70">
            第二行（立直才有）：里宝牌指示牌，拍到就自动勾立直
          </p>
        </div>
        <div className="space-y-1">
          <span className="inline-flex flex-wrap items-end gap-2">
            <Row
              tiles={[
                TILE.M2,
                TILE.M3,
                TILE.M4,
                TILE.P6,
                TILE.P7,
                TILE.P8,
                TILE.S2,
                TILE.S2,
                TILE.S4,
                TILE.S5,
                TILE.S6,
              ]}
              sideways={[10]}
            />
            <Row tiles={[TILE.Chun, TILE.Chun, TILE.Chun]} sideways={[0]} />
          </span>
          <p className="text-xs text-white/70">
            手牌连成一排，<strong className="text-white">和张横放</strong>在一端；副露放在右边，
            叫来的那张横放（暗杠两头扣着）
          </p>
        </div>
      </div>
      <p className="text-xs text-white/60">
        不用框选：手牌放在画面中部偏下，会自己找到并拍下。
        <strong className="text-white/80">指示牌紧贴手牌上方，牌河离远一点</strong>
        ——挨得太近的牌河末行会被当成指示牌。
      </p>
      <button
        type="button"
        onClick={onClose}
        className="self-start rounded-lg border border-white/40 px-4 py-2 text-sm"
      >
        知道了
      </button>
    </div>
  );
}
