// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Storage as TestStorage } from "happy-dom";
import { Game } from "../src/game";
import { generateWorld, passengerCap, applyHull, type Mission } from "../src/world";
import { beginDockVisit } from "../src/core/docking";
import { acceptSupport, activeSupport, closeSupportAtPort, reconcileSupport, snapshotSupport, supportAtShip, supportBerths, supportTerms, validSupport } from "../src/core/supportjobs";
import { restoreSupport, syncSupport } from "../src/scenes/flight/support";
import { updateSos } from "../src/scenes/flight/ai";
import { FlightScene } from "../src/scenes/flight/index";
import { StationScene } from "../src/scenes/station";
import { RepairScene } from "../src/scenes/repair";
import { EncounterScene } from "../src/scenes/encounter";
import { LettersScene } from "../src/scenes/letters";
import { JourneyScene } from "../src/scenes/journey";
import { flightInteraction } from "../src/scenes/flight/interaction";
import { systemContacts } from "../src/scenes/systemmap";
import { questLocations } from "../src/core/questlocations";
import { journeyBriefing } from "../src/core/journey";
import { updateVoyageSystems } from "../src/core/runtime";
import { decodeSave } from "../src/save";
import type { Npc } from "../src/scenes/flight/types";
import type { Encounter } from "../src/data/encounters";
import { RNG } from "../src/core/rng";
import * as wire from "../src/core/wire";

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(kind:"repair"|"medical"|"fuel"="repair") {
  vi.stubGlobal("localStorage",new TestStorage());vi.stubGlobal("sessionStorage",new TestStorage());
  vi.spyOn(wire,"getCallsign").mockReturnValue(null);vi.spyOn(wire,"post").mockResolvedValue(undefined);
  vi.spyOn(wire,"fetchSquadronData").mockResolvedValue(undefined);vi.spyOn(wire,"fetchBases").mockResolvedValue([]);vi.spyOn(wire,"fetchRaceRecords").mockResolvedValue([]);vi.spyOn(wire,"getSquadron").mockReturnValue(null);
  const world=generateWorld(423),p=world.player,sys=world.systems[p.systemId],st=sys.stations[0];
  Object.assign(p,{x:50000,y:0,vx:0,vy:0,tutorial:-1,story:0,story2:-1,story3:-1,credits:600,cargo:{parts:4,med:4,food:8},fuel:30,missions:[],crew:[{name:"Ada",role:"engineer",skill:1,wage:0,morale:70},{name:"Lin",role:"medic",skill:1,wage:0,morale:70}]});
  const fs=new FlightScene(),station=new StationScene(),encounter=new EncounterScene(),keys=new Set<string>();
  vi.spyOn(station,"crewRequest").mockImplementation(()=>{});
  const g=Object.assign(Object.create(Game.prototype),{world,sceneName:"flight",frontend:false,scene:fs,scenes:{flight:fs,station,encounter,repair:new RepairScene(),journey:new JourneyScene(),letters:new LettersScene()},spriteCache:new Map(),input:{wasPressed:(k:string)=>keys.has(k),isDown:()=>false,flush:()=>keys.clear(),down:new Set(),mouseX:0,mouseY:0,wheel:0},toast:vi.fn(),showHint:vi.fn(),autosave:vi.fn(()=>true)}) as Game;
  const n:Npc={kind:"trader",supportId:undefined,name:`Test ${kind}`,x:p.x+30,y:p.y,angle:0,vx:0,vy:0,hull:30,hullMax:70,fireCd:0,targetIdx:0,disabled:kind!=="medical",casualties:kind==="medical",mayday:kind==="fuel"};fs.npcs=[n];
  const offer=()=>{let enc!:Encounter;vi.spyOn(encounter,"open").mockImplementation((_g,e)=>{enc=e;});fs.offerHelp(g,n);return enc;};
  const answer=(label:string)=>{const enc=offer(),option=enc.options.find(o=>o.label.includes(label));expect(option,label).toBeDefined();return option!.result(g,new RNG(1));};
  const job=()=>supportAtShip(g.world,n)!;
  const dock=()=>{const player=g.world.player;player.systemId=sys.id;beginDockVisit(g.world,st.id);g.setScene("station");};
  return {g,world,p,sys,st,fs,station,encounter,n,keys,offer,answer,job,dock};
}

