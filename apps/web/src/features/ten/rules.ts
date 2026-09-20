import type { RuleGroupKey } from "@/features/rules/fields";

/**
 * 二人房消费的规则分组：得分 = 四麻自摸的总收入，所以只有「点数换算」与「役与宝牌」生效；
 * 和了裁定（一炮多响）、进行（局数、击飞）、终局（马点）都与它无关。
 */
export const TEN_RULE_GROUPS: readonly RuleGroupKey[] = ["scoring", "hand"];
