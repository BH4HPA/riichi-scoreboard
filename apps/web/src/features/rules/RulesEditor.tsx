import { useEffect, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { BUILTIN_PRESETS, RulesError, validateRules, type RoomRules } from "@riichi/core";
import { useSession } from "@/api/session";
import { Button } from "@/ui/button";
import { Input, Label, Select, Switch } from "@/ui/controls";
import { useRoomStore } from "@/ws/store";
import { getPath, RULE_GROUPS, setPath, type RuleField } from "./fields";
import { umaDescription } from "@/features/final/FinalPanel";

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

/** 规则编辑器：预设选择/保存 + 分组开关。editable=false 时只读展示。 */
export function RulesEditor({
  value,
  onChange,
  editable,
}: {
  value: RoomRules;
  onChange: (r: RoomRules) => void;
  editable: boolean;
}) {
  const { presets, loadPresets, savePreset, deletePreset } = useSession();
  const notify = useRoomStore((s) => s.notify);
  const [presetName, setPresetName] = useState("");
  const [selected, setSelected] = useState<string>("mleague");
  useEffect(() => {
    loadPresets().catch(() => undefined);
  }, [loadPresets]);

  const all = [...BUILTIN_PRESETS, ...presets];
  const applyPreset = (id: string) => {
    setSelected(id);
    const p = all.find((x) => x.id === id);
    if (p) onChange(validateRules(p.rules));
  };
  const save = async () => {
    const name = presetName.trim();
    if (!name) return;
    try {
      validateRules(value);
      const preset = await savePreset(name, value);
      setPresetName("");
      setSelected(preset.id);
      notify("info", `已保存预设「${name}」`);
    } catch (err) {
      notify("error", err instanceof RulesError ? err.message : "保存失败");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-3">
        <Label>预设</Label>
        <div className="mt-1 flex gap-2">
          <Select
            value={selected}
            onValueChange={applyPreset}
            options={all.map((p) => ({ value: p.id, label: p.name }))}
            disabled={!editable}
            className="flex-1"
          />
          {editable && selected !== "mleague" && presets.some((p) => p.id === selected) && (
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10"
              aria-label="删除预设"
              onClick={async () => {
                await deletePreset(selected);
                setSelected("mleague");
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        {editable && (
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
        )}
        <p className="mt-2 text-xs text-muted">{umaDescription(value)}</p>
      </div>
      {RULE_GROUPS.map((group) => (
        <section key={group.title}>
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
  );
}

function displayValue(field: RuleField, value: unknown): string {
  if (field.control.type === "switch") return value ? "开" : "关";
  if (field.control.type === "select")
    return field.control.options.find((o) => o.value === String(value))?.label ?? String(value);
  return String(value);
}

/** 关键规则摘要（电视镜像与大厅用） */
export function RulesSummary({ rules }: { rules: RoomRules }) {
  const items: string[] = [
    rules.progress.length === "east" ? "东风战" : "半庄",
    `${rules.final.startPoints / 1000}000 起 / ${rules.final.returnPoints / 1000}000 返`,
    `马 ${rules.final.uma.join("/")}`,
    rules.scoring.kiriageMangan ? "切上满贯" : "无切上",
    rules.scoring.kazoeYakuman ? "累计役满" : "13 番封顶三倍满",
    rules.scoring.doubleYakuman ? "多倍役满" : "无多倍役满",
    `赤 ${rules.hand.akaCount}`,
    rules.hand.kuitan ? "食断" : "无食断",
    rules.win.multiRon === "atamahane" ? "头跳" : rules.win.multiRon === "double" ? "双响" : "三响",
    rules.progress.tobi.enabled ? "击飞" : "无击飞",
    rules.progress.enchousen.enabled ? `西入 ${rules.progress.enchousen.threshold}` : "无西入",
    rules.progress.agariYame ? "和了止" : "无和了止",
    rules.progress.abortiveDraws ? "途中流局" : "无途中流局",
    rules.final.tieRule === "split" ? "同点按分" : "同点起家优先",
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((t) => (
        <span key={t} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs">
          {t}
        </span>
      ))}
    </div>
  );
}
