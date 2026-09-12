import type { Game } from "../../game";
import type { FlightScene } from "./index";
import { dist } from "../../core/mathx";
import { atSingersBerth } from "../../core/singers";
import { wreckAvailable } from "../../core/salvage";
import { recoveryTow } from "../../core/shiprecovery";
import { infraAt, wondersIn, canBuildInfra, permitDenied } from "../../world";

// Resolve once in the same order used by E. The HUD reads this without acting.
export function flightInteraction(fs: FlightScene, g: Game) {
  const p = g.world.player, sys = g.world.systems[p.systemId];
  const near = (x: number, y: number, range: number) => dist(p.x, p.y, x, y) < range;
  if (atSingersBerth(g.world)) return { kind: "singers" as const, prompt: Math.hypot(p.vx, p.vy) > 45 ? "X BRAKE BELOW 45 M/S TO DOCK AT SINGERS' BERTH" : "E DOCK AT SINGERS' BERTH" };
  const needy = fs.npcs.find(n => n.kind === "trader" && n.hull > 0 && !n.docked && near(n.x, n.y, 80) && (n.disabled || n.casualties || n.hull < n.hullMax * .5));
  if (needy && !fs.repairJob) return { kind: "help" as const, target: needy, prompt: `E OFFER HELP TO ${needy.name ?? "FREIGHTER"}` };
  const corsair = fs.npcs.find(n => !fs.piratesFriendly(g) && n.kind === "pirate" && n.hull > 0 && !n.docked && !n.fleeing && near(n.x, n.y, 260));
  if (corsair) return { kind: "parley" as const, target: corsair, prompt: `E PARLEY WITH ${corsair.name ?? "CORSAIR"}` };
  const station = sys.stations.find(st => near(Math.cos(st.angle) * st.orbit, Math.sin(st.angle) * st.orbit, 110));
  if (station) return { kind: "station" as const, target: station, prompt: `E REQUEST DOCKING AT ${station.name}` };
  const gate = sys.jumpPoints.find(j => near(j.x, j.y, 70));
  if (gate) {
    const cost = fs.jumpCost(g, gate.targetSystemId);
    const reason = recoveryTow(g.world) ? "DETACH THE RECOVERY TOW BEFORE JUMPING" : p.fuel < cost ? `NEED ${cost} FUEL TO JUMP` : permitDenied(g.world, gate.targetSystemId) ? "PERMIT REQUIRED FOR THIS JUMP" : null;
    return { kind: "gate" as const, target: gate, prompt: reason ? `${reason} / TAB MAP` : `E JUMP TO ${g.world.systems[gate.targetSystemId].name} / ${cost} FUEL` };
  }
  const ark = wondersIn(g.world, sys.id).find(w => w.kind === "ark" && dist(p.x, p.y, w.x, w.y) <= 160);
  if (ark) return { kind: "ark" as const, target: ark, prompt: `E BOARD ${ark.name}` };
  const wreck = sys.wrecks.find(w => wreckAvailable(w) && near(w.x, w.y, 60));
  if (wreck) return { kind: "wreck" as const, target: wreck, prompt: `E SALVAGE / RECOVER ${wreck.name}` };
  const signal = sys.anomalies.find(a => a.discovered && !a.claimed && near(a.x, a.y, 60));
  if (signal) return { kind: "signal" as const, target: signal, prompt: `E INVESTIGATE ${signal.name}` };
  const planet = sys.planets.find(pl => near(Math.cos(pl.angle) * pl.orbit, Math.sin(pl.angle) * pl.orbit, pl.radius + 90));
  if (planet) return { kind: "planet" as const, target: planet, prompt: `E ENTER ORBIT AT ${planet.name}` };
  const structure = infraAt(g.world, sys.id).find(i => near(i.x, i.y, 90));
  if (structure) return { kind: "structure" as const, target: structure, prompt: structure.upgraded ? "E ENTER WAYSTATION" : "E TEND STRUCTURE" };
  const kit = (["beacon", "depot"] as const).find(k => (p.kits?.[k] ?? 0) > 0);
  if (kit && !canBuildInfra(g.world, sys.id)) return { kind: "kit" as const, target: kit, prompt: near(0, 0, 500) ? "FLY BEYOND 500M FROM THE STAR TO BUILD" : `E DEPLOY ${kit.toUpperCase()}` };
  return null;
}
