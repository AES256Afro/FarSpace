import * as wire from "../../core/wire";
import { RNG } from "../../core/rng";
import type { Game } from "../../game";
import type { FlightScene } from "./index";
import type { Npc } from "./types";
import type { Encounter } from "../../data/encounters";
import type { EncounterScene } from "../encounter";
import { acceptSupport, activeSupport, endSupport, snapshotSupport, supportAtShip, supportBerths, supportShip, supportTerms, type SupportJob } from "../../core/supportjobs";
import { flightInteraction } from "./interaction";
import { recoveryTow } from "../../core/shiprecovery";
import { logEntry, removeCargo } from "../../world";
import { flag } from "../../core/achievements";

export function restoreSupport(fs: FlightScene, g: Game): void {
  const w=g.world,p=w.player;
  for(const j of p.support?.jobs??[]) {
    if(!activeSupport(j)||j.phase==="report"||j.systemId!==p.systemId)continue;
    if(!w.systems[j.systemId]||j.ship.hull<=0){endSupport(w,j,"lost","The support ship was lost.");continue;}
    let n=fs.npcs.find(n=>n.supportId===j.id);
    if(!n) {
      n=fs.npcs.find(n=>!n.supportId&&n.kind==="trader"&&n.name===j.name);
      if(n)Object.assign(n,supportShip(w,j));
      else {n=supportShip(w,j);fs.npcs.push(n);}
    }
    if(j.phase==="working") {j.phase="waiting";delete j.worker;}
    if(j.phase==="tow") {
      if(fs.towing===n)continue;
      if(!fs.towing&&!recoveryTow(w)&&Math.hypot(n.x-p.x,n.y-p.y)<=420)fs.towing=n;
      else j.phase="waiting";
    }
  }
}

export function syncSupport(fs: FlightScene, g: Game): void {
  for(const j of g.world.player.support?.jobs??[]) {
    if(!activeSupport(j)||j.phase==="report"||j.systemId!==g.world.player.systemId)continue;
    const n=fs.npcs.find(n=>n.supportId===j.id);
    if(!n||n.hull<=0) {endSupport(g.world,j,"lost","The support ship was lost. No further aid payment is due.");continue;}
    snapshotSupport(g.world,n);
    if(j.phase==="tow"&&fs.towing!==n)j.phase="waiting";
  }
}

export function pauseSupportWork(fs: FlightScene, g: Game): void {
  const job=fs.repairJob,j=job&&supportAtShip(g.world,job.npc);
  if(!job||!j)return;
  j.progress=job.progress;j.phase="waiting";delete j.worker;fs.repairJob=null;snapshotSupport(g.world,job.npc);
}

