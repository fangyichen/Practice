/**
 * 默认引擎配置：编译期静态引入 config/engine.json（不是运行时 IO），加载时校验。
 * 引擎各入口都接受一个可选的 config 参数，不传就用这里的默认值。
 */
import raw from "../config/engine.json";
import { EngineConfigSchema, stripDocKeys, type EngineConfig } from "../schemas";

export function parseEngineConfig(input: unknown): EngineConfig {
  return EngineConfigSchema.parse(stripDocKeys(input));
}

export const DEFAULT_CONFIG: EngineConfig = parseEngineConfig(raw);

/** 在默认配置上覆盖若干字段（浅层按段合并），方便做对比实验。 */
export function withConfig(patch: { [K in keyof EngineConfig]?: Partial<EngineConfig[K]> | EngineConfig[K] }): EngineConfig {
  const merged: Record<string, unknown> = { ...DEFAULT_CONFIG };
  for (const [k, v] of Object.entries(patch)) {
    const base = (DEFAULT_CONFIG as Record<string, unknown>)[k];
    merged[k] = v && typeof v === "object" && !Array.isArray(v) && base && typeof base === "object" ? { ...base, ...v } : v;
  }
  return EngineConfigSchema.parse(merged);
}
