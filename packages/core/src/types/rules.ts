/**
 * 房间规则。每个字段旁注明消费点，保证没有无消费者的开关。
 */
export interface RoomRules {
  scoring: {
    /** 30符4番、60符3番视为满贯 → scoring/basePoints */
    kiriageMangan: boolean;
    /** 13 番以上算累计役满；关闭则 11 番以上封顶三倍满 → scoring/basePoints */
    kazoeYakuman: boolean;
    /** 大四喜/国士十三面/纯正九莲/四暗刻单骑等算两倍役满 → hand/options（riichi-rs allow_double_yakuman） */
    doubleYakuman: boolean;
    /** 复合役满叠加计算；关闭则多个役满只算一倍 → scoring/basePoints */
    yakumanStacking: boolean;
    /** 包牌（大三元/大四喜/四杠子责任払い）。本实现对整手点数生效 → scoring/payments */
    pao: boolean;
    /** 每本场总点数（默认 300，自摸时三家均摊） → scoring/payments */
    honbaValue: number;
    /** 不听罚符总额（默认 3000；0 为无罚符） → scoring/payments */
    notenBappu: number;
  };
  hand: {
    /** 赤宝牌张数 → hand/options（allow_aka）与牌键盘可选赤牌数 */
    akaCount: 0 | 3 | 4;
    /** 里宝 → 牌键盘是否允许输入里宝指示牌 */
    uraDora: boolean;
    /** 杠宝/杠里 → 牌键盘允许的指示牌数量上限 */
    kanDora: boolean;
    /** 食断 → hand/options（allow_kuitan） */
    kuitan: boolean;
    /** 一发 → hand/options（disabled_yaku 含 Ippatsu 时关闭） */
    ippatsu: boolean;
    /** 人和：无 / 役满 → hand/options（disabled_yaku） */
    renhou: "none" | "yakuman";
    /** 流局满贯 → reducer/game（draw） */
    nagashiMangan: boolean;
    /** 国士无双可抢暗杠 → 仅记录在规则里供对照：引擎不区分抢明杠/暗杠，界面也没有消费点 */
    kokushiAnkanChankan: boolean;
  };
  win: {
    /** 头跳 / 双响 / 三响 → reducer/game（ron）；双响时本场各得、场供归放铳者下家 */
    multiRon: "atamahane" | "double" | "triple";
  };
  progress: {
    /** 东风战 / 半庄 → progress/advance */
    length: "east" | "hanchan";
    /** 击飞：threshold below0 = 负分才击飞，at0 = 0 分也击飞；bonus 为击飞奖励（终局分单位，由被击飞者付给击飞者） → progress/advance, final/settle */
    tobi: { enabled: boolean; threshold: "below0" | "at0"; bonus: number };
    /** 西入/延长战：终局时无人达到 threshold 则进入下一风场，任一局结束时有人达到即终局 → progress/advance */
    enchousen: { enabled: boolean; threshold: number };
    /** 和了止：最终局庄家和牌且为一位时可选择结束 → progress/advance */
    agariYame: boolean;
    /** 听牌止：最终局流局庄家听牌且为一位时可选择结束 → progress/advance */
    tenpaiYame: boolean;
    /** 途中流局（九种九牌/四风连打/四家立直/四杠散了）是否成立 → reducer/game（abortive） */
    abortiveDraws: boolean;
    /** 错和罚符：无 / 满贯罚符 → reducer/game（chombo） */
    chombo: "none" | "mangan";
    /** 点数不足 1000 时是否允许立直 → reducer 校验立直 */
    riichiBelow1000: boolean;
  };
  final: {
    startPoints: number;
    returnPoints: number;
    /** 顺位马（不含 oka），oka = (returnPoints - startPoints) × 4 / 1000 归一位 → final/settle */
    uma: [number, number, number, number];
    /** 同点：起家优先 / 顺位点按分 → final/settle */
    tieRule: "seat" | "split";
    /** 终局残留场供：一位取得 / 消失 / 平分 → final/settle */
    leftoverKyotaku: "top" | "void" | "split";
  };
}

export interface RulesPreset {
  id: string;
  name: string;
  rules: RoomRules;
  /** 内置预设的一行说明（来源、与官方规则的已知差异） */
  note?: string;
}
