import { COMMODITIES, commodity } from "../data/data";
import { baselineStock, crisisAt, dockingsAt, type StationDef, type World } from "../world";
import type { SupportJob } from "./supportjobs";

export interface PortState {
  mode: "ordinary" | "shortage" | "recovery";
  title: string;
  summary: string;
  stock: { id: string; count: number; baseline: number };
  storesLine: string;
  clinicLine: string;
  aid: SupportJob[];
  sections: [string, string[]][];
}

// Display current economic and aid records without creating another port ledger.
export function portState(w: World, st: StationDef): PortState {
  const stocks = COMMODITIES.filter(c => !c.rare && !c.illegal && c.id !== "relics" && st.prices[c.id] > 0)
    .map(c => ({ id: c.id, count: st.stock[c.id] ?? 0, baseline: baselineStock(st.type, c.id) }))
    .sort((a,b) => a.count/a.baseline - b.count/b.baseline || a.id.localeCompare(b.id));
  const crisis = crisisAt(w,st.id);
  const stock = stocks.find(s => s.id === crisis?.commodityId) ?? stocks[0] ?? {id:"food",count:st.stock.food??0,baseline:baselineStock(st.type,"food")};
  const aid = (w.player.support?.jobs ?? []).filter(j => j.phase === "complete" && j.stationId === st.id)
    .sort((a,b) => (b.ended??0)-(a.ended??0));
  const latest = aid[0];
  const resolved = w.crisis?.stationId === st.id && w.crisis.delivered >= w.crisis.need ? w.crisis : undefined;
  const recentAid = latest && w.time - (latest.ended??0) <= 3600;
  const mode = crisis || stocks.length > 0 && stock.count < stock.baseline * .4 ? "shortage" : resolved || recentAid ? "recovery" : "ordinary";
  const goods = commodity(stock.id).name;
  const title = mode === "shortage" ? `${crisis ? crisis.kind.toUpperCase() : "LOW STOCK"}: ${goods.toUpperCase()}`
    : mode === "recovery" ? "RECOVERY OPERATIONS" : "ORDINARY OPERATIONS";
  const summary = crisis ? `${crisis.need-crisis.delivered} ${goods} still needed. Sell supplies at the market.`
    : mode === "shortage" ? `${goods}: ${stock.count} in stores. The market needs deliveries.`
    : resolved ? `${commodity(resolved.commodityId).name} delivered: ${resolved.delivered}/${resolved.need}. The ${resolved.kind} request is filled.`
    : recentAid ? `${latest.name}: ${latest.outcome ?? "aid handoff recorded"}.` : "Cargo is moving through stores. No active supply request here.";
  const storesLine = crisis ? `STORES: ${crisis.delivered}/${crisis.need} ${goods} delivered for the ${crisis.kind}. Sell the remaining ${crisis.need-crisis.delivered} at the market.`
    : resolved ? `STORES: The ${resolved.kind} request was filled with ${resolved.delivered} ${commodity(resolved.commodityId).name}. Current market stocks still determine normal prices.`
    : `STORES: ${goods}, ${stock.count} aboard the station against a usual stock of ${stock.baseline}. Supplies sold at the market enter these stores.`;
  const patient = aid.find(j => j.kind === "medical" && j.patientDelivered);
  const clinicLine = patient ? `CLINIC: The patient from ${patient.name} was registered here. Your ship's berth was released at handoff.`
    : crisis?.commodityId === "med" ? `CLINIC: We still need ${crisis.need-crisis.delivered} medical supplies. The market handles intake.` : "CLINIC: No patient transfer from your ship is recorded here.";
  const sections: [string,string[]][] = [
    [st.name, [title,summary,`Your ship has docked here ${dockingsAt(w.player,st.id)} times.`,"The promenade reads the same stock and crisis request as the market. Reading or walking does not restock stores or pay rewards."]],
    ["STORES",[storesLine,...stocks.map(s=>`${commodity(s.id).name}: ${s.count} in stock; usual stock ${s.baseline}.`)]],
    ["CLINIC",[clinicLine]],
    ["YOUR AID HANDOFFS",aid.length ? aid.map(j=>`${j.name}: ${j.outcome ?? "aid received"}. Recorded at voyage time ${Math.floor(j.ended??0)}s. Payment settled during the aid or arrival; no further payment is due.`) : ["No completed aid handoff from your ship is recorded at this port."]],
  ];
  return {mode,title,summary,stock,storesLine,clinicLine,aid,sections};
}