describe("accepted support requests",()=>{
  it.each(["repair","medical","fuel"] as const)("records a %s ship once, survives reload, and does not invent a second ship",kind=>{
    const {g,p,fs,n,answer,job}=fixture(kind);p.cargoMax=0;p.cargo={};
    answer("RETURN WITH SUPPLIES");const id=job().id,before=JSON.stringify(g.world);expect(p.support?.jobs).toHaveLength(1);
    expect(acceptSupport(g.world,n)?.id).toBe(id);expect(JSON.stringify(g.world)).toBe(before);expect(p.credits).toBe(600);
    const loaded=decodeSave(JSON.stringify(g.world)).world!;expect(loaded).not.toBeNull();g.world=loaded;
    fs.npcs=[{...n,supportId:undefined,hull:70}];restoreSupport(fs,g);restoreSupport(fs,g);
    expect(fs.npcs.filter(x=>x.supportId===id)).toHaveLength(1);expect(fs.npcs[0].hull).toBe(30);
    expect(questLocations(g.world).find(q=>q.id===id)?.contactId).toBe(`support:${id}`);
    expect(systemContacts(g).find(c=>c.id===`support:${id}`)?.name).toBe(n.name);
  });
  it("keeps partial supply deliveries through absence and hull changes without charging again",()=>{
    const {g,p,fs,n,answer,job}=fixture();answer("TRANSFER 2 SPARE");expect(p.cargo.parts).toBe(2);expect(job().supplied).toBe(true);
    applyHull(p,"freighter");expect(p.hullId).toBe("freighter");fs.npcs=[];restoreSupport(fs,g);const restored=fs.npcs[0];expect(restored.supportId).toBe(n.supportId);
    fs.npcs=[n];answer("SEND ADA");expect(p.cargo.parts).toBe(2);fs.updateRepairJob(g,15);expect(job().progress).toBeCloseTo(1/3);
    p.x-=300;fs.updateRepairJob(g,10);expect(fs.repairJob).toBeNull();expect(job().phase).toBe("waiting");expect(job().progress).toBeCloseTo(1/3);
    p.x=n.x-30;answer("SEND ADA");expect(p.cargo.parts).toBe(2);fs.updateRepairJob(g,30);expect(job().phase).toBe("report");expect(p.credits).toBe(1000);
  });
  it("requires fit crew and current supplies, and refuses obsolete or repeated actions",()=>{
    const {g,p,n,fs,offer,answer,job}=fixture();const e=offer(),send=e.options.find(o=>o.label.includes("SEND ADA"))!;
    p.cargo.parts=0;expect(send.result(g,new RNG(1))).toContain("NO LONGER AVAILABLE");expect(p.support).toBeUndefined();
    p.cargo.parts=2;p.crew[0].sick={kind:"flu",until:99};expect(send.result(g,new RNG(1))).toContain("CLOSED");expect(p.cargo.parts).toBe(2);
    delete p.crew[0].sick;answer("SEND ADA");const id=job().id;fs.updateRepairJob(g,45);const credits=p.credits;
    fs.finishRepair(g,n,"Ada");expect(p.credits).toBe(credits);expect(job().id).toBe(id);expect(p.repairs).toBe(1);
  });
  it("retains generated deck progress after returning and reloading",()=>{
    const {g,p,n,answer,job}=fixture();answer("TRANSFER 2 SPARE");g.repairTarget=n;
    const repair=g.scenes.repair as RepairScene;repair.enter(g);repair.health.E=79;snapshotSupport(g.world,n);
    const loaded=decodeSave(JSON.stringify(g.world)).world!;expect(loaded).not.toBeNull();expect(loaded.player.support?.jobs[0].ship.repairInterior?.health.E).toBe(79);
    expect(loaded.player.support?.jobs[0].ship.repairInterior?.seed).toBe(repair.progress.seed);expect(job().supplied).toBe(true);expect(p.cargo.parts).toBe(2);
  });
  it("uses the delivered repair kit without silently consuming more parts aboard",()=>{
    const {g,p,n,answer}=fixture();answer("TRANSFER 2 SPARE");g.repairTarget=n;
    const repair=g.scenes.repair as RepairScene;repair.enter(g);
    const panel=repair.layout.systems[0];repair.health[panel.ch]=0;
    repair.px=panel.tx*10+5;repair.py=panel.ty*10+15;
    g.input.isDown=(key:string)=>key==="e";
    repair.update(g,.1);
    expect(repair.health[panel.ch]).toBeGreaterThan(0);expect(p.cargo.parts).toBe(2);
  });
  it("pauses saved work when the worker is unavailable and never spawns mandatory attackers",()=>{
    const {g,p,fs,answer,job}=fixture();const raid=vi.spyOn(fs,"spawnRaidersNearPlayer").mockImplementation(()=>{});
    answer("SEND ADA");fs.updateRepairJob(g,10);const progress=job().progress;p.crew=[];fs.updateRepairJob(g,100);
    expect(job().progress).toBe(progress);expect(job().phase).toBe("waiting");expect(p.credits).toBe(600);expect(raid).not.toHaveBeenCalled();
  });
  it("keeps working progress and supplied parts when a loaded population is rebuilt",()=>{
    const {g,fs,answer,job}=fixture();answer("SEND ADA");fs.updateRepairJob(g,20);const progress=job().progress;
    g.world=decodeSave(JSON.stringify(g.world)).world!;fs.npcs=[];fs.repairJob=null;restoreSupport(fs,g);
    expect(g.world.player.support?.jobs[0]).toMatchObject({phase:"waiting",supplied:true,progress});expect(fs.npcs).toHaveLength(1);expect(fs.repairJob).toBeNull();
  });
  it("closes lost and released work without payment and bounds the accepted list",()=>{
    const {g,p,fs,n,answer,job}=fixture();answer("RETURN WITH SUPPLIES");n.hull=0;syncSupport(fs,g);expect(job().phase).toBe("lost");expect(p.credits).toBe(600);
    for(let i=0;i<4;i++){const other={...n,supportId:undefined,name:`Other ${i}`,hull:30};expect(acceptSupport(g.world,other)).not.toBeNull();}
    expect(p.support?.jobs.filter(activeSupport)).toHaveLength(4);expect(acceptSupport(g.world,{...n,supportId:undefined,hull:30})).toBeNull();
    fs.npcs=[];restoreSupport(fs,g);expect(fs.npcs.some(x=>x.supportId===job().id)).toBe(false);
    const separate=fixture();separate.answer("TRANSFER 2 SPARE");separate.answer("RELEASE THIS");expect(separate.p.support?.jobs[0].phase).toBe("released");expect(separate.p.cargo.parts).toBe(2);
  });
  it.each([[0.1,"fuel"],[0.4,"medical"],[0.9,"repair"]] as const)("offers a local %s aid call in peaceful space without online events or attackers",(roll,kind)=>{
    const {g,fs,sys}=fixture();sys.pirateActivity=0;fs.npcs=[];fs.sosTimer=0;vi.spyOn(Math,"random").mockReturnValue(roll);
    updateSos(fs,g,1);expect(fs.sos?.pirates).toHaveLength(0);const n=fs.sos!.trader;expect(acceptSupport(g.world,n)?.kind).toBe(kind);
  });
  it("refusal creates no commitment, and missing destinations resolve explicitly",()=>{
    const {g,p,answer,job}=fixture();answer("LEAVE THEM");expect(p.support).toBeUndefined();answer("RETURN WITH SUPPLIES");const id=job().systemId;
    delete g.world.systems[id];reconcileSupport(g.world);expect(job().phase).toBe("lost");expect(job().outcome).toContain("no longer available");
  });
});

