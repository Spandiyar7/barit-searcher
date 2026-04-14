import type { SourceEngine, SourceId } from "../types";
import { runGo4WorldBusinessEngine } from "./go4worldbusiness";
import { runTradeWheelEngine } from "./tradewheel";
import { runTradeKeyEngine } from "./tradekey";
import { runAlibabaEngine } from "./alibaba";
import { runKompassEngine } from "./kompass";

export const MARKET_SOURCE_ENGINES: Partial<Record<SourceId, SourceEngine>> = {
  go4worldbusiness: runGo4WorldBusinessEngine,
  tradewheel: runTradeWheelEngine,
  tradekey: runTradeKeyEngine,
  alibaba: runAlibabaEngine,
  kompass: runKompassEngine
};