export function offerSupport(fs: FlightScene, g: Game, n: Npc): void {
  const w=g.world,p=w.player,systemId=p.systemId,j=supportAtShip(w,n);
  const kind=j?.kind??(n.casualties?"medical":n.mayday?"fuel":"repair");
  const initial=JSON.stringify([n.hull,n.disabled,n.casualties,n.mayday,j?.phase,p.crew,p.evacuees]);
  let used=false;
  const options: Encounter["options"]=[];
  const fit=(role:"engineer"|"medic")=>p.crew.find(c=>c.role===role&&!c.sick);
  const supplied=()=>supportAtShip(w,n)?.supplied===true;
  const resource=kind==="medical"?"med":"parts";
  const supplies=()=>supplied()||(p.cargo[resource]??0)>=2;
  const claim=()=>{const job=acceptSupport(w,n);if(job&&fs.sos?.trader===n)fs.sos=null;return job;};
  const spend=(job:SupportJob)=>{if(!job.supplied){removeCargo(p,resource,2);job.supplied=true;}};
  const option=(label:string,hint:string,requires:()=>boolean,result:()=>string)=>options.push({label,hint,requires,result});
  const finish=(text:string)=>{snapshotSupport(w,n);g.autosave?.();return text;};
  if(j&&(!activeSupport(j)||j.phase==="report")) {
    option("CLOSE",j.outcome??"This request has closed.",()=>true,()=>"This request has closed.");
  } else {
    if(!j) option("I'LL RETURN WITH SUPPLIES","Keep this ship on your maps and in your save. Up to four accepted requests.",()=>true,()=>claim()?finish("REQUEST ACCEPTED. THE SHIP AND ITS POSITION ARE RECORDED. F4 SHOWS ITS REQUIREMENTS."):"YOUR AID LIST IS FULL OR NO PORT IS AVAILABLE. NO REQUEST ACCEPTED.");
    if(kind!=="fuel"&&j?.phase!=="transfer") {
      if(!supplied()) option(kind==="medical"?"TRANSFER 2 MED SUPPLIES":"TRANSFER 2 SPARE PARTS","Deliver supplies now; crew work can follow after you return.",()=>supplies(),()=>{
        const job=claim();if(!job)return "NO ROOM FOR ANOTHER AID REQUEST.";spend(job);return finish("SUPPLIES DELIVERED. THEY STAY WITH THIS SHIP. RETURN WITH A FIT CREW MEMBER TO FINISH THE WORK.");
      });
      const role=kind==="medical"?"medic":"engineer",c=fit(role);
      option(c?`SEND ${c.name.toUpperCase()} (${role.toUpperCase()})`:`FIT ${role.toUpperCase()} REQUIRED`,`${kind==="medical"?"Stabilise the casualties":"Restore the engines"}. Two supplies once; stay within 200m. Work pauses if you leave.`,()=>!!fit(role)&&supplies()&&!fs.repairJob,()=>{
        const job=claim(),worker=fit(role);if(!job||!worker)return "THE CREW OR REQUEST IS NO LONGER AVAILABLE.";
        spend(job);job.phase="working";job.worker=worker.name;
        fs.repairJob={npc:n,crewName:worker.name,progress:job.progress,need:(kind==="medical"?30:45)/(.6+.4*worker.skill),wave:9,kind:kind==="medical"?"medic":"repair"};
        return finish(`${worker.name.toUpperCase()} CROSSES. STAY WITHIN 200M. PROGRESS WILL BE KEPT IF YOU LEAVE.`);
      });
      if(kind==="repair")option("BOARD AND REPAIR IT YOURSELF","Deliver two parts once, then repair the generated deck. Progress stays with this ship.",()=>supplies()&&!fs.repairJob,()=>{
        const job=claim();if(!job)return "NO ROOM FOR ANOTHER AID REQUEST.";spend(job);g.repairTarget=n;
        setTimeout(()=>{if(g.world===w&&g.repairTarget===n&&activeSupport(job))g.setScene("repair");},0);
        return finish("");
      });
    }
    if(kind==="medical"&&j?.phase==="transfer")option("TAKE THE CRITICAL PATIENT ABOARD","Fit medic and one free passenger berth. The other two casualties are stable. Dock for hospital transfer and 200cr.",()=>!!fit("medic")&&!p.evacuees&&supportBerths(w)>=1,()=>{
      const job=claim();if(!job)return "THE REQUEST IS NO LONGER AVAILABLE.";
      p.evacuees={n:1,from:"wounded",supportId:job.id};n.casualties=false;n.disabled=false;job.phase="report";
      return finish("ONE PATIENT ABOARD. THEIR BERTH IS RESERVED. DOCK AT A PORT FOR HOSPITAL TRANSFER.");
    });
    if(kind==="fuel")option("PASS TEN UNITS OF FUEL ON A LINE","At least 15 fuel aboard. Transfer 10; the Pilots' Fund pays 300cr. Dock afterward to close the report.",()=>p.fuel>=15&&!j?.paid,()=>{
      const job=claim();if(!job||job.paid)return "THIS FUEL REQUEST HAS ALREADY BEEN ANSWERED.";
      p.fuel-=10;job.paid=true;job.phase="report";fs.thankYou(g,n,300);p.rescues=(p.rescues??0)+1;
      flag(g,"fuelrat");logEntry(w,`Answered ${n.name}'s mayday with fuel`);void wire.post("rescue",`answered ${n.name}'s mayday with fuel`,w.systems[p.systemId].name);if(fs.towing===n)fs.towing=null;fs.npcs=fs.npcs.filter(other=>other!==n);if(fs.sos?.trader===n)fs.sos=null;
      return finish("FUEL TRANSFERRED. THE FUND PAYS 300CR. DOCK TO CLOSE THE AID REPORT.");
    });
    if(kind!=="medical")option("TOW THEM TO A STATION","550cr on arrival. Keep the line within 420m. No cruise or jumps. A broken line can be attached again.",()=>!fs.towing&&!recoveryTow(w)&&!fs.repairJob&&!j?.paid,()=>{
      const job=claim();if(!job)return "NO ROOM FOR ANOTHER AID REQUEST.";job.phase="tow";n.disabled=true;fs.towing=n;
      return finish("TOW ATTACHED. DOCK AT A STATION TO HAND OVER THE SHIP.");
    });
    if(j&&!j.paid&&j.phase==="waiting")option("RELEASE THIS REQUEST","Close your commitment. Delivered supplies are not returned.",()=>true,()=>{endSupport(w,j,"released","Request released by the captain. Delivered supplies remain aboard the freighter.");delete n.supportId;return finish("REQUEST RELEASED.");});
    option("LEAVE THEM",j?"The accepted request stays on your maps. No work progresses while you are away.":"No commitment and no payment.",()=>true,()=>j?"REQUEST KEPT. RETURN WHEN YOU ARE READY.":"NO REQUEST ACCEPTED. YOU BREAK OFF.");
  }
  const terms=j?supportTerms(w,j):kind==="repair"?["Engines are dead. Two spare parts and an engineer will restore them. You can also board and do the repair yourself. Repair pays 400cr; tow delivery pays 550cr."]
    :kind==="medical"?["Three casualties need two medical supplies and a fit medic. Stabilisation pays 300cr. The critical patient then needs one free passenger berth and a medic for transfer to a port, which pays 200cr."]
    :["Tanks are dry. Ten fuel will get the transport moving. Keep at least five for yourself. Fuel aid pays 300cr; towing to a port pays 550cr."];
  const enc:Encounter={id:"support-call",where:"space",title:`${kind.toUpperCase()} REQUEST / ${n.name??"FREIGHTER"}`,weight:0,text:terms.join("\n\n"),options:options.map(o=>({...o,result:(g2)=>{
    const selected=flightInteraction(fs,g2);
    if(used||g2.world!==w||p.systemId!==systemId||!fs.npcs.includes(n)||n.hull<=0||selected?.kind!=="help"||selected.target!==n||JSON.stringify([n.hull,n.disabled,n.casualties,n.mayday,j?.phase,p.crew,p.evacuees])!==initial)return "THIS HELP CALL HAS CLOSED. HAIL AGAIN IF THE SHIP STILL NEEDS YOU.";
    if(o.requires&&!o.requires(g2))return "THAT AID IS NO LONGER AVAILABLE. YOUR SUPPLIES STAY ABOARD.";
    used=true;return o.result(g2,new RNG((w.seed ^ Math.floor(w.time*31))>>>0));
  }}))};
  (g.scenes.encounter as EncounterScene).open(g,enc,"flight",true);
}