describe("medical transfer and fuel routes",()=>{
  it("stabilises casualties once, reserves a berth and records an actual hospital handoff once",()=>{
    const {g,p,fs,n,answer,job,dock,station}=fixture("medical");answer("SEND LIN");expect(p.cargo.med).toBe(2);fs.updateRepairJob(g,30);
    expect(job()).toMatchObject({phase:"transfer",paid:true,progress:1});expect(p.credits).toBe(900);expect(p.lives).toBe(2);expect(n.casualties).toBe(true);
    p.missions=[{id:"booked",kind:"passenger",accepted:true,done:false,party:1} as Mission];expect(supportBerths(g.world)).toBe(0);
    expect(answer("CRITICAL PATIENT")).toContain("NO LONGER AVAILABLE");expect(p.evacuees).toBeFalsy();
    p.missions=[];answer("CRITICAL PATIENT");expect(p.evacuees).toMatchObject({n:1,from:"wounded",supportId:job().id});expect(passengerCap(p)).toBe(0);
    dock();expect(p.evacuees).toBeNull();expect(p.lives).toBe(3);expect(job().phase).toBe("complete");expect(p.lastSupportReceipt?.title).toContain("Patient handed over");
    const credits=p.credits,lives=p.lives;station.enter(g);station.enter(g);expect(p.credits).toBe(credits);expect(p.lives).toBe(lives);expect(passengerCap(p)).toBe(1);
    const loaded=decodeSave(JSON.stringify(g.world)).world!;expect(loaded.player.lastSupportReceipt).toEqual(p.lastSupportReceipt);
  });
  it("does not claim a hospital transfer when the patient is missing",()=>{
    const {g,p,fs,answer,job,st}=fixture("medical");answer("SEND LIN");fs.updateRepairJob(g,30);answer("CRITICAL PATIENT");p.evacuees=null;
    beginDockVisit(g.world,st.id);expect(closeSupportAtPort(g.world,st.id)).toBe(false);reconcileSupport(g.world);expect(job().phase).toBe("lost");expect(p.lastSupportReceipt).toBeUndefined();
  });
  it("pays fuel aid once, keeps the report through load, and closes it at port without another aid payment",()=>{
    const {g,p,fs,n,offer,job,dock,station}=fixture("fuel"),enc=offer(),give=enc.options.find(o=>o.label.includes("PASS TEN"))!;
    give.result(g,new RNG(1));expect(p.fuel).toBe(20);expect(p.credits).toBe(900);expect(fs.npcs).not.toContain(n);expect(job().phase).toBe("report");
    give.result(g,new RNG(1));expect(p.fuel).toBe(20);expect(p.credits).toBe(900);
    g.world=decodeSave(JSON.stringify(g.world)).world!;fs.npcs=[];restoreSupport(fs,g);expect(fs.npcs).toHaveLength(0);dock();
    const credits=g.world.player.credits;station.enter(g);expect(g.world.player.credits).toBe(credits);expect(g.world.player.support?.jobs[0].phase).toBe("complete");expect(journeyBriefing(g.world).completed).toContain("support");
  });
  it("restores a tow, lets E request docking, and pays its handoff once after load",()=>{
    const {g,p,fs,n,answer,job,st,station}=fixture("fuel");answer("TOW THEM");expect(fs.towing).toBe(n);
    const sx=Math.cos(st.angle)*st.orbit,sy=Math.sin(st.angle)*st.orbit;p.x=sx;p.y=sy;n.x=sx+70;n.y=sy;snapshotSupport(g.world,n);
    expect(flightInteraction(fs,g)?.kind).toBe("station");g.world=decodeSave(JSON.stringify(g.world)).world!;fs.npcs=[];fs.towing=null;restoreSupport(fs,g);expect(fs.towing?.supportId).toBe(job().id);
    restoreSupport(fs,g);expect(g.world.player.support?.jobs[0].phase).toBe("tow");
    beginDockVisit(g.world,st.id);g.setScene("station");expect(g.world.player.tows).toBe(1);expect(g.world.player.support?.jobs[0]).toMatchObject({phase:"complete",paid:true});
    const credits=g.world.player.credits;station.enter(g);expect(g.world.player.credits).toBe(credits);expect(g.world.player.tows).toBe(1);
  });
  it("leaves a broken tow at its saved position and never silently teleports it to the ship",()=>{
    const {g,p,fs,n,answer,job}=fixture("fuel");answer("TOW THEM");p.x-=500;fs.updateTow(g,.1);syncSupport(fs,g);expect(job().phase).toBe("waiting");const x=job().ship.x;
    g.world=decodeSave(JSON.stringify(g.world)).world!;fs.npcs=[];restoreSupport(fs,g);expect(fs.npcs[0].x).toBe(x);expect(fs.towing).toBeNull();
  });
});

