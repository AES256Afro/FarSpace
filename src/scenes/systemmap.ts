import type { Game } from "../game";
import { drawText } from "../gfx/font";
import { PAL } from "../gfx/palette";
import { hasModule } from "../data/modules";
import { hull } from "../data/hulls";
import { SYSTEM_SIZE, infraAt, infraLit, stormBlind, wondersIn } from "../world";
import { singersBerth } from "../core/singers";
import { MapCamera, MAP_RECT, PANEL_RECT, contains, drawMapLabels, mapFrame, mapButton, clippedText, type MapLabel, type PlacedLabel } from "../core/mapview";
import type { FlightScene } from "./flight/index";

export interface LocalMapTarget { systemId: string; id: string }
export interface SystemContact { id: string; name: string; kind: string; x: number; y: number; color: string; detail: string; range: number }
export function systemContacts(g: Game, knownTarget?: string): SystemContact[] {
  const p = g.world.player, sys = g.world.systems[p.systemId];
  const out: SystemContact[] = [];
  for (const s of sys.stations) out.push({ id: `station:${s.id}`, name: s.name, kind: "STATION", x: Math.cos(s.angle)*s.orbit, y: Math.sin(s.angle)*s.orbit, color: s.military ? PAL.danger : PAL.ui, detail: s.military ? "MILITARY DOCK" : "DOCK / TRADE / REPAIR", range: 80 });
  sys.planets.forEach((pl,i) => out.push({ id: `planet:${i}`, name: pl.name, kind: "PLANET", x: Math.cos(pl.angle)*pl.orbit, y: Math.sin(pl.angle)*pl.orbit, color: PAL.grey, detail: "APPROACH TO ENTER ORBIT", range: pl.radius+70 }));
  for (const j of sys.jumpPoints) out.push({ id:`gate:${j.id}`, name:g.world.systems[j.targetSystemId].name, kind:"GATE", x:j.x,y:j.y,color:PAL.info,detail:`JUMP TO ${g.world.systems[j.targetSystemId].name.toUpperCase()}`,range:45 });
  const wreckRange = hasModule(p,"fss") || hull(p.hullId).scanner ? Infinity : 1500;
  for (const w of sys.wrecks) if (!w.looted && (Math.hypot(w.x-p.x,w.y-p.y)<wreckRange || knownTarget === `wreck:${w.id}`)) out.push({ id:`wreck:${w.id}`,name:w.name,kind:"WRECK",x:w.x,y:w.y,color:PAL.warn,detail:w.boarding?.survivor && !w.boarding.rescued ? "SURVIVOR ABOARD" : `BOARD / SALVAGE / HAZARD ${Math.round(w.hazard*100)}%`,range:35 });
  for (const a of sys.anomalies) if (a.discovered && !a.claimed) out.push({ id:`signal:${a.id}`,name:a.name,kind:"SIGNAL",x:a.x,y:a.y,color:PAL.info,detail:a.kind === "derelict" ? "DERELICT / BOARDABLE" : "APPROACH TO INVESTIGATE",range:35 });
  for (const i of infraAt(g.world,sys.id)) out.push({ id:`infra:${i.id}`,name:i.kind.toUpperCase(),kind:"STRUCTURE",x:i.x,y:i.y,color:infraLit(i) ? PAL.gold : PAL.danger,detail:infraLit(i) ? "OPERATIONAL" : "POWER OFFLINE",range:60 });
  for (const w of wondersIn(g.world,sys.id)) if (w.seen || p.flags?.[`rumour:${w.id}`]) out.push({ id:`wonder:${w.id}`,name:w.seen ? w.name : "RUMOURED SITE",kind:"SIGNAL",x:w.x,y:w.y,color:PAL.gold,detail:w.kind.toUpperCase(),range:100 });
  const berth = singersBerth(g.world);
  if (berth) out.push({ id:"singers",name:"SINGERS' BERTH",kind:"STATION",...berth,color:PAL.ui,detail:"APPROACH TO VISIT",range:60 });
  return out;
}
export function resolveLocalTarget(g: Game, target: LocalMapTarget | null): SystemContact | null {
  if (!target || target.systemId !== g.world.player.systemId || stormBlind(g.world,target.systemId)) return null;
  return systemContacts(g, target.id).find(c=>c.id===target.id) ?? null;
}

