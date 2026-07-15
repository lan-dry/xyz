/** Match tool_name against policy_rule.tool_pattern (exact or glob with *). */
export function toolMatches(pattern: string, toolName: string): boolean {
  if (pattern === toolName) {
    return true;
  }
  if (!pattern.includes("*")) {
    return false;
  }
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(toolName);
}
