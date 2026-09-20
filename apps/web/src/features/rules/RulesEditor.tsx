import { useEffect, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import {
  BUILTIN_PRESETS,
  findPreset,
  RulesError,
  rulesSummary,
  tenRulesSummary,
  umaDescription,
  validateRules,
  type RoomKind,
  type RoomRules,
} from "@riichi/core";
import { ApiError } from "@/api/client";
import { useSession } from "@/api/session";
import { Button } from "@/ui/button";
import { Input, Label, Select, Switch } from "@/ui/controls";
import { useRoomStore } from "@/ws/store";
import { cn } from "@/lib/utils";
import { getPath, RULE_GROUPS, setPath, type RuleField, type RuleGroupKey } from "./fields";

function FieldControl({
  field,
  rules,
  onChange,
}: {
  field: RuleField;
  rules: RoomRules;
  onChange: (r: RoomRules) => void;
}) {
  const value = getPath(rules, field.path);
  switch (field.control.type) {
    case "switch":
      return (
        <Switch
          checked={value === true}
          onCheckedChange={(v) => onChange(setPath(rules, field.path, v))}
        />
      );
    case "select": {
      const isNumeric = typeof value === "number";
      return (
        <Select
          value={String(value)}
          onValueChange={(v) => onChange(setPath(rules, field.path, isNumeric ? Number(v) : v))}
          options={field.control.options}
          className="h-8 w-36 text-xs"
        />
      );
    }
    case "number":
      return (
        <Input
          type="number"
          min={field.control.min}
          max={field.control.max}
          step={field.control.step ?? 1}
          value={typeof value === "number" ? value : 0}
          onChange={(e) => onChange(setPath(rules, field.path, Number(e.target.value)))}
          className="h-8 w-28 text-right text-xs tabular"
        />
      );
  }
}

function displayValue(field: RuleField, value: unknown): string {
  if (field.control.type === "switch") return value ? "开" : "关";
  if (field.control.type === "select")
    return field.control.options.find((o) => o.value === String(value))?.label ?? String(value);
  return String(value);
}

/** 规则编辑器：预设选择/保存 + 分组开关。editable=false 时只读展示（不显示预设区）。 */
export function RulesEditor({
  value,
  onChange,
  editable,
  columns = 1,
  groups,
}: {
  value: RoomRules;
  onChange: (r: RoomRules) => void;
  editable: boolean;
  /** 只显示这些分组（二人房只消费点数换算与役、宝牌）；不传 = 全部 */
  groups?: readonly RuleGroupKey[] | undefined;
  /** 分组多列排版（电视大厅用） */
  columns?: 1 | 2;
}) {
  const shown = groups ? RULE_GROUPS.filter((g) => groups.includes(g.key)) : RULE_GROUPS;
  // 马点说明属于「终局」一节：那一节不显示时它也没有意义
  const showUma = shown.some((g) => g.key === "final");
  const { presets, loadPresets, savePreset, deletePreset } = useSession();
  const notify = useRoomStore((s) => s.notify);
  const [presetName, setPresetName] = useState("");
  useEffect(() => {
    if (editable) loadPresets().catch(() => undefined);
  }, [editable, loadPresets]);

  // 下拉的值由当前规则派生：与哪个预设完全相同就选中它，否则显示「自定义」。
  // 我的预设优先匹配：把内置规则另存为自己的预设后，选中的应是那份可删除的副本。
  const all = [...BUILTIN_PRESETS, ...presets];
  const matched = findPreset(value, [...presets, ...BUILTIN_PRESETS]);
  const selected = matched?.id ?? "custom";
  const options: Array<{ value: string; label: string; disabled?: boolean }> = all.map((p) => ({
    value: p.id,
    label: p.name,
  }));
  if (!matched) options.push({ value: "custom", label: "自定义", disabled: true });
  const applyPreset = (id: string) => {
    const p = all.find((x) => x.id === id);
    if (p) onChange(validateRules(p.rules));
  };
  const save = async () => {
    const name = presetName.trim();
    if (!name) return;
    try {
      validateRules(value);
      await savePreset(name, value);
      setPresetName("");
      notify("info", `已保存预设「${name}」`);
    } catch (err) {
      notify(
        "error",
        err instanceof RulesError || err instanceof ApiError ? err.message : "保存失败",
      );
    }
  };
  const remove = async () => {
    try {
      await deletePreset(selected);
    } catch (err) {
      notify("error", err instanceof ApiError ? err.message : "删除失败");
    }
  };

  return (
    <div className="space-y-4">
      {editable ? (
        <div className="rounded-lg border border-border p-3">
          <Label>预设</Label>
          <div className="mt-1 flex gap-2">
            <Select
              value={selected}
              onValueChange={applyPreset}
              options={options}
              className="flex-1"
            />
            {presets.some((p) => p.id === selected) && (
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                aria-label="删除预设"
                onClick={remove}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="把当前规则保存为我的预设"
              maxLength={12}
            />
            <Button variant="outline" onClick={save} disabled={!presetName.trim()}>
              <Save className="h-4 w-4" /> 保存
            </Button>
          </div>
          {matched?.note && <p className="mt-2 text-xs text-muted">{matched.note}</p>}
          {showUma && <p className="mt-2 text-xs text-muted">{umaDescription(value)}</p>}
        </div>
      ) : (
        showUma && <p className="text-xs text-muted">{umaDescription(value)}</p>
      )}
      <div className={cn(columns === 2 ? "columns-2 gap-4 [&>section]:mb-4" : "space-y-4")}>
        {shown.map((group) => (
          <section key={group.title} className="break-inside-avoid">
            <h4 className="mb-1 text-xs font-medium text-muted">{group.title}</h4>
            <div className="divide-y divide-border rounded-lg border border-border">
              {group.fields.map((field) => (
                <div key={field.path} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm">{field.label}</div>
                    {field.hint && <div className="text-[11px] text-muted">{field.hint}</div>}
                  </div>
                  {editable ? (
                    <FieldControl field={field} rules={value} onChange={onChange} />
                  ) : (
                    <span className="text-sm tabular text-muted">
                      {displayValue(field, getPath(value, field.path))}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** 关键规则摘要（电视镜像与大厅用）；二人房只列它实际消费的规则 */
export function RulesSummary({ rules, kind }: { rules: RoomRules; kind?: RoomKind | undefined }) {
  const tags = kind === "ten" ? tenRulesSummary(rules) : rulesSummary(rules);
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs">
          {t}
        </span>
      ))}
    </div>
  );
}
