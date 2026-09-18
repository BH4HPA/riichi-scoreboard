/** 领域规则拒绝的命令或输入：code 供客户端分支，message 直接展示。 */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
