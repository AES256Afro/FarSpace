// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Storage as TestStorage } from "happy-dom";
import { Game } from "../src/game";
import { generateWorld, baselineStock, refreshPrices, stationPrice, type StationDef } from "../src/world";
import { beginDockVisit } from "../src/core/docking";
import { portState } from "../src/core/portstate";
import { acceptSupport, closeSupportAtPort } from "../src/core/supportjobs";
import { StationWalkScene } from "../src/scenes/stationwalk";
import { StationScene } from "../src/scenes/station";
import { FlightScene } from "../src/scenes/flight/index";
import { EncounterScene } from "../src/scenes/encounter";
import { LettersScene } from "../src/scenes/letters";
import { updateVoyageSystems } from "../src/core/runtime";
import { COMMODITIES } from "../src/data/data";
import { decodeSave } from "../src/save";
import * as wire from "../src/core/wire";

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function stocked(st:StationDef){for(const c of COMMODITIES)st.stock[c.id]=baselineStock(st.type,c.id);refreshPrices(st);}
function fixture(){
  vi.stubGlobal("localStorage",new TestStorage());vi.stubGlobal("sessionStorage",new TestStorage());
  vi.spyOn(wire,"post").mockResolvedValue(undefined);vi.spyOn(wire,"fetchSquadronData").mockResolvedValue(undefined);vi.spyOn(wire,"fetchBases").mockResolvedValue([]);vi.spyOn(wire,"fetchRaceRecords").mockResolvedValue([]);vi.spyOn(wire,"getSquadron").mockReturnValue(null);vi.spyOn(wire,"getCallsign").mockReturnValue(null);
  const w=generateWorld(424),p=w.player,st=w.systems[p.systemId].stations[0];stocked(st);w.crisis=null;
  p.tutorial=-1;p.story=0;p.story2=-1;p.story3=-1;p.crew=[];p.missions=[];p.cargo={food:8,med:20};p.credits=1000;
  const walk=new StationWalkScene(),station=new StationScene(),keys=new Set<string>();vi.spyOn(station,"crewRequest").mockImplementation(()=>{});
  const g=Object.assign(Object.create(Game.prototype),{world:w,sceneName:"flight",frontend:false,scenes:{station,stationwalk:walk,flight:new FlightScene(),encounter:new EncounterScene(),letters:new LettersScene()},spriteCache:new Map(),input:{wasPressed:(k:string)=>keys.has(k),isDown:(k:string)=>keys.has(k),flush:()=>keys.clear(),down:new Set(),mousePressed:false,mouseX:0,mouseY:0,wheel:0},toast:vi.fn(),showHint:vi.fn(),autosave:vi.fn(()=>true)}) as Game;
  const dock=()=>{beginDockVisit(g.world,st.id);g.setScene("station");};
  const aid=(kind:"repair"|"medical"="repair")=>{
    const n={kind:"trader" as const,name:"Returning freighter",x:0,y:0,angle:0,vx:0,vy:0,hull:30,hullMax:70,fireCd:0,targetIdx:0,disabled:kind==="repair",casualties:kind==="medical"};
    const job=acceptSupport(g.world,n)!;job.stationId=st.id;job.paid=true;job.phase="report";if(kind==="medical")job.patientDelivered=true;
    beginDockVisit(g.world,st.id);closeSupportAtPort(g.world,st.id);return job;
  };
  return{g,w,p,st,walk,station,keys,dock,aid};
}

