// Shared runtime config — set once at startup, read by any module.

export interface RuntimeConfig {
  port: number;
  host: string;
  shell: string;
  password?: string;
}

let _config: RuntimeConfig | null = null;

export function setConfig(c: RuntimeConfig): void {
  _config = c;
}

export function getConfig(): RuntimeConfig {
  if (!_config) throw new Error("Config not initialized");
  return _config;
}
