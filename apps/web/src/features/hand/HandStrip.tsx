import { tileOrder, type Meld, type Tile } from "@riichi/core";
import { cn } from "@/lib/utils";
import { TileFace, type TileSize } from "./TileFace";
import { hasLoc, type TileLoc } from "./tileLoc";

/**
 * 手牌展示：暗牌按牌序、和张右置留空隙、副露成组（明副露首张横置，暗杠首尾牌背）。
 * wrap=false 时不换行，由调用方提供横向滚动容器（手机番符表）。
 *
 * 传了 `onTileClick` 就是可交互形态（结算确认态），否则是只读的（主控台、历史、番符表）。
 * **回调与 `marks` 一律用 `closed` 的原始下标**：这里为了好看会重排并把和张挑出来，
 * 渲染序与入参的下标对不上，所以整条链路都带着 srcIndex 走。
 */
export function HandStrip({
  closed,
  melds,
  winTile = null,
  size = "sm",
  wrap = true,
  marks,
  onTileClick,
  className,
}: {
  closed: readonly Tile[];
  melds: readonly Meld[];
  /** 和张（精确码）；null 表示不单独标出 */
  winTile?: Tile | null;
  size?: TileSize;
  wrap?: boolean;
  /** 要打「请核对」记号的位置（按原始下标） */
  marks?: readonly TileLoc[] | undefined;
  onTileClick?: ((loc: TileLoc) => void) | undefined;
  className?: string;
}) {
  const rest = closed.map((tile, srcIndex) => ({ tile, srcIndex }));
  // 同码多张时和张取最后一张（与 TileKeyboard 的 winIndex 一致）
  let winIndex = -1;
  if (winTile !== null) {
    for (let i = rest.length - 1; i >= 0; i--) {
      if (rest[i]!.tile === winTile) {
        winIndex = rest[i]!.srcIndex;
        rest.splice(i, 1);
        break;
      }
    }
  }
  rest.sort((a, b) => tileOrder(a.tile) - tileOrder(b.tile));
  const mark = (loc: TileLoc) => (marks ? hasLoc(marks, loc) : false);
  const click = (loc: TileLoc) => (onTileClick ? () => onTileClick(loc) : undefined);
  return (
    <div
      className={cn(
        "flex items-end gap-x-3 gap-y-1",
        // 不换行时留出右侧与上下内边距（选中框外扩 3px），避免被滚动容器裁掉
        wrap ? "flex-wrap" : "w-max flex-nowrap py-1 pr-1",
        className,
      )}
    >
      <div className="flex items-end gap-px">
        {rest.map(({ tile, srcIndex }) => (
          <TileFace
            key={srcIndex}
            tile={tile}
            size={size}
            mark={mark({ area: "closed", i: srcIndex })}
            onClick={click({ area: "closed", i: srcIndex })}
          />
        ))}
      </div>
      {winIndex >= 0 && (
        <TileFace
          tile={winTile!}
          size={size}
          selected
          mark={mark({ area: "closed", i: winIndex })}
          onClick={click({ area: "closed", i: winIndex })}
        />
      )}
      {melds.map((m, i) => (
        <MeldGroup key={i} meld={m} index={i} size={size} mark={mark} click={click} />
      ))}
    </div>
  );
}

function MeldGroup({
  meld,
  index,
  size,
  mark,
  click,
}: {
  meld: Meld;
  index: number;
  size: TileSize;
  mark: (loc: TileLoc) => boolean;
  click: (loc: TileLoc) => (() => void) | undefined;
}) {
  const ankan = !meld.open && meld.tiles.length === 4;
  const last = meld.tiles.length - 1;
  return (
    <div className="flex items-end gap-px" role="group" aria-label={ankan ? "暗杠" : "副露"}>
      {meld.tiles.map((t, j) => {
        const back = ankan && (j === 0 || j === last);
        return (
          <TileFace
            key={j}
            tile={t}
            size={size}
            back={back}
            rotated={meld.open && j === 0}
            mark={mark({ area: "meld", i: index, j })}
            // 暗杠的牌背是摆法不是牌，点它没有意义
            onClick={back ? undefined : click({ area: "meld", i: index, j })}
          />
        );
      })}
    </div>
  );
}

/**
 * 宝牌 / 里宝指示牌一行。默认空了就整行不渲染（展示场景）。
 * `keepEmpty` 用于结算确认态：那里键盘是收起来的，指示牌没认出来必须留个空位提醒，
 * 否则用户看不见缺口，会直接按少算的番数确认。
 */
export function IndicatorRow({
  label,
  tiles,
  size = "xs",
  area,
  marks,
  onTileClick,
  keepEmpty = false,
  onAdd,
}: {
  label: string;
  tiles: readonly Tile[];
  size?: TileSize;
  area?: "dora" | "ura" | undefined;
  marks?: readonly TileLoc[] | undefined;
  onTileClick?: ((loc: TileLoc) => void) | undefined;
  keepEmpty?: boolean;
  onAdd?: (() => void) | undefined;
}) {
  if (tiles.length === 0 && !keepEmpty) return null;
  const loc = (i: number): TileLoc => ({ area: area ?? "dora", i });
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted">
      <span>{label}</span>
      <div className="flex items-end gap-px">
        {tiles.map((t, i) => (
          <TileFace
            key={i}
            tile={t}
            size={size}
            mark={marks ? hasLoc(marks, loc(i)) : false}
            onClick={area && onTileClick ? () => onTileClick(loc(i)) : undefined}
          />
        ))}
      </div>
      {tiles.length === 0 &&
        (onAdd ? (
          <button
            type="button"
            className="text-accent underline-offset-2 hover:underline"
            onClick={onAdd}
          >
            没认出来，点这里补
          </button>
        ) : (
          <span>—</span>
        ))}
    </div>
  );
}