describe("support save and read boundaries",()=>{
  it("keeps readers and maps read only and displays exact supplies and berth requirements",()=>{
    const {g,answer,job}=fixture("medical");answer("RETURN WITH SUPPLIES");const before=JSON.stringify(g.world);expect(supportTerms(g.world,job()).join(" ")).toContain("one free passenger berth");questLocations(g.world);systemContacts(g);
    g.scene=g.scenes.journey;updateVoyageSystems(g,200);expect(JSON.stringify(g.world)).toBe(before);
  });
  it("rejects malformed progress, duplicate identities, oversized lists and invalid decks",()=>{
    const {g,answer,job}=fixture();answer("RETURN WITH SUPPLIES");expect(validSupport(g.world.player.support)).toBe(true);
    const original=JSON.stringify(g.world.player.support);
    for(const mutation of [(s:any)=>s.jobs[0].progress=-1,(s:any)=>s.jobs[0].progress=2,(s:any)=>s.jobs.push(s.jobs[0]),(s:any)=>s.serial=-1,(s:any)=>s.jobs[0].ship=null,(s:any)=>s.jobs[0].ship.repairInterior={seed:1,health:{E:-10},fires:[]}]){const s=JSON.parse(original);mutation(s);expect(validSupport(s)).toBe(false);}
    job().progress=NaN;expect(decodeSave(JSON.stringify(g.world)).world).toBeNull();
  });
});