const FILTERS = ["ALL","STATION","WRECK","SIGNAL","GATE","PLANET"];
export class SystemMap {
  camera = new MapCamera();
  selected: string | null = null;
  filter = "ALL";
  scroll = 0;
  labels: PlacedLabel[] = [];
  contacts(g: Game): SystemContact[] { return systemContacts(g).filter(c=>this.filter==="ALL" || c.kind===this.filter).sort((a,b)=>a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name)); }
  fit(g: Game): void {
    const p=g.world.player;
    this.camera.fit([{x:-SYSTEM_SIZE,y:-SYSTEM_SIZE},{x:SYSTEM_SIZE,y:SYSTEM_SIZE},{x:p.x,y:p.y},...systemContacts(g)]);
  }
  enter(g: Game): void { this.fit(g); this.selected = (g.scenes.flight as FlightScene).localTarget?.id ?? null; this.scroll=0; this.filter="ALL"; }
  update(g: Game, dt: number): void {
    const inp=g.input, fs=g.scenes.flight as FlightScene;
    if (inp.wasPressed("Escape") || inp.wasPressed("Tab")) { fs.mapOpen=false; return; }
    if (inp.wasPressed("g")) { fs.mapOpen=false; g.setScene("galaxy"); return; }
    if (inp.wasPressed("F5")) g.save();
    if (inp.wasPressed("F9")) { g.load(); return; }
    if (stormBlind(g.world,g.world.player.systemId)) return;
    this.camera.update(inp,dt);
    if (inp.wasPressed("Home") || (inp.mousePressed && contains({x:8,y:231,w:50,h:15},inp.mouseX,inp.mouseY))) this.fit(g);
    if (inp.mousePressed && inp.mouseY>=231 && inp.mouseY<246 && inp.mouseX>=62 && inp.mouseX<302) {
      this.filter=FILTERS[Math.floor((inp.mouseX-62)/40)]; this.scroll=0;
    }
    const contacts=this.contacts(g);
    if (inp.wheel && contains(PANEL_RECT,inp.mouseX,inp.mouseY)) this.scroll+=Math.sign(inp.wheel)*3;
    if (inp.wasPressed("PageDown")) this.scroll+=10;
    if (inp.wasPressed("PageUp")) this.scroll-=10;
    this.scroll=Math.max(0,Math.min(this.scroll,Math.max(0,contacts.length-10)));
    if (inp.wasPressed("[") || inp.wasPressed("]")) {
      const i=contacts.findIndex(c=>c.id===this.selected);
      const next=contacts[(i+(inp.wasPressed("]") ? 1 : contacts.length-1))%contacts.length];
      if (next) { this.selected=next.id; this.camera.x=next.x; this.camera.y=next.y; this.scroll=Math.max(0,contacts.indexOf(next)-9); }
    }
    if (inp.mousePressed && contains(MAP_RECT,inp.mouseX,inp.mouseY)) {
      const label=this.labels.find(l=>contains(l.box,inp.mouseX,inp.mouseY));
      let best=label?.id ?? null, distance=label ? 0 : 9;
      for (const c of contacts) { const at=this.camera.project(c), d=Math.hypot(at.x-inp.mouseX,at.y-inp.mouseY); if (d<distance) { distance=d;best=c.id; } }
      if (best && best!=="you") this.selected=best;
    }
    if (inp.mousePressed && inp.mouseX>=318 && inp.mouseX<466 && inp.mouseY>=91 && inp.mouseY<211) {
      const c=contacts[this.scroll+Math.floor((inp.mouseY-91)/12)];
      if (c) { this.selected=c.id; this.camera.x=c.x; this.camera.y=c.y; }
    }
    if (inp.wasPressed("n") || inp.wasPressed("Enter") || (inp.mousePressed && contains({x:312,y:231,w:160,h:15},inp.mouseX,inp.mouseY))) {
      const target=systemContacts(g).find(c=>c.id===this.selected);
      if (!target) { g.toast("SELECT A DESTINATION FIRST."); return; }
      if (fs.localTarget?.id===target.id) { fs.localTarget=null; fs.autopilot=false; g.toast("LOCAL DESTINATION CLEARED."); }
      else { fs.localTarget={systemId:g.world.player.systemId,id:target.id}; g.world.player.navTarget=null; delete g.world.player.navStationId; g.world.player.singersCourse=false; fs.autopilot=false; g.toast("DESTINATION SET. CLOSE THE MAP AND PRESS N TO FLY THERE."); }
    }
  }
  draw(g: Game, ctx: CanvasRenderingContext2D): void {
    const p=g.world.player, sys=g.world.systems[p.systemId], fs=g.scenes.flight as FlightScene;
    mapFrame(ctx,`SYSTEM MAP / ${sys.name.toUpperCase()}`,"SELECT A CONTACT TO INSPECT IT OR SET A DESTINATION");
    if (stormBlind(g.world,sys.id)) { drawText(ctx,"ION STORM / CHART UNAVAILABLE",20,115,PAL.warn);drawText(ctx,"TAB OR ESC CLOSE / G GALAXY",20,250,PAL.grey);return; }
    const contacts=this.contacts(g), selected=systemContacts(g).find(c=>c.id===this.selected);
    ctx.save();ctx.beginPath();ctx.rect(MAP_RECT.x+1,MAP_RECT.y+1,MAP_RECT.w-2,MAP_RECT.h-2);ctx.clip();
    const origin=this.camera.project({x:0,y:0});ctx.strokeStyle="#172237";
    for (const pl of sys.planets) { ctx.beginPath();ctx.arc(origin.x,origin.y,pl.orbit*this.camera.scale,0,Math.PI*2);ctx.stroke(); }
    ctx.fillStyle=sys.sunColor;ctx.beginPath();ctx.arc(origin.x,origin.y,Math.max(3,sys.sunRadius*this.camera.scale),0,Math.PI*2);ctx.fill();
    const you=this.camera.project(p);
    if (selected) { const at=this.camera.project(selected);ctx.strokeStyle=PAL.gold;ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(you.x,you.y);ctx.lineTo(at.x,at.y);ctx.stroke();ctx.setLineDash([]); }
    const labels:MapLabel[]=[];
    for (const c of contacts) {
      const at=this.camera.project(c);ctx.fillStyle=c.color;ctx.fillRect(at.x-2,at.y-2,4,4);
      if (c.id===this.selected) { ctx.strokeStyle=PAL.white;ctx.strokeRect(at.x-5.5,at.y-5.5,11,11); }
      labels.push({id:c.id,text:c.name.toUpperCase(),...at,color:c.color,priority:c.id===this.selected ? 100 : c.kind==="STATION" ? 60 : c.kind==="WRECK" ? 50 : 0});
    }
    ctx.save();ctx.translate(you.x,you.y);ctx.rotate(p.angle);ctx.fillStyle=PAL.white;ctx.beginPath();ctx.moveTo(6,0);ctx.lineTo(-4,-4);ctx.lineTo(-2,0);ctx.lineTo(-4,4);ctx.closePath();ctx.fill();ctx.restore();
    labels.push({id:"you",text:"YOU",...you,color:PAL.white,priority:90});this.labels=drawMapLabels(ctx,labels);ctx.restore();
    drawText(ctx,clippedText(selected?.name.toUpperCase() ?? "NO DESTINATION SELECTED",146),318,39,PAL.white);
    if (selected) {
      drawText(ctx,`${selected.kind} / ${Math.round(Math.hypot(selected.x-p.x,selected.y-p.y))}M`,318,51,selected.color);
      drawText(ctx,clippedText(selected.detail,146),318,63,PAL.grey);
    } else drawText(ctx,"CLICK A MARKER OR A LIST ROW",318,54,PAL.grey);
    drawText(ctx,`${this.filter} CONTACTS / ${contacts.length}`,318,79,PAL.greyDark);
    contacts.slice(this.scroll,this.scroll+10).forEach((c,i)=>{const y=91+i*12;if(c.id===this.selected){ctx.fillStyle="#20374b";ctx.fillRect(316,y,152,12);}drawText(ctx,clippedText(c.name.toUpperCase(),140),320,y+3,c.color);});
    drawText(ctx,contacts.length ? `${this.scroll+1}..${Math.min(this.scroll+10,contacts.length)} / ${contacts.length} / SCROLL LIST` : "NO CONTACTS IN THIS CATEGORY",318,215,PAL.greyDark);
    mapButton(ctx,{x:8,y:231,w:50,h:15},"HOME FIT");
    FILTERS.forEach((f,i)=>mapButton(ctx,{x:62+i*40,y:231,w:38,h:15},f==="STATION"?"PORTS":f==="PLANET"?"WORLDS":f.slice(0,5),this.filter===f));
    mapButton(ctx,{x:312,y:231,w:160,h:15},fs.localTarget?.id===this.selected ? "N CLEAR DESTINATION" : "N SET DESTINATION",fs.localTarget?.id===this.selected);
    drawText(ctx,"WHEEL ZOOM / RIGHT DRAG OR ARROWS PAN / [ ] SELECT",8,250,PAL.greyDark);
    drawText(ctx,"TAB OR ESC CLOSE / G GALAXY / TIME PAUSED",8,261,PAL.grey);
  }
}
