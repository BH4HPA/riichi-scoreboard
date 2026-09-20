import { useState } from "react";
import { TEN_GUIDE_FIRST } from "@riichi/core";
import { Dialog, DialogContent } from "@/ui/dialog";
import { useMirror } from "@/features/mirror/useMirror";
import { CastSwitch } from "@/features/mirror/CastSwitch";
import { TenGuide } from "./TenGuide";

/**
 * 大厅里的规则说明弹层。手机端带「投到电视」开关：电视大厅平时看不到规则说明，打开后全屏跟着讲解者读到的那一节；
 * 关掉弹层即复位。主控台自己打开时直接在本机看（`castable=false`）。
 */
export function TenGuideDialog({
  open,
  onOpenChange,
  castable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  castable: boolean;
}) {
  const [page, setPage] = useState(TEN_GUIDE_FIRST);
  const [cast, setCast] = useState(false);
  useMirror(castable && cast && open, { kind: "tenGuide", page }, true);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setCast(false);
        onOpenChange(next);
      }}
    >
      <DialogContent
        title="《天》二人麻将规则"
        description="不熟悉规则的话，开局前一起过一遍。"
        className="sm:max-w-2xl"
      >
        {castable && <CastSwitch checked={cast} onCheckedChange={setCast} />}
        <TenGuide page={page} onPageChange={setPage} />
      </DialogContent>
    </Dialog>
  );
}
