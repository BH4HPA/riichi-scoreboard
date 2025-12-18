import { useEffect, useMemo, useState } from "react";
import "./App.css";

import {
  Crown,
  Clock3,
  History,
  RefreshCcw,
  Timer,
  Wand2,
  Check,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const STORAGE_KEY = "riichi-scoreboard-state-v1";

const PLAYER_LABELS = ["东风家", "南风家", "西风家", "北风家"] as const;

type SeatIndex = 0 | 1 | 2 | 3;

type RoundWind = "东" | "南";

type SettlementType = "tsumo" | "ron" | "draw";

interface HistoryEntry {
  id: string;
  type: SettlementType;
  roundLabel: string;
  dealerLabel: string;
  riichiCount: number;
  description: string;
  timestamp: string;
  // 当时四家的昵称快照（按东南西北顺序），旧记录可能不存在
  playerNames?: string[];
  // 当局宣告立直的玩家昵称快照（按东南西北顺序），旧记录可能不存在
  riichiPlayers?: string[];
  // 当局四家的点差变动（按东南西北顺序），旧记录可能不存在
  deltas?: number[];
}

// 仅包含可被撤销 / 重做的核心状态，不嵌套快照自身
interface CoreSnapshot {
  points: number[];
  kyotaku: number; // 场供立直棒数量
  honba: number;
  kyokuIndex: number; // 0-3: 东1-4, 4-7: 南1-4
  dealerIndex: SeatIndex;
  history: HistoryEntry[];
  // 当前四家的昵称（按东南西北顺序）
  names: string[];
}

interface LastSettlementMeta {
  type: SettlementType;
  summary: string;
  timestamp: string;
}

interface GameState {
  points: number[];
  kyotaku: number; // 场供立直棒数量
  honba: number;
  kyokuIndex: number; // 0-3: 东1-4, 4-7: 南1-4
  dealerIndex: SeatIndex;
  history: HistoryEntry[];
  // 当前四家的昵称（按东南西北顺序）
  names: string[];
  // 最近一次结算前后的快照，用于撤销 / 重做
  lastSettlementBefore: CoreSnapshot | null;
  lastSettlementAfter: CoreSnapshot | null;
  lastSettlementMeta: LastSettlementMeta | null;
  // 当前是否处于“撤销后”的状态，控制重做按钮可用性
  isInUndo: boolean;
}

function createDefaultNames(): string[] {
  return [...PLAYER_LABELS];
}

function sanitizeNames(input: unknown): string[] {
  if (!Array.isArray(input) || input.length !== 4) return createDefaultNames();
  return input.map((value, index) => {
    if (typeof value !== "string") return PLAYER_LABELS[index];
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : PLAYER_LABELS[index];
  });
}

function createInitialGameState(): GameState {
  return {
    points: [25000, 25000, 25000, 25000],
    kyotaku: 0,
    honba: 0,
    kyokuIndex: 0,
    dealerIndex: 0,
    history: [],
    names: createDefaultNames(),
    lastSettlementBefore: null,
    lastSettlementAfter: null,
    lastSettlementMeta: null,
    isInUndo: false,
  };
}

function createCoreSnapshotFromState(source: {
  points: number[];
  kyotaku: number;
  honba: number;
  kyokuIndex: number;
  dealerIndex: SeatIndex;
  history: HistoryEntry[];
  names: string[];
}): CoreSnapshot {
  return {
    points: [...source.points],
    kyotaku: source.kyotaku,
    honba: source.honba,
    kyokuIndex: source.kyokuIndex,
    dealerIndex: source.dealerIndex,
    history: [...source.history],
    names: [...source.names],
  };
}

function formatSettlementType(type: SettlementType): string {
  switch (type) {
    case "tsumo":
      return "自摸";
    case "ron":
      return "荣和";
    case "draw":
      return "流局";
    default:
      return "";
  }
}

function getRoundInfo(
  kyokuIndex: number,
  honba: number
): {
  wind: RoundWind;
  number: number;
  label: string;
} {
  const wind: RoundWind = kyokuIndex < 4 ? "东" : "南";
  const number = kyokuIndex < 4 ? kyokuIndex + 1 : kyokuIndex - 3;
  const label = `${wind}${number}局${honba}本场`;
  return { wind, number, label };
}

function formatPoints(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDiff(value: number): string {
  if (value === 0) return "0";
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatPoints(Math.abs(value))}`;
}

function roundUpToHundred(value: number): number {
  return Math.ceil(value / 100) * 100;
}

function calcBasePoints(han: number, fu: number): number {
  if (han >= 13) return 8000;
  if (han >= 11) return 6000;
  if (han >= 8) return 4000;
  if (han >= 6) return 3000;
  if (han >= 5) return 2000;

  // 满贯以下按公式 + 切上满贯
  let raw = fu * Math.pow(2, han + 2);

  // 切上满贯：30符4翻、60符3翻视为满贯
  if ((han === 4 && fu === 30) || (han === 3 && fu === 60)) {
    return 2000;
  }

  if (raw > 2000) {
    return 2000;
  }
  return raw;
}

function computePlayerRanks(points: number[]): number[] {
  const entries = points.map((score, index) => ({ index, score }));
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });

  const ranks = new Array(points.length).fill(0);
  let lastScore: number | null = null;
  let lastRank = 0;

  entries.forEach((entry, idx) => {
    if (lastScore !== null && entry.score === lastScore) {
      ranks[entry.index] = lastRank;
    } else {
      const rank = idx + 1;
      ranks[entry.index] = rank;
      lastRank = rank;
      lastScore = entry.score;
    }
  });

  return ranks;
}

function computeUma(points: number[], ranks: number[]): number[] {
  const uma = [35, 15, -5, -45];
  const sortedPlayers = points
    .map((p, i) => ({ p, r: ranks[i], i }))
    .sort((a, b) => a.r - b.r);

  const results = new Array(4).fill(0);
  sortedPlayers.forEach((player, i) => {
    results[player.i] = player.p / 1000 + uma[i];
  });

  return results;
}

interface SettlementPreview {
  deltas: number[];
  winnerIndex: SeatIndex | null;
  kyotakuBefore: number;
  kyotakuAfter: number;
  kyotakuIncome: number;
  riichiIncome: number;
}

/**
 * 预览自摸结算对四家点数与场供的影响
 */
function computeTsumoPreview(
  state: GameState,
  winner: SeatIndex | null,
  hanInput: string,
  fuInput: string,
  riichiFlags: boolean[]
): SettlementPreview | null {
  if (winner === null) return null;
  const han = parseInt(hanInput || "0", 10);
  const fu = parseInt(fuInput || "0", 10);
  if (!Number.isFinite(han) || han <= 0 || !Number.isFinite(fu) || fu <= 0) {
    return null;
  }

  const basePoints = calcBasePoints(han, fu);
  const deltas = [0, 0, 0, 0];
  const riichiIndices: SeatIndex[] = [];

  riichiFlags.forEach((v, idx) => {
    if (v) {
      const i = idx as SeatIndex;
      deltas[i] -= 1000;
      riichiIndices.push(i);
    }
  });

  const riichiCount = riichiIndices.length;
  const riichiIncome = riichiCount * 1000;
  const kyotakuPoints = state.kyotaku * 1000;

  const winnerIsDealer = winner === state.dealerIndex;
  let totalBaseFromOthers = 0;
  let totalHonbaFromOthers = 0;

  if (winnerIsDealer) {
    // 庄家自摸：其余三家各支付2倍基本点 + 本场
    state.points.forEach((_, idx) => {
      if (idx === winner) return;
      const rawBase = 2 * basePoints;
      const basePay = roundUpToHundred(rawBase);
      const honbaPay = state.honba * 100;
      const payment = basePay + honbaPay;
      deltas[idx] -= payment;
      totalBaseFromOthers += basePay;
      totalHonbaFromOthers += honbaPay;
    });
  } else {
    // 闲家自摸：庄家支付2倍基本点，另两闲家各支付1倍基本点
    state.points.forEach((_, idx) => {
      if (idx === winner) return;
      const isDealer = idx === state.dealerIndex;
      const rawBase = basePoints * (isDealer ? 2 : 1);
      const basePay = roundUpToHundred(rawBase);
      const honbaPay = state.honba * 100;
      const payment = basePay + honbaPay;
      deltas[idx] -= payment;
      totalBaseFromOthers += basePay;
      totalHonbaFromOthers += honbaPay;
    });
  }

  deltas[winner] += totalBaseFromOthers + totalHonbaFromOthers;
  deltas[winner] += kyotakuPoints + riichiIncome;

  return {
    deltas,
    winnerIndex: winner,
    kyotakuBefore: state.kyotaku,
    kyotakuAfter: 0,
    kyotakuIncome: kyotakuPoints,
    riichiIncome,
  };
}

/**
 * 预览荣和结算对四家点数与场供的影响
 */
function computeRonPreview(
  state: GameState,
  winner: SeatIndex | null,
  loser: SeatIndex | null,
  hanInput: string,
  fuInput: string,
  riichiFlags: boolean[]
): SettlementPreview | null {
  if (winner === null || loser === null || winner === loser) return null;
  const han = parseInt(hanInput || "0", 10);
  const fu = parseInt(fuInput || "0", 10);
  if (!Number.isFinite(han) || han <= 0 || !Number.isFinite(fu) || fu <= 0) {
    return null;
  }

  const basePoints = calcBasePoints(han, fu);
  const deltas = [0, 0, 0, 0];
  const riichiIndices: SeatIndex[] = [];

  riichiFlags.forEach((v, idx) => {
    if (v) {
      const i = idx as SeatIndex;
      deltas[i] -= 1000;
      riichiIndices.push(i);
    }
  });

  const riichiCount = riichiIndices.length;
  const riichiIncome = riichiCount * 1000;
  const kyotakuPoints = state.kyotaku * 1000;

  const winnerIsDealer = winner === state.dealerIndex;
  const multiplier = winnerIsDealer ? 6 : 4;
  const rawBase = multiplier * basePoints;
  const basePay = roundUpToHundred(rawBase);
  const honbaPay = state.honba * 300;
  const payment = basePay + honbaPay;

  deltas[loser] -= payment;
  deltas[winner] += payment + kyotakuPoints + riichiIncome;

  return {
    deltas,
    winnerIndex: winner,
    kyotakuBefore: state.kyotaku,
    kyotakuAfter: 0,
    kyotakuIncome: kyotakuPoints,
    riichiIncome,
  };
}

/**
 * 预览流局结算对四家点数与场供的影响
 */
function computeDrawPreview(
  state: GameState,
  tenpaiFlags: boolean[],
  riichiFlags: boolean[]
): SettlementPreview {
  const deltas = [0, 0, 0, 0];
  const riichiIndices: SeatIndex[] = [];

  riichiFlags.forEach((v, idx) => {
    if (v) {
      const i = idx as SeatIndex;
      deltas[i] -= 1000;
      riichiIndices.push(i);
    }
  });

  const riichiCount = riichiIndices.length;
  const riichiIncome = riichiCount * 1000;

  const tenpaiCount = tenpaiFlags.filter(Boolean).length;

  if (tenpaiCount === 1) {
    const tenpaiIndex = tenpaiFlags.findIndex(Boolean) as SeatIndex;
    state.points.forEach((_, idx) => {
      if (idx === tenpaiIndex) return;
      deltas[idx] -= 1000;
      deltas[tenpaiIndex] += 1000;
    });
  } else if (tenpaiCount === 2) {
    const tenpaiIndices = tenpaiFlags
      .map((v, idx) => (v ? (idx as SeatIndex) : null))
      .filter((v): v is SeatIndex => v !== null);
    const notTenpaiIndices = tenpaiFlags
      .map((v, idx) => (!v ? (idx as SeatIndex) : null))
      .filter((v): v is SeatIndex => v !== null);
    notTenpaiIndices.forEach((i) => {
      deltas[i] -= 1500;
    });
    tenpaiIndices.forEach((i) => {
      deltas[i] += 1500;
    });
  } else if (tenpaiCount === 3) {
    const notIndex = tenpaiFlags.findIndex((v) => !v) as SeatIndex;
    state.points.forEach((_, idx) => {
      if (idx === notIndex) return;
      deltas[notIndex] -= 1000;
      deltas[idx] += 1000;
    });
  }

  const newKyotaku = state.kyotaku + riichiCount;

  return {
    deltas,
    winnerIndex: null,
    kyotakuBefore: state.kyotaku,
    kyotakuAfter: newKyotaku,
    kyotakuIncome: 0,
    riichiIncome,
  };
}

function ensureSeatIndex(value: number): SeatIndex {
  return (value % 4) as SeatIndex;
}

function App() {
  const [state, setState] = useState<GameState>(() => createInitialGameState());
  const [sessionStart, setSessionStart] = useState(() => Date.now());
  const [now, setNow] = useState(() => new Date());

  // dialogs
  const [editRoundOpen, setEditRoundOpen] = useState(false);
  const [tsumoOpen, setTsumoOpen] = useState(false);
  const [ronOpen, setRonOpen] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [editNamesOpen, setEditNamesOpen] = useState(false);
  const [editNames, setEditNames] = useState<string[]>(() =>
    createDefaultNames()
  );
  const [resetAlsoNames, setResetAlsoNames] = useState(false);

  // 编辑场况
  const [editWind, setEditWind] = useState<RoundWind>("东");
  const [editNumber, setEditNumber] = useState<number>(1);
  const [editHonba, setEditHonba] = useState<number>(0);
  const [editDealer, setEditDealer] = useState<SeatIndex>(0);

  // 自摸
  const [tsumoWinner, setTsumoWinner] = useState<SeatIndex | null>(0);
  const [tsumoHan, setTsumoHan] = useState<string>("3");
  const [tsumoFu, setTsumoFu] = useState<string>("40");
  const [tsumoRiichi, setTsumoRiichi] = useState<boolean[]>([
    false,
    false,
    false,
    false,
  ]);

  // 荣和
  const [ronWinner, setRonWinner] = useState<SeatIndex | null>(0);
  const [ronLoser, setRonLoser] = useState<SeatIndex | null>(1);
  const [ronHan, setRonHan] = useState<string>("3");
  const [ronFu, setRonFu] = useState<string>("40");
  const [ronRiichi, setRonRiichi] = useState<boolean[]>([
    false,
    false,
    false,
    false,
  ]);

  // 流局
  const [drawTenpai, setDrawTenpai] = useState<boolean[]>([
    false,
    false,
    false,
    false,
  ]);
  const [drawRiichi, setDrawRiichi] = useState<boolean[]>([
    false,
    false,
    false,
    false,
  ]);

  // time
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // load from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as any;
      if (
        parsed &&
        Array.isArray(parsed.points) &&
        parsed.points.length === 4 &&
        typeof parsed.honba === "number" &&
        typeof parsed.kyokuIndex === "number" &&
        typeof parsed.dealerIndex === "number"
      ) {
        const baseState: GameState = {
          points: parsed.points,
          kyotaku: typeof parsed.kyotaku === "number" ? parsed.kyotaku : 0,
          honba: parsed.honba,
          kyokuIndex: parsed.kyokuIndex,
          dealerIndex: ensureSeatIndex(parsed.dealerIndex),
          history: Array.isArray(parsed.history) ? parsed.history : [],
          names: sanitizeNames(parsed.names),
          lastSettlementBefore: parsed.lastSettlementBefore ?? null,
          lastSettlementAfter: parsed.lastSettlementAfter ?? null,
          lastSettlementMeta: parsed.lastSettlementMeta ?? null,
          isInUndo: parsed.isInUndo ?? false,
        };
        setState(baseState);
      }
    } catch (e) {
      console.error("Failed to load scoreboard state", e);
    }
  }, []);

  // persist
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const roundInfo = getRoundInfo(state.kyokuIndex, state.honba);
  const totalPoints = state.points.reduce((sum, v) => sum + v, 0);
  const totalWithKyotaku = totalPoints + state.kyotaku * 1000;

  const beijingTime = useMemo(() => {
    try {
      return now.toLocaleTimeString("zh-CN", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "Asia/Shanghai",
      });
    } catch {
      return now.toLocaleTimeString("zh-CN", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
  }, [now]);

  const elapsedMinutes = Math.max(
    0,
    Math.floor((now.getTime() - sessionStart) / 60000)
  );

  const diffMatrix = useMemo(
    () =>
      state.points.map((score, i) =>
        state.points.map((other, j) => (i === j ? 0 : score - other))
      ),
    [state.points]
  );

  const playerRanks = useMemo(
    () => computePlayerRanks(state.points),
    [state.points]
  );

  const uma = useMemo(
    () => computeUma(state.points, playerRanks),
    [state.points, playerRanks]
  );

  const bestRank = useMemo(
    () => (playerRanks.length ? Math.min(...playerRanks) : 1),
    [playerRanks]
  );

  const worstRank = useMemo(
    () => (playerRanks.length ? Math.max(...playerRanks) : 1),
    [playerRanks]
  );

  const rankingList = useMemo(
    () =>
      state.points
        .map((score, index) => ({
          index,
          score,
          rank: playerRanks[index] ?? 0,
          name: state.names[index],
        }))
        .sort((a, b) => {
          if (a.rank !== b.rank) return a.rank - b.rank;
          return a.index - b.index;
        }),
    [state.points, state.names, playerRanks]
  );

  const tsumoPreview = useMemo(
    () =>
      computeTsumoPreview(state, tsumoWinner, tsumoHan, tsumoFu, tsumoRiichi),
    [state, tsumoWinner, tsumoHan, tsumoFu, tsumoRiichi]
  );

  const ronPreview = useMemo(
    () =>
      computeRonPreview(state, ronWinner, ronLoser, ronHan, ronFu, ronRiichi),
    [state, ronWinner, ronLoser, ronHan, ronFu, ronRiichi]
  );

  const drawPreview = useMemo(
    () => computeDrawPreview(state, drawTenpai, drawRiichi),
    [state, drawTenpai, drawRiichi]
  );

  const hasLastSettlement = Boolean(
    state.lastSettlementBefore &&
      state.lastSettlementAfter &&
      state.lastSettlementMeta
  );
  const canUndo = hasLastSettlement && !state.isInUndo;
  const canRedo = hasLastSettlement && state.isInUndo;

  function resetGame(resetNames: boolean) {
    setState((prev) => ({
      ...createInitialGameState(),
      // 默认保留昵称，除非显式要求重置
      names: resetNames ? createDefaultNames() : prev.names,
    }));
    setSessionStart(Date.now());
  }

  function buildHistoryEntry(
    type: SettlementType,
    description: string,
    riichiCount: number,
    riichiPlayers: string[],
    deltas: number[]
  ): HistoryEntry {
    const { label } = getRoundInfo(state.kyokuIndex, state.honba);
    const dealerLabel =
      state.names[state.dealerIndex] ?? PLAYER_LABELS[state.dealerIndex];
    return {
      id: `${Date.now()}-${state.history.length}`,
      type,
      roundLabel: label,
      dealerLabel,
      riichiCount,
      description,
      timestamp: new Date().toLocaleString("zh-CN", {
        hour12: false,
      }),
      playerNames: [...state.names],
      riichiPlayers: [...riichiPlayers],
      deltas: [...deltas],
    };
  }

  function applyDeltas(points: number[], deltas: number[]): number[] {
    return points.map((p, idx) => p + (deltas[idx] ?? 0));
  }

  function handleEditRoundConfirm() {
    const kyokuIndex = editWind === "东" ? editNumber - 1 : 3 + editNumber;
    setState((prev) => ({
      ...prev,
      honba: Math.max(0, editHonba),
      kyokuIndex: kyokuIndex,
      dealerIndex: editDealer,
    }));
    setEditRoundOpen(false);
  }

  function handleUndoLastSettlement() {
    setState((prev) => {
      if (
        !prev.lastSettlementBefore ||
        !prev.lastSettlementAfter ||
        !prev.lastSettlementMeta
      ) {
        return prev;
      }

      const snapshot = prev.lastSettlementBefore;

      return {
        ...prev,
        points: [...snapshot.points],
        kyotaku: snapshot.kyotaku,
        honba: snapshot.honba,
        kyokuIndex: snapshot.kyokuIndex,
        dealerIndex: snapshot.dealerIndex,
        history: [...snapshot.history],
        names: [...snapshot.names],
        isInUndo: true,
      };
    });
  }

  function handleRedoLastSettlement() {
    setState((prev) => {
      if (
        !prev.lastSettlementBefore ||
        !prev.lastSettlementAfter ||
        !prev.lastSettlementMeta
      ) {
        return prev;
      }
      if (!prev.isInUndo) {
        return prev;
      }

      const snapshot = prev.lastSettlementAfter;

      return {
        ...prev,
        points: [...snapshot.points],
        kyotaku: snapshot.kyotaku,
        honba: snapshot.honba,
        kyokuIndex: snapshot.kyokuIndex,
        dealerIndex: snapshot.dealerIndex,
        history: [...snapshot.history],
        names: [...snapshot.names],
        isInUndo: false,
      };
    });
  }

  function handleTsumoConfirm(): boolean {
    if (tsumoWinner === null) return false;
    const han = parseInt(tsumoHan || "0", 10);
    const fu = parseInt(tsumoFu || "0", 10);
    if (!Number.isFinite(han) || han <= 0 || !Number.isFinite(fu) || fu <= 0) {
      window.alert("请填写合法的番数和符数");
      return false;
    }

    setState((prev) => {
      const winner = tsumoWinner as SeatIndex;
      const beforeSnapshot = createCoreSnapshotFromState(prev);
      const winnerName = prev.names[winner] ?? PLAYER_LABELS[winner];
      const dealerName =
        prev.names[prev.dealerIndex] ?? PLAYER_LABELS[prev.dealerIndex];
      const basePoints = calcBasePoints(han, fu);
      const deltas = [0, 0, 0, 0];
      const riichiIndices: SeatIndex[] = [];

      tsumoRiichi.forEach((v, idx) => {
        if (v) {
          const i = idx as SeatIndex;
          deltas[i] -= 1000;
          riichiIndices.push(i);
        }
      });

      const riichiCount = riichiIndices.length;
      const riichiIncome = riichiCount * 1000;
      const kyotakuPoints = prev.kyotaku * 1000;
      const riichiPlayers = riichiIndices.map(
        (i) => prev.names[i] ?? PLAYER_LABELS[i]
      );

      const winnerIsDealer = winner === prev.dealerIndex;
      let totalBaseFromOthers = 0;
      let totalHonbaFromOthers = 0;

      if (winnerIsDealer) {
        // 庄家自摸：其余三家各支付2倍基本点 + 本场
        prev.points.forEach((_, idx) => {
          if (idx === winner) return;
          const rawBase = 2 * basePoints;
          const basePay = roundUpToHundred(rawBase);
          const honbaPay = prev.honba * 100;
          const payment = basePay + honbaPay;
          deltas[idx] -= payment;
          totalBaseFromOthers += basePay;
          totalHonbaFromOthers += honbaPay;
        });
      } else {
        // 闲家自摸：庄家支付2倍基本点，另两闲家各支付1倍基本点
        prev.points.forEach((_, idx) => {
          if (idx === winner) return;
          const isDealer = idx === prev.dealerIndex;
          const rawBase = basePoints * (isDealer ? 2 : 1);
          const basePay = roundUpToHundred(rawBase);
          const honbaPay = prev.honba * 100;
          const payment = basePay + honbaPay;
          deltas[idx] -= payment;
          totalBaseFromOthers += basePay;
          totalHonbaFromOthers += honbaPay;
        });
      }

      deltas[winner] += totalBaseFromOthers + totalHonbaFromOthers;
      deltas[winner] += kyotakuPoints + riichiIncome;

      const newPoints = applyDeltas(prev.points, deltas);

      const winnerGain = deltas[winner];

      let description = "";
      if (winnerIsDealer) {
        const perBaseRaw = 2 * basePoints;
        const perBasePay = roundUpToHundred(perBaseRaw);
        const perHonba = prev.honba * 100;
        description = `庄家自摸${han}番${fu}符，闲家各支付${formatPoints(
          perBasePay + perHonba
        )}点（其中${formatPoints(perHonba)}点为本场），场供${formatPoints(
          kyotakuPoints
        )}点，立直棒收入${formatPoints(riichiIncome)}点，共收入${formatPoints(
          winnerGain
        )}点。`;
      } else {
        const dealerBaseRaw = 2 * basePoints;
        const dealerBasePay = roundUpToHundred(dealerBaseRaw);
        const dealerHonba = prev.honba * 100;
        const othersBaseRaw = basePoints;
        const othersBasePay = roundUpToHundred(othersBaseRaw);
        const othersHonba = prev.honba * 100;
        description = `${winnerName}自摸${han}番${fu}符，庄家${dealerName}支付${formatPoints(
          dealerBasePay + dealerHonba
        )}点（其中${formatPoints(
          dealerHonba
        )}点为本场），其余闲家支付${formatPoints(
          othersBasePay + othersHonba
        )}点（其中${formatPoints(othersHonba)}点为本场），场供${formatPoints(
          kyotakuPoints
        )}点，立直棒收入${formatPoints(riichiIncome)}点，共收入${formatPoints(
          winnerGain
        )}点。`;
      }

      const entry = buildHistoryEntry(
        "tsumo",
        description,
        riichiCount,
        riichiPlayers,
        deltas
      );

      // 连庄/轮庄 + 本场
      const winnerIsDealerNow = winner === prev.dealerIndex;
      let nextDealer = prev.dealerIndex;
      let nextHonba = prev.honba;
      let nextKyoku = prev.kyokuIndex;

      if (winnerIsDealerNow) {
        nextHonba = prev.honba + 1;
      } else {
        nextDealer = ensureSeatIndex(prev.dealerIndex + 1);
        nextHonba = 0;
        nextKyoku = (prev.kyokuIndex + 1) % 8;
      }

      const afterSnapshot: CoreSnapshot = {
        points: newPoints,
        kyotaku: 0,
        honba: nextHonba,
        kyokuIndex: nextKyoku,
        dealerIndex: nextDealer,
        history: [entry, ...prev.history],
        names: prev.names,
      };

      const meta: LastSettlementMeta = {
        type: "tsumo",
        summary: `${winnerName}自摸（${entry.roundLabel}）`,
        timestamp: entry.timestamp,
      };

      return {
        ...prev,
        ...afterSnapshot,
        lastSettlementBefore: beforeSnapshot,
        lastSettlementAfter: afterSnapshot,
        lastSettlementMeta: meta,
        isInUndo: false,
      };
    });

    return true;
  }

  function handleRonConfirm(): boolean {
    if (ronWinner === null || ronLoser === null) return false;
    if (ronWinner === ronLoser) {
      window.alert("和牌家与点炮家不能是同一家");
      return false;
    }
    const han = parseInt(ronHan || "0", 10);
    const fu = parseInt(ronFu || "0", 10);
    if (!Number.isFinite(han) || han <= 0 || !Number.isFinite(fu) || fu <= 0) {
      window.alert("请填写合法的番数和符数");
      return false;
    }

    setState((prev) => {
      const winner = ronWinner as SeatIndex;
      const loser = ronLoser as SeatIndex;
      const beforeSnapshot = createCoreSnapshotFromState(prev);
      const basePoints = calcBasePoints(han, fu);
      const deltas = [0, 0, 0, 0];
      const riichiIndices: SeatIndex[] = [];

      ronRiichi.forEach((v, idx) => {
        if (v) {
          const i = idx as SeatIndex;
          deltas[i] -= 1000;
          riichiIndices.push(i);
        }
      });

      const riichiCount = riichiIndices.length;
      const riichiIncome = riichiCount * 1000;
      const kyotakuPoints = prev.kyotaku * 1000;
      const riichiPlayers = riichiIndices.map(
        (i) => prev.names[i] ?? PLAYER_LABELS[i]
      );

      const winnerIsDealer = winner === prev.dealerIndex;
      const multiplier = winnerIsDealer ? 6 : 4;
      const rawBase = multiplier * basePoints;
      const basePay = roundUpToHundred(rawBase);
      const honbaPay = prev.honba * 300;
      const payment = basePay + honbaPay;

      deltas[loser] -= payment;
      deltas[winner] += payment + kyotakuPoints + riichiIncome;

      const newPoints = applyDeltas(prev.points, deltas);
      const winnerGain = deltas[winner];

      const winnerName = prev.names[winner] ?? PLAYER_LABELS[winner];
      const loserName = prev.names[loser] ?? PLAYER_LABELS[loser];
      let description = "";
      if (winnerIsDealer) {
        description = `庄家${winnerName}荣和${loserName}${han}番${fu}符，共${formatPoints(
          payment
        )}点（其中${formatPoints(honbaPay)}点为本场），场供${formatPoints(
          kyotakuPoints
        )}点，立直棒收入${formatPoints(riichiIncome)}点，共收入${formatPoints(
          winnerGain
        )}点。`;
      } else {
        description = `${winnerName}荣和${loserName}${han}番${fu}符，共${formatPoints(
          payment
        )}点（其中${formatPoints(honbaPay)}点为本场），场供${formatPoints(
          kyotakuPoints
        )}点，立直棒收入${formatPoints(riichiIncome)}点，共收入${formatPoints(
          winnerGain
        )}点。`;
      }

      const entry = buildHistoryEntry(
        "ron",
        description,
        riichiCount,
        riichiPlayers,
        deltas
      );

      const winnerIsDealerNow = winner === prev.dealerIndex;
      let nextDealer = prev.dealerIndex;
      let nextHonba = prev.honba;
      let nextKyoku = prev.kyokuIndex;

      if (winnerIsDealerNow) {
        nextHonba = prev.honba + 1;
      } else {
        nextDealer = ensureSeatIndex(prev.dealerIndex + 1);
        nextHonba = 0;
        nextKyoku = (prev.kyokuIndex + 1) % 8;
      }

      const afterSnapshot: CoreSnapshot = {
        points: newPoints,
        kyotaku: 0,
        honba: nextHonba,
        kyokuIndex: nextKyoku,
        dealerIndex: nextDealer,
        history: [entry, ...prev.history],
        names: prev.names,
      };

      const meta: LastSettlementMeta = {
        type: "ron",
        summary: `${winnerName}荣和${loserName}（${entry.roundLabel}）`,
        timestamp: entry.timestamp,
      };

      return {
        ...prev,
        ...afterSnapshot,
        lastSettlementBefore: beforeSnapshot,
        lastSettlementAfter: afterSnapshot,
        lastSettlementMeta: meta,
        isInUndo: false,
      };
    });

    return true;
  }

  function handleDrawConfirm(): boolean {
    const anyTenpai = drawTenpai.some(Boolean);
    const tenpaiCount = drawTenpai.filter(Boolean).length;

    setState((prev) => {
      const beforeSnapshot = createCoreSnapshotFromState(prev);
      const deltas = [0, 0, 0, 0];
      const riichiIndices: SeatIndex[] = [];

      drawRiichi.forEach((v, idx) => {
        if (v) {
          const i = idx as SeatIndex;
          deltas[i] -= 1000;
          riichiIndices.push(i);
        }
      });

      const riichiCount = riichiIndices.length;
      const riichiIncome = riichiCount * 1000;
      const riichiPlayers = riichiIndices.map(
        (i) => prev.names[i] ?? PLAYER_LABELS[i]
      );

      if (tenpaiCount === 1) {
        const tenpaiIndex = drawTenpai.findIndex(Boolean) as SeatIndex;
        prev.points.forEach((_, idx) => {
          if (idx === tenpaiIndex) return;
          deltas[idx] -= 1000;
          deltas[tenpaiIndex] += 1000;
        });
      } else if (tenpaiCount === 2) {
        const tenpaiIndices = drawTenpai
          .map((v, idx) => (v ? (idx as SeatIndex) : null))
          .filter((v): v is SeatIndex => v !== null);
        const notTenpaiIndices = drawTenpai
          .map((v, idx) => (!v ? (idx as SeatIndex) : null))
          .filter((v): v is SeatIndex => v !== null);
        notTenpaiIndices.forEach((i) => {
          deltas[i] -= 1500;
        });
        tenpaiIndices.forEach((i) => {
          deltas[i] += 1500;
        });
      } else if (tenpaiCount === 3) {
        const notIndex = drawTenpai.findIndex((v) => !v) as SeatIndex;
        prev.points.forEach((_, idx) => {
          if (idx === notIndex) return;
          deltas[notIndex] -= 1000;
          deltas[idx] += 1000;
        });
      }

      const newPoints = applyDeltas(prev.points, deltas);
      const newKyotaku = prev.kyotaku + riichiCount;

      const tenpaiNames =
        prev.names.filter((_, idx) => drawTenpai[idx]).join("、") || "无";
      const notenNames =
        prev.names.filter((_, idx) => !drawTenpai[idx]).join("、") || "无";

      const description = `流局，本局立直棒计入场供${formatPoints(
        riichiIncome
      )}点，听牌：${tenpaiNames}，未听牌：${notenNames}。`;

      const entry = buildHistoryEntry(
        "draw",
        description,
        riichiCount,
        riichiPlayers,
        deltas
      );

      const dealerTenpai = drawTenpai[prev.dealerIndex];

      let nextDealer = prev.dealerIndex;
      let nextHonba = prev.honba + 1;
      let nextKyoku = prev.kyokuIndex;

      if (!dealerTenpai) {
        nextDealer = ensureSeatIndex(prev.dealerIndex + 1);
        nextKyoku = (prev.kyokuIndex + 1) % 8;
      }

      const afterSnapshot: CoreSnapshot = {
        points: newPoints,
        kyotaku: newKyotaku,
        honba: nextHonba,
        kyokuIndex: nextKyoku,
        dealerIndex: nextDealer,
        history: [entry, ...prev.history],
        names: prev.names,
      };

      const meta: LastSettlementMeta = {
        type: "draw",
        summary: `流局（${entry.roundLabel}）`,
        timestamp: entry.timestamp,
      };

      return {
        ...prev,
        ...afterSnapshot,
        lastSettlementBefore: beforeSnapshot,
        lastSettlementAfter: afterSnapshot,
        lastSettlementMeta: meta,
        isInUndo: false,
      };
    });

    if (!anyTenpai && !drawRiichi.some(Boolean)) {
      // 完全空白流局也可以，只是不做额外提示
    }

    return true;
  }

  // 打开编辑场况时同步当前状态
  useEffect(() => {
    if (!editRoundOpen) return;
    const info = getRoundInfo(state.kyokuIndex, state.honba);
    setEditWind(info.wind);
    setEditNumber(info.number);
    setEditHonba(state.honba);
    setEditDealer(state.dealerIndex);
  }, [editRoundOpen, state.kyokuIndex, state.honba, state.dealerIndex]);

  // 打开编辑昵称时同步当前名称
  useEffect(() => {
    if (!editNamesOpen) return;
    setEditNames(state.names);
  }, [editNamesOpen, state.names]);

  return (
    <TooltipProvider>
      <div className="app-bg min-h-screen w-full px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 rounded-3xl border border-white/70 bg-white/70 p-5 shadow-xl shadow-amber-100/60 backdrop-blur-md md:p-8">
          {/* Header */}
          <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
                <Crown className="h-4 w-4" />
                <span>立直麻将计分板</span>
                <span className="hidden text-[11px] text-amber-700/80 sm:inline">
                  半庄 · 东南战 · 面麻专用
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
                <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 shadow-sm shadow-slate-100">
                  <span className="text-xs text-slate-500">场次</span>
                  <span className="font-semibold tracking-tight">
                    {roundInfo.label}
                  </span>
                  <Badge
                    variant="outline"
                    className="ml-2 border-amber-200 bg-amber-50 text-[11px] text-amber-800"
                  >
                    庄家：{state.names[state.dealerIndex]}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 shadow-sm shadow-slate-100">
                  <span className="text-xs text-slate-500">场供</span>
                  <span className="font-semibold tabular-nums">
                    {formatPoints(state.kyotaku * 1000)}
                  </span>
                  <span className="text-xs text-slate-500">点</span>
                  <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                    {state.kyotaku} 棒
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 shadow-sm shadow-slate-100">
                <Clock3 className="h-4 w-4 text-sky-500" />
                <div>
                  <div className="text-xs text-slate-500">北京时间</div>
                  <div className="font-semibold tabular-nums tracking-tight">
                    {beijingTime}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 shadow-sm shadow-slate-100">
                <Timer className="h-4 w-4 text-emerald-500" />
                <div>
                  <div className="text-xs text-slate-500">持续时间</div>
                  <div className="font-semibold tabular-nums tracking-tight">
                    {elapsedMinutes} 分钟
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2 shadow-sm shadow-slate-100">
                <History className="h-4 w-4 text-slate-500" />
                <div>
                  <div className="text-xs text-slate-500">总点数（含场供）</div>
                  <div className="font-semibold tabular-nums tracking-tight">
                    {formatPoints(totalWithKyotaku)} / 100,000
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Middle: points & diff */}
          <section className="grid gap-5 lg:grid-cols-[2fr,3fr]">
            <Card className="border-none bg-white/80 shadow-md shadow-slate-200/70">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold text-slate-700">
                    四家点数
                  </CardTitle>
                  <Dialog open={editNamesOpen} onOpenChange={setEditNamesOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                      >
                        编辑昵称
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>编辑四家昵称</DialogTitle>
                        <DialogDescription>
                          为东南西北四家设置便于识别的昵称，保存后将应用于当前局面与后续历史记录。
                        </DialogDescription>
                      </DialogHeader>
                      <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                        {PLAYER_LABELS.map((label, idx) => (
                          <div key={idx}>
                            <Label className="text-xs">{label}</Label>
                            <Input
                              className="mt-1 h-8 text-xs"
                              value={editNames[idx] ?? ""}
                              onChange={(e) => {
                                const next = [...editNames];
                                next[idx] = e.target.value;
                                setEditNames(next);
                              }}
                              placeholder={label}
                            />
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-[11px] text-slate-500">
                        昵称会保存在本地浏览器。重置游戏时默认保留昵称，便于连续面麻。
                      </p>
                      <DialogFooter className="mt-4 flex flex-row justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs"
                          onClick={() => setEditNamesOpen(false)}
                        >
                          取消
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 px-3 text-xs"
                          onClick={() => {
                            setState((prev) => ({
                              ...prev,
                              names: sanitizeNames(editNames),
                            }));
                            setEditNamesOpen(false);
                          }}
                        >
                          保存昵称
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                <span className="text-xs text-slate-400">单位：点</span>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {state.points.map((score, idx) => {
                    const isDealer = idx === state.dealerIndex;
                    const rank = playerRanks[idx] ?? 0;
                    const isBest = rank === bestRank;
                    const isWorst = rank === worstRank;
                    const rankBadgeClass =
                      rank === 0
                        ? "border-slate-200 bg-slate-50 text-slate-500"
                        : isBest
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : isWorst
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-slate-200 bg-slate-50 text-slate-600";

                    return (
                      <div
                        key={idx}
                        className={`relative overflow-hidden rounded-2xl border px-3 py-3 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                          isDealer
                            ? "border-amber-300 bg-amber-50/80 shadow-amber-100"
                            : "border-slate-200 bg-white/70"
                        }`}
                      >
                        {isDealer && (
                          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500" />
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs text-slate-500">
                              {state.names[idx]}
                            </div>
                            <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
                              {formatPoints(score)}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {isDealer && (
                              <Badge className="flex items-center gap-1 rounded-full bg-amber-500 text-[11px] font-semibold text-white shadow-sm">
                                <Crown className="h-3 w-3" />
                                庄家
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${rankBadgeClass}`}
                            >
                              {rank ? `第 ${rank} 名` : "排名计算中"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* <div className="mt-3 rounded-xl bg-slate-50/80 px-3 py-2 text-[11px] text-slate-600">
                <span className="font-medium">当前排名：</span>
                {rankingList.map((item, index) => (
                  <span key={item.index}>
                    {index > 0 && (
                      <span className="mx-1 text-slate-400">/</span>
                    )}
                    <span>
                      第{item.rank} {item.name}（{formatPoints(item.score)}）
                    </span>
                  </span>
                ))}
              </div> */}
              </CardContent>
            </Card>

            <Card className="border-none bg-white/80 shadow-md shadow-slate-200/70">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-sm font-semibold text-slate-700">
                  分差矩阵
                </CardTitle>
                <span className="text-xs text-slate-400">
                  正为领先，负为落后
                </span>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20 text-xs text-slate-500">
                        对比
                      </TableHead>
                      {state.names.map((name, idx) => (
                        <TableHead
                          key={idx}
                          className="text-center text-xs text-slate-500"
                        >
                          {name}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diffMatrix.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium text-slate-600">
                          {state.names[i]}
                        </TableCell>
                        {row.map((diff, j) => (
                          <TableCell
                            key={j}
                            className={`text-center text-xs tabular-nums ${
                              i === j
                                ? "text-slate-400"
                                : diff > 0
                                ? "text-emerald-600"
                                : diff < 0
                                ? "text-rose-600"
                                : "text-slate-400"
                            }`}
                          >
                            {i === j ? "—" : formatDiff(diff)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          {/* Bottom: history & controls */}
          <section className="grid gap-5 lg:grid-cols-[3fr,1fr]">
            <Card className="border-none bg-white/80 shadow-md shadow-slate-200/70">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="text-sm font-semibold text-slate-700">
                  历史记录
                </CardTitle>
                <span className="text-xs text-slate-400">
                  记录每一局的场次、庄家、立直玩家、点差变动与结算详情
                </span>
              </CardHeader>
              <CardContent className="pt-0">
                {state.history.length === 0 ? (
                  <div className="flex h-32 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 text-xs text-slate-500">
                    暂无记录，请通过下方操作栏录入对局结算。
                  </div>
                ) : (
                  <div className="max-h-80 space-y-2 overflow-y-auto pr-2 text-xs">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-28 text-xs text-slate-500">
                            场次
                          </TableHead>
                          <TableHead className="w-16 text-xs text-slate-500">
                            庄家
                          </TableHead>
                          <TableHead className="w-28 text-xs text-slate-500">
                            立直玩家
                          </TableHead>
                          <TableHead className="w-40 text-xs text-slate-500">
                            点差变动
                          </TableHead>
                          <TableHead className="text-xs text-slate-500">
                            结算信息
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {state.history.map((h) => {
                          const namesSnapshot =
                            Array.isArray(h.playerNames) &&
                            h.playerNames.length === 4
                              ? h.playerNames
                              : state.names;
                          const riichiPlayers = Array.isArray(h.riichiPlayers)
                            ? h.riichiPlayers
                            : undefined;
                          let riichiLabel = "无";
                          if (riichiPlayers && riichiPlayers.length > 0) {
                            riichiLabel = riichiPlayers.join("、");
                          } else if (
                            typeof h.riichiCount === "number" &&
                            h.riichiCount > 0
                          ) {
                            riichiLabel = `${h.riichiCount} 人`;
                          }
                          const deltas = Array.isArray(h.deltas)
                            ? h.deltas
                            : undefined;
                          const hasDeltas = !!(deltas && deltas.length === 4);
                          return (
                            <TableRow key={h.id}>
                              <TableCell className="align-top text-xs text-slate-700">
                                <div>{h.roundLabel}</div>
                                <div className="mt-0.5 text-[11px] text-slate-400">
                                  {h.timestamp}
                                </div>
                              </TableCell>
                              <TableCell className="align-top text-xs text-slate-700">
                                {h.dealerLabel}
                              </TableCell>
                              <TableCell className="align-top text-xs text-slate-700">
                                {riichiLabel}
                              </TableCell>
                              <TableCell className="align-top text-xs text-slate-700">
                                {hasDeltas ? (
                                  <div className="grid grid-cols-2 gap-1">
                                    {namesSnapshot.map((name, idx) => {
                                      const delta = deltas![idx] ?? 0;
                                      const cls =
                                        delta > 0
                                          ? "text-emerald-600"
                                          : delta < 0
                                          ? "text-rose-600"
                                          : "text-slate-400";
                                      return (
                                        <div
                                          key={idx}
                                          className="rounded-md bg-slate-50/80 px-2 py-1"
                                        >
                                          <div className="truncate text-[11px] text-slate-600">
                                            {name}
                                          </div>
                                          <div
                                            className={`text-[11px] font-semibold tabular-nums ${cls}`}
                                          >
                                            {delta === 0
                                              ? "0"
                                              : formatDiff(delta)}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400">
                                    —
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="align-top text-xs leading-relaxed text-slate-700">
                                {h.description}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-none bg-white/80 shadow-md shadow-slate-200/70">
              <CardHeader className="space-y-2 pb-4">
                <CardTitle className="flex items-center justify-between text-sm font-semibold text-slate-700">
                  <span>操作栏</span>
                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Wand2 className="h-3 w-3" />
                    调整比赛进程或录入结算
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0 text-xs">
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold tracking-wide text-slate-500">
                    比赛进程
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Dialog
                      open={editRoundOpen}
                      onOpenChange={setEditRoundOpen}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs"
                        >
                          调整场况
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>调整场况</DialogTitle>
                          <DialogDescription>
                            手动修正当前场次、庄家与本场数，点数不发生变化。
                          </DialogDescription>
                        </DialogHeader>
                        <div className="mt-2 space-y-4 text-xs">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">场风</Label>
                              <Select
                                value={editWind}
                                onValueChange={(v) =>
                                  setEditWind(v as RoundWind)
                                }
                              >
                                <SelectTrigger className="mt-1 h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="东">东风场</SelectItem>
                                  <SelectItem value="南">南风场</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs">局数</Label>
                              <Input
                                className="mt-1 h-8 text-xs"
                                type="number"
                                min={1}
                                max={4}
                                value={editNumber}
                                onChange={(e) =>
                                  setEditNumber(
                                    Math.min(
                                      4,
                                      Math.max(1, Number(e.target.value) || 1)
                                    )
                                  )
                                }
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">本场数</Label>
                              <Input
                                className="mt-1 h-8 text-xs"
                                type="number"
                                min={0}
                                value={editHonba}
                                onChange={(e) =>
                                  setEditHonba(
                                    Math.max(0, Number(e.target.value) || 0)
                                  )
                                }
                              />
                            </div>
                            <div>
                              <Label className="text-xs">庄家</Label>
                              <Select
                                value={String(editDealer)}
                                onValueChange={(v) =>
                                  setEditDealer(Number(v) as SeatIndex)
                                }
                              >
                                <SelectTrigger className="mt-1 h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {state.names.map((name, idx) => (
                                    <SelectItem key={idx} value={String(idx)}>
                                      {name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                        <DialogFooter className="mt-4 flex flex-row justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={() => setEditRoundOpen(false)}
                          >
                            取消
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={handleEditRoundConfirm}
                          >
                            确认
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs text-rose-600 hover:bg-rose-50"
                        >
                          <RefreshCcw className="mr-1 h-3 w-3" />
                          重置游戏
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="max-w-sm">
                        <AlertDialogHeader>
                          <AlertDialogTitle>确认重置游戏？</AlertDialogTitle>
                          <AlertDialogDescription>
                            此操作会将四家点数、场次、本场数、场供与历史记录全部重置为初始状态。默认保留当前昵称。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="mt-3 rounded-lg bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
                          <label className="flex items-center gap-2">
                            <Checkbox
                              checked={resetAlsoNames}
                              onCheckedChange={(v) =>
                                setResetAlsoNames(Boolean(v))
                              }
                            />
                            <span>
                              同时将四家昵称重置为默认（东风家 / 南风家 / 西风家
                              / 北风家）
                            </span>
                          </label>
                          <p className="mt-2 text-[11px] text-slate-500">
                            若不勾选，仅重置点数与对局记录，保留当前昵称，方便继续面麻。
                          </p>
                        </div>
                        <AlertDialogFooter className="mt-4">
                          <AlertDialogCancel
                            className="h-8 px-3 text-xs"
                            onClick={() => setResetAlsoNames(false)}
                          >
                            取消
                          </AlertDialogCancel>
                          <AlertDialogAction
                            className="h-8 px-3 text-xs bg-rose-500 hover:bg-rose-600"
                            onClick={() => {
                              resetGame(resetAlsoNames);
                              setResetAlsoNames(false);
                            }}
                          >
                            确认重置
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          className="h-8 px-3 text-xs bg-emerald-500 hover:bg-emerald-600 text-white"
                        >
                          <Check className="mr-1 h-3 w-3" />
                          终局结算
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-[60vw]">
                        <div className="flex gap-10 shrink-0">
                          <div>
                            <DialogHeader>
                              <DialogTitle>终局结算</DialogTitle>
                              <DialogDescription className="whitespace-nowrap">
                                第一名+35，第二名+15，第三名-5，第四名-45
                              </DialogDescription>
                            </DialogHeader>
                            <div className="pt-4 pb-2">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>排名</TableHead>
                                    <TableHead>玩家</TableHead>
                                    <TableHead>分数</TableHead>
                                    <TableHead>马点</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {rankingList.map((player) => (
                                    <TableRow
                                      key={player.index}
                                      className={`${
                                        player.rank === 1
                                          ? "bg-emerald-50/50"
                                          : player.rank === 4
                                          ? "bg-rose-50/50"
                                          : ""
                                      }`}
                                    >
                                      <TableCell>{player.rank}</TableCell>
                                      <TableCell>{player.name}</TableCell>
                                      <TableCell>{player.score}</TableCell>
                                      <TableCell>{uma[player.index]}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                            <div className="text-xs text-slate-500 flex gap-4 flex-nowrap">
                              <p className="whitespace-nowrap">
                                持续时间：{elapsedMinutes} 分钟
                              </p>
                              <p className="whitespace-nowrap">
                                结束时间：{beijingTime}
                              </p>
                            </div>
                            <div></div>
                          </div>
                          <div>
                            <div className="max-h-[80vh] overflow-y-auto pr-2 text-xs">
                              <div className="flex flex-wrap gap-2">
                                {state.history.map((h) => (
                                  <div
                                    key={h.id}
                                    className="flex flex-grow basis-80 gap-3 rounded-lg border border-slate-200 bg-white/70 p-3"
                                  >
                                    <div className="w-24 flex-shrink-0">
                                      <div>{h.roundLabel}</div>
                                      <div className="mt-0.5 text-[11px] text-slate-400">
                                        {h.timestamp}
                                      </div>
                                    </div>
                                    <div className="grid flex-grow grid-cols-2 gap-1">
                                      {(h.deltas ?? []).map((d, i) => (
                                        <div
                                          key={i}
                                          className="rounded-md bg-slate-50/80 px-2 py-1"
                                        >
                                          <div className="truncate text-[11px] text-slate-600">
                                            {state.names[i]}
                                          </div>
                                          <div
                                            className={`text-[11px] font-semibold tabular-nums ${
                                              d > 0
                                                ? "text-emerald-600"
                                                : d < 0
                                                ? "text-rose-600"
                                                : "text-slate-400"
                                            }`}
                                          >
                                            {formatDiff(d)}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

                <div className="space-y-2">
                  <div className="text-[11px] font-semibold tracking-wide text-slate-500">
                    结算信息
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* 流局 */}
                    <Dialog open={drawOpen} onOpenChange={setDrawOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs"
                        >
                          流局
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>流局结算</DialogTitle>
                          <DialogDescription>
                            选择听牌家与当局立直情况，系统会自动按照 3,000
                            点规则结算并累加场供。
                          </DialogDescription>
                        </DialogHeader>
                        <div className="mt-2 space-y-4 text-xs">
                          <div>
                            <div className="mb-1 text-[11px] font-medium text-slate-600">
                              听牌情况
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {state.names.map((name, idx) => (
                                <label
                                  key={idx}
                                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5 text-xs text-slate-700"
                                >
                                  <Checkbox
                                    checked={drawTenpai[idx]}
                                    onCheckedChange={(v) => {
                                      const next = [...drawTenpai];
                                      next[idx] = Boolean(v);
                                      setDrawTenpai(next);
                                    }}
                                  />
                                  <span>{name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 text-[11px] font-medium text-slate-600">
                              当局立直情况
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {state.names.map((name, idx) => (
                                <label
                                  key={idx}
                                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5 text-xs text-slate-700"
                                >
                                  <Checkbox
                                    checked={drawRiichi[idx]}
                                    onCheckedChange={(v) => {
                                      const next = [...drawRiichi];
                                      next[idx] = Boolean(v);
                                      setDrawRiichi(next);
                                    }}
                                  />
                                  <span>{name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 rounded-lg bg-slate-50/80 px-3 py-2">
                          <div className="mb-1 text-[11px] font-medium text-slate-600">
                            结算预览
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {state.names.map((name, idx) => {
                              const delta = drawPreview.deltas[idx] ?? 0;
                              const cls =
                                delta > 0
                                  ? "text-emerald-600"
                                  : delta < 0
                                  ? "text-rose-600"
                                  : "text-slate-400";
                              return (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between rounded-md bg-white/70 px-2 py-1"
                                >
                                  <span className="text-[11px] text-slate-600">
                                    {name}
                                  </span>
                                  <span
                                    className={`text-xs font-semibold tabular-nums ${cls}`}
                                  >
                                    {delta === 0 ? "0" : formatDiff(delta)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            场供：
                            {formatPoints(
                              drawPreview.kyotakuBefore * 1000
                            )} → {formatPoints(drawPreview.kyotakuAfter * 1000)}{" "}
                            点
                            {drawPreview.riichiIncome > 0 && (
                              <span className="ml-1">
                                （本局立直棒计入场供{" "}
                                {formatPoints(drawPreview.riichiIncome)} 点）
                              </span>
                            )}
                          </div>
                        </div>
                        <DialogFooter className="mt-4 flex flex-row justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={() => setDrawOpen(false)}
                          >
                            取消
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={() => {
                              const ok = handleDrawConfirm();
                              if (ok) {
                                setDrawOpen(false);
                              }
                            }}
                          >
                            确认流局
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* 自摸 */}
                    <Dialog open={tsumoOpen} onOpenChange={setTsumoOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs"
                        >
                          自摸
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>自摸结算</DialogTitle>
                          <DialogDescription>
                            选择自摸家、番数与符数，并标记当局立直情况，系统自动计算自摸支付与本场加成。
                          </DialogDescription>
                        </DialogHeader>
                        <div className="mt-2 space-y-4 text-xs">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">自摸家</Label>
                              <Select
                                value={
                                  tsumoWinner !== null
                                    ? String(tsumoWinner)
                                    : ""
                                }
                                onValueChange={(v) =>
                                  setTsumoWinner(Number(v) as SeatIndex)
                                }
                              >
                                <SelectTrigger className="mt-1 h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {state.names.map((name, idx) => (
                                    <SelectItem key={idx} value={String(idx)}>
                                      {name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">番数</Label>
                                <Input
                                  className="mt-1 h-8 text-xs"
                                  type="number"
                                  min={1}
                                  value={tsumoHan}
                                  onChange={(e) => setTsumoHan(e.target.value)}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">符数</Label>
                                <Input
                                  className="mt-1 h-8 text-xs"
                                  type="number"
                                  min={20}
                                  step={10}
                                  value={tsumoFu}
                                  onChange={(e) => setTsumoFu(e.target.value)}
                                />
                              </div>
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 text-[11px] font-medium text-slate-600">
                              当局立直情况
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {state.names.map((name, idx) => (
                                <label
                                  key={idx}
                                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5 text-xs text-slate-700"
                                >
                                  <Checkbox
                                    checked={tsumoRiichi[idx]}
                                    onCheckedChange={(v) => {
                                      const next = [...tsumoRiichi];
                                      next[idx] = Boolean(v);
                                      setTsumoRiichi(next);
                                    }}
                                  />
                                  <span>{name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 rounded-lg bg-slate-50/80 px-3 py-2">
                          <div className="mb-1 text-[11px] font-medium text-slate-600">
                            结算预览
                          </div>
                          {tsumoPreview ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-2">
                                {state.names.map((name, idx) => {
                                  const delta = tsumoPreview.deltas[idx] ?? 0;
                                  const cls =
                                    delta > 0
                                      ? "text-emerald-600"
                                      : delta < 0
                                      ? "text-rose-600"
                                      : "text-slate-400";
                                  return (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between rounded-md bg-white/70 px-2 py-1"
                                    >
                                      <span className="text-[11px] text-slate-600">
                                        {name}
                                      </span>
                                      <span
                                        className={`text-xs font-semibold tabular-nums ${cls}`}
                                      >
                                        {delta === 0 ? "0" : formatDiff(delta)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                              {tsumoPreview.winnerIndex !== null && (
                                <div className="mt-2 text-[11px] text-slate-600">
                                  <span>和牌者 </span>
                                  <span className="font-medium">
                                    {state.names[tsumoPreview.winnerIndex]}
                                  </span>
                                  <span> 最终收入：</span>
                                  <span
                                    className={`font-semibold ${
                                      (tsumoPreview.deltas[
                                        tsumoPreview.winnerIndex
                                      ] ?? 0) >= 0
                                        ? "text-emerald-600"
                                        : "text-rose-600"
                                    }`}
                                  >
                                    {formatDiff(
                                      tsumoPreview.deltas[
                                        tsumoPreview.winnerIndex
                                      ] ?? 0
                                    )}{" "}
                                    点
                                  </span>
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    （含本场加成、场供{" "}
                                    {formatPoints(tsumoPreview.kyotakuIncome)}{" "}
                                    点、 立直棒收入{" "}
                                    {formatPoints(tsumoPreview.riichiIncome)}{" "}
                                    点）
                                  </div>
                                </div>
                              )}
                              <div className="mt-2 text-[11px] text-slate-500">
                                场供：
                                {formatPoints(
                                  tsumoPreview.kyotakuBefore * 1000
                                )}{" "}
                                →{" "}
                                {formatPoints(tsumoPreview.kyotakuAfter * 1000)}{" "}
                                点
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400">
                              请先完整选择和填写
                            </div>
                          )}
                        </div>
                        <DialogFooter className="mt-4 flex flex-row justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={() => setTsumoOpen(false)}
                          >
                            取消
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={() => {
                              const ok = handleTsumoConfirm();
                              if (ok) {
                                setTsumoOpen(false);
                              }
                            }}
                          >
                            确认自摸
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* 荣和 */}
                    <Dialog open={ronOpen} onOpenChange={setRonOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs"
                        >
                          荣和
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>荣和结算</DialogTitle>
                          <DialogDescription>
                            选择和牌家与点炮家，输入番数与符数，并标记当局立直情况，系统自动计算直击支付与本场点数。
                          </DialogDescription>
                        </DialogHeader>
                        <div className="mt-2 space-y-4 text-xs">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">和牌家</Label>
                              <Select
                                value={
                                  ronWinner !== null ? String(ronWinner) : ""
                                }
                                onValueChange={(v) =>
                                  setRonWinner(Number(v) as SeatIndex)
                                }
                              >
                                <SelectTrigger className="mt-1 h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {state.names.map((name, idx) => (
                                    <SelectItem key={idx} value={String(idx)}>
                                      {name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs">点炮家</Label>
                              <Select
                                value={
                                  ronLoser !== null ? String(ronLoser) : ""
                                }
                                onValueChange={(v) =>
                                  setRonLoser(Number(v) as SeatIndex)
                                }
                              >
                                <SelectTrigger className="mt-1 h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {state.names.map((name, idx) => (
                                    <SelectItem key={idx} value={String(idx)}>
                                      {name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">番数</Label>
                              <Input
                                className="mt-1 h-8 text-xs"
                                type="number"
                                min={1}
                                value={ronHan}
                                onChange={(e) => setRonHan(e.target.value)}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">符数</Label>
                              <Input
                                className="mt-1 h-8 text-xs"
                                type="number"
                                min={20}
                                step={10}
                                value={ronFu}
                                onChange={(e) => setRonFu(e.target.value)}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="mb-1 text-[11px] font-medium text-slate-600">
                              当局立直情况
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {state.names.map((name, idx) => (
                                <label
                                  key={idx}
                                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5 text-xs text-slate-700"
                                >
                                  <Checkbox
                                    checked={ronRiichi[idx]}
                                    onCheckedChange={(v) => {
                                      const next = [...ronRiichi];
                                      next[idx] = Boolean(v);
                                      setRonRiichi(next);
                                    }}
                                  />
                                  <span>{name}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 rounded-lg bg-slate-50/80 px-3 py-2">
                          <div className="mb-1 text-[11px] font-medium text-slate-600">
                            结算预览
                          </div>
                          {ronPreview ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-2">
                                {state.names.map((name, idx) => {
                                  const delta = ronPreview.deltas[idx] ?? 0;
                                  const cls =
                                    delta > 0
                                      ? "text-emerald-600"
                                      : delta < 0
                                      ? "text-rose-600"
                                      : "text-slate-400";
                                  return (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between rounded-md bg-white/70 px-2 py-1"
                                    >
                                      <span className="text-[11px] text-slate-600">
                                        {name}
                                      </span>
                                      <span
                                        className={`text-xs font-semibold tabular-nums ${cls}`}
                                      >
                                        {delta === 0 ? "0" : formatDiff(delta)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                              {ronPreview.winnerIndex !== null && (
                                <div className="mt-2 text-[11px] text-slate-600">
                                  <span>和牌者 </span>
                                  <span className="font-medium">
                                    {state.names[ronPreview.winnerIndex]}
                                  </span>
                                  <span> 最终收入：</span>
                                  <span
                                    className={`font-semibold ${
                                      (ronPreview.deltas[
                                        ronPreview.winnerIndex
                                      ] ?? 0) >= 0
                                        ? "text-emerald-600"
                                        : "text-rose-600"
                                    }`}
                                  >
                                    {formatDiff(
                                      ronPreview.deltas[
                                        ronPreview.winnerIndex
                                      ] ?? 0
                                    )}{" "}
                                    点
                                  </span>
                                  <div className="mt-1 text-[11px] text-slate-500">
                                    （含本场加成、场供{" "}
                                    {formatPoints(ronPreview.kyotakuIncome)}{" "}
                                    点、 立直棒收入{" "}
                                    {formatPoints(ronPreview.riichiIncome)} 点）
                                  </div>
                                </div>
                              )}
                              <div className="mt-2 text-[11px] text-slate-500">
                                场供：
                                {formatPoints(
                                  ronPreview.kyotakuBefore * 1000
                                )}{" "}
                                → {formatPoints(ronPreview.kyotakuAfter * 1000)}{" "}
                                点
                              </div>
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400">
                              请先完整选择和填写
                            </div>
                          )}
                        </div>
                        <DialogFooter className="mt-4 flex flex-row justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={() => setRonOpen(false)}
                          >
                            取消
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            onClick={() => {
                              const ok = handleRonConfirm();
                              if (ok) {
                                setRonOpen(false);
                              }
                            }}
                          >
                            确认荣和
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            disabled={!canUndo}
                            onClick={handleUndoLastSettlement}
                          >
                            撤销结算
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {state.lastSettlementMeta ? (
                          <div className="space-y-1">
                            <div>
                              撤销
                              {formatSettlementType(
                                state.lastSettlementMeta.type
                              )}
                            </div>
                            <div className="line-clamp-2 max-w-[220px] text-[11px] text-zinc-300">
                              {state.lastSettlementMeta.summary}
                            </div>
                            <div className="text-[11px] text-zinc-300">
                              {state.lastSettlementMeta.timestamp}
                            </div>
                          </div>
                        ) : (
                          <span>暂无可撤销的结算</span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-xs"
                            disabled={!canRedo}
                            onClick={handleRedoLastSettlement}
                          >
                            重做结算
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {state.lastSettlementMeta ? (
                          hasLastSettlement && state.isInUndo ? (
                            <div className="space-y-1">
                              <div>
                                重做
                                {formatSettlementType(
                                  state.lastSettlementMeta.type
                                )}
                              </div>
                              <div className="line-clamp-2 max-w-[220px] text-[11px] text-zinc-300">
                                {state.lastSettlementMeta.summary}
                              </div>
                              <div className="text-[11px] text-zinc-300">
                                {state.lastSettlementMeta.timestamp}
                              </div>
                            </div>
                          ) : (
                            <span>请先执行一次撤销操作</span>
                          )
                        ) : (
                          <span>暂无可重做的结算</span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;
