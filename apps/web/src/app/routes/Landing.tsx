import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Monitor, Smartphone } from "lucide-react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/controls";

export function Landing() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const go = () => {
    const c = code.trim().toUpperCase();
    if (c.length === 6) navigate(`/r/${c}`);
  };
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">立直麻将计分板</h1>
        <p className="mt-1 text-sm text-muted">电视开主控台显示二维码，手机扫码加入并远程计分。</p>
      </div>
      <Button asChild size="lg" variant="accent" className="justify-start">
        <Link to="/console">
          <Monitor className="h-5 w-5" /> 打开主控台（电视 / 电脑）
        </Link>
      </Button>
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Smartphone className="h-4 w-4" /> 输入房间码加入
        </div>
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="6 位房间码"
            maxLength={6}
            autoCapitalize="characters"
            className="tabular tracking-[0.3em] uppercase"
          />
          <Button onClick={go} disabled={code.trim().length !== 6}>
            加入
          </Button>
        </div>
      </div>
    </main>
  );
}
