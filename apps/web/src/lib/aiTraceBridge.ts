import type { AiTraceEvent, AiTraceEventType, AiTraceOptions } from '@retrofoot/core';

interface AiTraceBridgeOptions {
  enabled: boolean;
  onEvent: (event: AiTraceEvent) => void;
  sampleRates?: Partial<Record<AiTraceEventType, number>>;
  throttleMsByType?: Partial<Record<AiTraceEventType, number>>;
}

export function createAiTraceOptionsForDev(
  options: AiTraceBridgeOptions,
): AiTraceOptions {
  if (!options.enabled) {
    return { enabled: false };
  }

  const sampleRates = options.sampleRates;
  const throttleMsByType = options.throttleMsByType;
  const lastEmitByType = new Map<AiTraceEventType, number>();
  let sampleCounter = 0;

  return {
    enabled: true,
    sampleRates,
    sink: (event) => {
      const now = Date.now();
      const throttleMs = throttleMsByType?.[event.type] ?? 0;
      const lastTs = lastEmitByType.get(event.type) ?? 0;
      if (throttleMs > 0 && now - lastTs < throttleMs) {
        return;
      }

      const rate = sampleRates?.[event.type];
      if (rate !== undefined) {
        if (rate <= 0) return;
        if (rate < 1) {
          sampleCounter += 1;
          const bucket = sampleCounter % 1000;
          const threshold = Math.floor(rate * 1000);
          if (bucket >= threshold) return;
        }
      }

      lastEmitByType.set(event.type, now);
      options.onEvent(event);
    },
  };
}
