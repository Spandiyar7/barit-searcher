import type { SourceEngine, SourceId } from "../types";
import { runGo4WorldBusinessEngine } from "./go4worldbusiness";
import { runTradeWheelEngine } from "./tradewheel";
import { runTradeKeyEngine } from "./tradekey";
import { runAlibabaEngine } from "./alibaba";
import { runKompassEngine } from "./kompass";
import { runEuropagesEngine } from "./europages";
import { runChemNetEngine } from "./chemnet";
import { runPetroChemzEngine } from "./petrochemz";
import { runGlobyEngine } from "./globy";
import { runToocleEngine } from "./toocle";
import { runPlastic4TradeEngine } from "./plastic4trade";
import { runDirectWebsitesEngine } from "./direct-websites";

export const MARKET_SOURCE_ENGINES: Partial<Record<SourceId, SourceEngine>> = {
  petrochemz: runPetroChemzEngine,
  plastic4trade: runPlastic4TradeEngine,
  globy: runGlobyEngine,
  chemnet: runChemNetEngine,
  toocle: runToocleEngine,
  go4worldbusiness: runGo4WorldBusinessEngine,
  tradewheel: runTradeWheelEngine,
  tradekey: runTradeKeyEngine,
  alibaba: runAlibabaEngine,
  kompass: runKompassEngine,
  europages: runEuropagesEngine,
  direct_websites: runDirectWebsitesEngine
};
