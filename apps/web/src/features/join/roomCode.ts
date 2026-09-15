/** 房间码字母表与服务端一致：不含 0/1/I/O。 */
const CODE = "[A-HJ-NP-Za-hj-np-z2-9]{6}";
const IN_LINK = new RegExp(`/r/(${CODE})(?:[/?#]|$)`);
const BARE = new RegExp(`^(${CODE})$`);

/** 从扫到的内容里取房间码：完整加入链接（/r/XXXXXX）或纯 6 位码。 */
export function roomCodeFrom(text: string): string | null {
  const m = IN_LINK.exec(text) ?? BARE.exec(text.trim());
  return m ? m[1]!.toUpperCase() : null;
}