describe("port operations from existing records",()=>{
  it("reports ordinary stocks without mutating prices or the voyage",()=>{
    const {w,st}=fixture(),before=JSON.stringify(w);const state=portState(w,st);
    expect(state.mode).toBe("ordinary");expect(state.aid).toEqual([]);expect(JSON.stringify(w)).toBe(before);
    expect(state.sections.flatMap(s=>s[1]).join(" ")).toContain("No completed aid handoff");
  });
  it("uses the pricing baseline for low stock and responds immediately to actual stock changes",()=>{
    const {w,st}=fixture();st.stock.food=0;refreshPrices(st);const price=stationPrice(st,"food");
    const low=portState(w,st);expect(low.mode).toBe("shortage");expect(low.stock).toEqual({id:"food",count:0,baseline:baselineStock(st.type,"food")});
    st.stock.food=baselineStock(st.type,"food");refreshPrices(st);expect(portState(w,st).mode).toBe("ordinary");expect(stationPrice(st,"food")).toBeLessThan(price);
  });
  it("keeps crisis demand separate from general stores and resolves through a real market sale",()=>{
    const {g,w,p,st,station,keys,dock}=fixture();dock();stocked(st);
    w.crisis={stationId:st.id,systemId:p.systemId,commodityId:"med",need:12,delivered:0,until:900,kind:"outbreak"};
    const before=portState(w,st);expect(before.mode).toBe("shortage");expect(before.summary).toContain("12 Med Supplies");
    station.tab=0;station.cursor=station.marketRows(g).indexOf("med");keys.add("Shift");keys.add("s");p.cargo.med=12;
    station.update(g,0);keys.clear();expect(w.crisis.delivered).toBe(12);expect(p.cargo.med).toBeUndefined();
    expect(portState(w,st).mode).toBe("recovery");expect(portState(w,st).storesLine).toContain("filled with 12");
    expect(w.events.at(-1)?.text).toContain("outbreak is over");const credits=p.credits;g.setScene("stationwalk");g.setScene("station");expect(p.credits).toBe(credits);
  });
  it("shows completed aid only at its actual receiving port and retains it through control changes and saves",()=>{
    const {g,w,p,st,aid}=fixture();aid("medical");const before=JSON.stringify(w),state=portState(w,st);
    expect(state.mode).toBe("recovery");expect(state.clinicLine).toContain("Returning freighter");expect(JSON.stringify(w)).toBe(before);
    const other=Object.values(w.systems).flatMap(s=>s.stations).find(s=>s.id!==st.id)!;expect(portState(w,other).aid).toHaveLength(0);
    st.factionId=st.factionId==="hex"?"tsc":"hex";g.world=decodeSave(JSON.stringify(w)).world!;const loaded=g.world.systems[p.systemId].stations.find(s=>s.id===st.id)!;
    expect(portState(g.world,loaded).aid[0].id).toBe(p.support!.jobs[0].id);expect(portState(g.world,loaded).clinicLine).toContain("registered here");
  });
  it("retains older handoffs in records while current shortages take visual priority",()=>{
    const {w,st,aid}=fixture();aid("medical");st.stock.food=0;expect(portState(w,st).mode).toBe("shortage");expect(portState(w,st).aid).toHaveLength(1);
    stocked(st);w.time=3601;const state=portState(w,st);expect(state.mode).toBe("ordinary");expect(state.aid).toHaveLength(1);expect(state.clinicLine).toContain("registered here");
  });
  it("does not invent a patient or local crisis at another station",()=>{
    const {w,p,st,aid}=fixture();aid("repair");w.crisis={stationId:"elsewhere",systemId:p.systemId,commodityId:"med",need:8,delivered:0,until:900,kind:"outbreak"};
    expect(portState(w,st).mode).toBe("recovery");expect(portState(w,st).clinicLine).toContain("No patient");
  });
});

describe("promenade port records",()=>{
  it("keeps full terms available, pauses simulation and returns to the same walking position",()=>{
    const {g,w,walk,keys,dock,aid}=fixture();aid();dock();g.setScene("stationwalk");walk.px=135;walk.py=75;
    const before=JSON.stringify(w),actors=walk.npcs;keys.add("i");walk.update(g,0);keys.clear();expect(walk.info).toBeDefined();expect(walk.pausesVoyage).toBe(true);
    keys.add("End");walk.update(g,0);keys.clear();expect(walk.info!.scroll).toBe(walk.info!.maxScroll());updateVoyageSystems(g,100);expect(JSON.stringify(w)).toBe(before);
    keys.add("Escape");walk.update(g,0);keys.clear();expect(walk.info).toBeUndefined();expect(walk.pausesVoyage).toBe(false);expect(walk.npcs).toBe(actors);expect([walk.px,walk.py]).toEqual([135,75]);
  });
  it("staff records and pointer access are read only and leave routes and kiosks available",()=>{
    const {g,w,walk,keys,dock}=fixture();dock();g.setScene("stationwalk");
    const before=JSON.stringify(w);walk.px=135;walk.py=75;keys.add("e");walk.update(g,0);keys.clear();expect(walk.info!.sections[0][0]).toBe("STORES");expect(JSON.stringify(w)).toBe(before);
    walk.onSceneLeave();walk.px=245;walk.py=75;keys.add("e");walk.update(g,0);keys.clear();expect(walk.info!.sections[0][0]).toBe("CLINIC");
    walk.onSceneLeave();Object.assign(g.input,{mousePressed:true,mouseX:360,mouseY:46});walk.update(g,0);expect(walk.info!.sections[0][0]).toBe(walk.station.name);expect(JSON.stringify(w)).toBe(before);
    const seen=new Set<string>(["37,3"]),queue=[[37,3]];
    for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const [x,y]=queue[i],nx=x+dx,ny=y+dy,key=`${nx},${ny}`;if(!walk.solid(nx,ny)&&!seen.has(key)){seen.add(key);queue.push([nx,ny]);}}
    for(const spot of [[13,7],[24,7],[8,3],[31,3],[6,8],[27,8],[31,8]])expect(seen.has(spot.join(",")),`reachable ${spot}`).toBe(true);
  });
});
