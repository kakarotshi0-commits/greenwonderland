/* Owner-only disclosure groups. Move existing controls, preserving their handlers and values. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id), groups=[], notes=[];
 const definitions=[
  ['New sale','Record a sale and create an invoice.',()=>[$('posItem')?.closest('.card2')]],
  ['Customer orders','Review, confirm or decline customer orders.',()=>[$('staffOrders')]],
  ['Wheel reward codes','Create a reward code for a customer.',()=>[$('ownerRewardCodes')]],
  ['Daily card settings & customer logins','Rewards, probabilities, Displayable settings and fixed CID codes.',()=>[$('dailyCardsOwner')]],
  ['Player daily rewards','Look up a CID, mark rewards done, or remove and restore reveals.',()=>[$('dailyCardsStaff')]],
  ['Website descriptions','Edit website text and product descriptions.',()=>[$('contentBlock')]],
  ['Products & menu categories','Products, prices, photos, favourites, categories and shared menu access.',()=>[$('catalogAccess'),$('categoryBlock'),$('favAdmin'),$('menuBlock')]],
  ['Employees & permissions','Crew members, sign-in codes and role permissions.',()=>[$('rolesBlock'),$('rosterBlock')]],
  ['Sales & attendance reports','Review employee sales, shifts and clocked-in time.',()=>[$('reportsBlock')]]
 ];
 const isOwner=()=>typeof signedIn!=='undefined'&&!!signedIn&&String(signedIn.role).trim().toLowerCase()==='owner';
 let queued=false,ownerIdentity='';
 const observer=new MutationObserver(schedule);
 function schedule(){if(!queued){queued=true;queueMicrotask(()=>{queued=false;sync();});}}
 function collapseOthers(active){groups.forEach(g=>{if(g.box!==active&&g.box.open)g.box.open=false;});}
 function makeGroup([title,description,find]){
  const nodes=find().filter(Boolean);if(!nodes.length)return;
  const box=document.createElement('details');box.className='gw-owner-category';
  const summary=document.createElement('summary'),label=document.createElement('span'),strong=document.createElement('strong'),sub=document.createElement('span'),icon=document.createElement('span');
  strong.textContent=title;sub.textContent=description;sub.className='gw-owner-category-description';label.append(strong,sub);icon.className='gw-owner-category-icon';icon.setAttribute('aria-hidden','true');icon.textContent='+';summary.append(label,icon);
  const content=document.createElement('div');content.className='gw-owner-category-content';box.append(summary,content);nodes[0].before(box);
  const entries=nodes.map(node=>{const anchor=document.createComment('Owner category original position');node.before(anchor);content.append(node);return {node,anchor};});
  summary.addEventListener('click',event=>{event.preventDefault();const opening=!box.open;if(opening)collapseOthers(box);box.open=opening;});groups.push({box,entries});
 }
 function openTarget(target){if(!isOwner()||!target)return;const box=target.closest('.gw-owner-category');if(box&&!box.hidden){collapseOthers(box);box.open=true;}}
 function openHash(){let target;try{target=$(decodeURIComponent(location.hash.slice(1)));}catch{}openTarget(target);}
 function sync(){
  observer.disconnect();
  if(isOwner()){
   if(!groups.length){
    definitions.forEach(makeGroup);
    for(const host of [$('crewPanel'),document.querySelector('#admin > .wrap')]){
     if(!host)continue;const note=document.createElement('p');note.className='gw-owner-category-note';note.textContent='Owner controls · Choose a category to open it. Only one category stays open at a time.';
     const first=host.querySelector(':scope > .gw-owner-category');if(first){first.before(note);notes.push(note);}
    }
   }
   const identity=String(signedIn.id);if(identity!==ownerIdentity){groups.forEach(g=>g.box.open=false);ownerIdentity=identity;openHash();}
   groups.forEach(g=>{g.box.hidden=g.entries.every(({node})=>node.hidden||node.style.display==='none');if(g.box.hidden)g.box.open=false;});
  }else{
   groups.splice(0).forEach(g=>{g.entries.forEach(({node,anchor})=>{anchor.replaceWith(node);});g.box.remove();});notes.splice(0).forEach(n=>n.remove());ownerIdentity='';
  }
  for(const root of [$('crewPanel'),document.querySelector('#admin > .wrap')])if(root)observer.observe(root,{childList:true});
  groups.forEach(g=>g.entries.forEach(({node})=>observer.observe(node,{attributes:true,attributeFilter:['hidden','style']})));
 }
 document.addEventListener('gw-permissions-changed',schedule);window.addEventListener('gw-auth-changed',schedule);
 window.addEventListener('hashchange',openHash);
 document.addEventListener('click',event=>{const link=event.target.closest('a[href^="#"]');if(link){try{openTarget($(decodeURIComponent(link.hash.slice(1))));}catch{}}});
 schedule();
})();
