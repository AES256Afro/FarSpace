import { OrbitScene } from "../src/scenes/orbit";
import { describe, it, expect } from "vitest";
import { generateWorld, type Mission } from "../src/world";
import { questLocations } from "../src/core/questlocations";
import { SystemMap, systemContacts } from "../src/scenes/systemmap";
import { GalaxyScene } from "../src/scenes/galaxy";
import type { Game } from "../src/game";

function fixture() {
  const world=generateWorld(436,{realGalaxy:false}), p=world.player;
  p.story=0; p.story2=-1; p.story3=-1; p.missions=[]; p.crew=[]; p.cargo={}; p.dockedAt=null;
  const systems=Object.values(world.systems).filter(s=>s.stations.length && s.planets.length);
  const from=systems[0], to=systems.find(s=>s.id!==from.id)!; p.systemId=to.id;
  const g={world,scenes:{flight:{localTarget:null}},input:{wasPressed:()=>false},toast:()=>{}} as unknown as Game;
  const mission=(fields:Partial<Mission>={}) => ({id:"quest",kind:"delivery",title:"A named contract",desc:"",fromStationId:from.stations[0].id,targetStationId:to.stations[0].id,targetSystemId:to.id,reward:100,accepted:true,done:false,...fields}) as Mission;
  return {world,p,from,to,g,mission};
}

