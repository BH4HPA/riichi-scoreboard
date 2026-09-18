import { create } from "zustand";

export type DraftKind = "tsumo" | "ron";

/** 一份草稿：`state` 为 null 表示用户还没动过，表单按当下的默认值渲染。 */
export interface DraftEntry {
  stamp: string;
  generation: number;
  state: unknown;
}

interface DraftStore {
  entries: Record<string, DraftEntry>;
}

/**
 * 结算草稿：按「房间码:结算类型」各存一份，只在内存。关掉弹窗不丢；打开时局面变了就换一份新的。
 * `generation` 每换一份加一，异步回写（算番、照片留存）带着自己的代次，旧代次写不进新草稿。
 */
export const useDraftStore = create<DraftStore>()(() => ({ entries: {} }));

export const draftKey = (room: string, kind: DraftKind) => `${room}:${kind}`;

/** 打开弹窗时调用：局面一致沿用，否则换一份新的（代次递增）。 */
export function ensureDraft(key: string, stamp: string): void {
  const prev = useDraftStore.getState().entries[key];
  if (prev?.stamp === stamp) return;
  putEntry(key, { stamp, generation: (prev?.generation ?? 0) + 1, state: null });
}

/** 只写进仍是同一代次的草稿。 */
export function updateDraft<S>(
  key: string,
  generation: number,
  init: () => S,
  update: (state: S) => S,
): void {
  const entry = useDraftStore.getState().entries[key];
  if (!entry || entry.generation !== generation) return;
  const current = (entry.state as S | null) ?? init();
  const next = update(current);
  // 没有实际变化就不落盘：state 留 null，表单继续按当下的默认值渲染（useDeclaredRiichi 挂载时必调一次 update）
  if (next !== current) putEntry(key, { ...entry, state: next });
}

/** 离开房间：丢掉这个房间的全部草稿。 */
export function clearRoomDrafts(room: string): void {
  const entries = Object.fromEntries(
    Object.entries(useDraftStore.getState().entries).filter(([k]) => !k.startsWith(`${room}:`)),
  );
  useDraftStore.setState({ entries });
}

function putEntry(key: string, entry: DraftEntry): void {
  useDraftStore.setState((s) => ({ entries: { ...s.entries, [key]: entry } }));
}