describe("quest locations",()=>{
  it("includes only accepted unfinished contracts and does not mutate the voyage",()=>{
    const {world,p,mission}=fixture();p.missions=[mission({accepted:false}),mission({id:"done",done:true}),mission({id:"active",commodityId:"parts",qty:2})];
    const before=JSON.stringify(world), quests=questLocations(world);
    expect(quests).toHaveLength(1);expect(quests[0].id).toBe("mission:active");expect(JSON.stringify(world)).toBe(before);
  });
  it("explains required supplies and marks the correct delivery as ready",()=>{
    const {world,p,to,mission}=fixture();p.missions=[mission({commodityId:"parts",qty:2})];
    expect(questLocations(world)[0]).toMatchObject({systemId:to.id,contactId:`station:${to.stations[0].id}`});
    expect(questLocations(world)[0].action).toContain("ABOARD 0");p.cargo.parts=2;
    expect(questLocations(world)[0]).toMatchObject({ready:true,contactId:`station:${to.stations[0].id}`});
  });
  it("switches a bounty from the target system to its issuing station",()=>{
    const {world,p,from,to,mission}=fixture();const m=mission({kind:"bounty",killsNeeded:3,kills:2});p.missions=[m];
    expect(questLocations(world)[0]).toMatchObject({systemId:to.id});expect(questLocations(world)[0].contactId).toBeUndefined();
    m.kills=3;expect(questLocations(world)[0]).toMatchObject({systemId:from.id,contactId:`station:${from.stations[0].id}`,ready:true});
  });
  it("points ground work at a planet before switching to the delivery station",()=>{
    const {world,p,to,mission}=fixture();const m=mission({kind:"ground",groundPlanetIdx:0,groundGoal:"flora",groundNeed:3,groundDone:1});p.missions=[m];
    expect(questLocations(world)[0].contactId).toBe("planet:0");m.groundDone=3;
    expect(questLocations(world)[0]).toMatchObject({contactId:`station:${to.stations[0].id}`,ready:true});
  });
  it("returns a finished observation to the issuer",()=>{
    const {world,p,from,mission}=fixture();const m=mission({kind:"observe",sightPlanetIdx:0});p.missions=[m];
    expect(questLocations(world)[0].contactId).toBe("planet:0");m.patrolDone=true;
    expect(questLocations(world)[0]).toMatchObject({systemId:from.id,ready:true});
  });
  it("follows a tourist detour before the passenger destination",()=>{
    const {world,p,from,to,mission}=fixture();const m=mission({kind:"passenger",passengerKind:"tourist",sightSystemId:from.id,sightPlanetIdx:0});p.missions=[m];
    expect(questLocations(world)[0]).toMatchObject({systemId:from.id,contactId:"planet:0"});m.sightSeen=true;
    expect(questLocations(world)[0]).toMatchObject({systemId:to.id,contactId:`station:${to.stations[0].id}`});
  });
  it("keeps undiscovered signals as search areas and returns claimed work to the issuer",()=>{
    const {world,p,from,to,g,mission}=fixture();const a={id:"hidden",name:"Hidden",x:80000,y:80000,kind:"cache" as const,discovered:false,claimed:false,reward:1};to.anomalies=[a];p.missions=[mission({kind:"research",anomalyId:a.id})];
    expect(questLocations(world)[0].contactId).toBeUndefined();expect(systemContacts(g).some(c=>c.id==="signal:hidden")).toBe(false);
    a.discovered=true;expect(questLocations(world)[0].contactId).toBe("signal:hidden");
    a.claimed=true;expect(questLocations(world)[0]).toMatchObject({systemId:from.id,ready:true});
  });
  it("marks only the active story stage and its exact ruin",()=>{
    const {world,p,to}=fixture();p.storyTarget={systemId:to.id,planetIdx:0,poiId:"ruin-quest"};p.story=1;
    expect(questLocations(world)).toHaveLength(0);p.story=2;
    expect(questLocations(world)[0]).toMatchObject({contactId:"planet:0",poiId:"ruin-quest"});p.story=7;expect(questLocations(world)).toHaveLength(0);
  });
  it("shows disclosed quest wrecks outside scanner range without disclosing unrelated wrecks",()=>{
    const {world,p,to,g}=fixture();p.hullId="scout";p.modules=[];p.x=0;p.y=0;
    const a={id:"quest-wreck",name:"Known old ship",x:90000,y:90000,hazard:0,looted:false,loot:[]};to.wrecks=[a,{...a,id:"unrelated"}];
    p.keeper={systemId:to.id,wreckSystemId:to.id,wreckId:a.id,contactId:"later"};p.story3=0;
    expect(systemContacts(g).some(c=>c.id==="wreck:quest-wreck")).toBe(false);p.story3=1;
    const contacts=systemContacts(g);expect(contacts.find(c=>c.id==="wreck:quest-wreck")?.quests).toHaveLength(1);expect(contacts.some(c=>c.id==="wreck:unrelated")).toBe(false);
    expect(questLocations(world)[0].title).toContain("Keeper");
  });
  it("uses a crew journey's current stage and removes completed journeys",()=>{
    const {world,p,from,to}=fixture();const generated=generateWorld(123).player.crew[0];
    to.wrecks.push({ ...to.wrecks[0], id: "old-ship" });
    p.crew=[{...generated,name:"Alex",role:"engineer",arc:{id:"engineer",stage:0,targetSystemId:to.id,targetStationId:from.stations[0].id,wreckId:"old-ship"}}];
    expect(questLocations(world)[0].contactId).toBe("wreck:old-ship");p.crew[0].arc!.stage=1;
    expect(questLocations(world)[0]).toMatchObject({systemId:from.id,contactId:`station:${from.stations[0].id}`});
    p.crew[0].arc!.done=true;expect(questLocations(world)).toHaveLength(0);
  });
  it("keeps a selected quest site visible in orbit until manual selection",()=>{
    const {world,p,g,to}=fixture(), orbit=new OrbitScene(), pl=to.planets[0], poi=pl.surface!.pois[1];
    p.story=2;p.storyTarget={systemId:to.id,planetIdx:0,poiId:poi.id};g.orbitPlanetIdx=0;
    const keys=new Set(["q"]);Object.assign(g.input,{wasPressed:(k:string)=>keys.has(k),isDown:()=>false});
    orbit.update(g,.05);expect(orbit.sel).toBe(1);expect(orbit.questFocus).toBe(true);const rotation=orbit.rot;
    keys.clear();orbit.update(g,5);expect(orbit.rot).toBe(rotation);expect(orbit.project(poi.lat,poi.lon)).not.toBeNull();
    keys.add("ArrowDown");orbit.update(g,.05);expect(orbit.questFocus).toBe(false);
  });
  it("changes council markers when the reply needs to go home",()=>{
    const {world,p,from,to}=fixture();p.council={stationId:from.stations[0].id,ballots:[],mandate:{week:"1",fromStationId:from.stations[0].id,targetStationId:to.stations[0].id,resolution:"Help",stage:"outbound"}};
    expect(questLocations(world)[0].systemId).toBe(to.id);p.council.mandate!.stage="return";expect(questLocations(world)[0].systemId).toBe(from.id);
  });
  it("changes service markers to the report station",()=>{
    const {world,p,from,to}=fixture();p.service={factionId:from.factionId,stationId:from.stations[0].id,joinedAt:0,serial:1,completed:0,history:[],order:{id:"order",serial:1,kind:"liaison",fromStationId:from.stations[0].id,targetSystemId:to.id,targetStationId:to.stations[0].id,title:"Service audience",description:"Visit the office",pay:100,need:1,progress:0,stage:"outbound"}};
    expect(questLocations(world)[0].systemId).toBe(to.id);p.service.order!.stage="return";expect(questLocations(world)[0].systemId).toBe(from.id);
  });
  it("prioritizes quest contacts and filters without changing quest progress or plotting",()=>{
    const {world,p,g,mission}=fixture();p.missions=[mission({commodityId:"parts",qty:2})];const map=new SystemMap();map.filter="QUEST";
    const before=JSON.stringify(world), contacts=map.contacts(g);expect(contacts).toHaveLength(1);expect(contacts[0].quests).toHaveLength(1);expect(p.navTarget).toBeFalsy();expect(JSON.stringify(world)).toBe(before);
  });
  it("lists complete quest instructions before general galaxy details",()=>{
    const {p,g,to,mission}=fixture();p.missions=[mission({commodityId:"parts",qty:2})];const galaxy=new GalaxyScene();galaxy.selected=to.id;
    const text=galaxy.infoLines(g).map(l=>l.text).join(" ");expect(text.indexOf("QUEST OBJECTIVES")).toBeLessThan(text.indexOf("STANDING"));expect(text).toContain("A NAMED CONTRACT");expect(text).toContain("BRING 2 SPARE PARTS");
    galaxy.questOnly=true;expect(galaxy.results(g).map(s=>s.id)).toEqual([to.id]);
  });
});
