/* Daily cards: all identity, hidden rewards and daily limits are checked by Supabase. */
(() => {
 'use strict';
 const API='https://wtiefpuczygmyjaampdg.supabase.co/rest/v1/rpc/', KEY='sb_publishable_raWlqZYNpGUfZ05HT07u4g_mlQhGdif';
 const $=id=>document.getElementById(id);
 const el=(tag,props={},...kids)=>{const n=document.createElement(tag);for(const [k,v] of Object.entries(props)){if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else if(k==='class')n.className=v;else if(v!==false&&v!=null)n.setAttribute(k,v===true?'':v);}kids.flat().forEach(x=>{if(x!=null)n.append(x.nodeType?x:document.createTextNode(String(x)));});return n;};
 const button=(text,fn,kind='btn small')=>el('button',{type:'button',class:kind,onclick:fn},text);
 async function rpc(fn,args={}){const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);try{const r=await fetch(API+fn,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(args),signal:c.signal});const d=await r.json();if(!r.ok||!d.ok){const e=new Error(d.msg||d.message||'Could not connect. Please try again.');e.data=d;throw e;}return d;}catch(e){if(e.name==='AbortError')throw new Error('Connection timed out. Refresh your cards before trying again.');throw e;}finally{clearTimeout(t);}}
 let token='';try{token=sessionStorage.getItem('gw-daily-card-session')||'';}catch{}
 function storeToken(v){token=v;try{if(v)sessionStorage.setItem('gw-daily-card-session',v);else sessionStorage.removeItem('gw-daily-card-session');}catch{}}
 let enabled=false,board=null,customer='',busy=false,refreshing=false,resetAt=0,serverOffset=0,ownerKey='',ownerLoaded=false,ownerBusy=false;
 const section=el('section',{id:'daily-cards'}),wrap=el('div',{class:'wrap'});section.append(wrap);$('customer-order').after(section);
 const nav=document.querySelector('.navlinks');if(nav)nav.insertBefore(el('a',{href:'#daily-cards'},'Daily cards'),$('codeSigninLink'));
 const msg=el('p',{class:'msg',role:'status','aria-live':'polite',id:'dailyCardMessage'}),count=el('strong',{id:'dailyCardCount'},'3 reveals per day'),clock=el('span',{class:'dc-clock'});
 const cid=el('input',{id:'dailyCardCID',required:true,maxlength:40,autocomplete:'username',placeholder:'Your in-game CID'}),code=el('input',{id:'dailyCardCode',type:'password',required:true,maxlength:80,autocomplete:'current-password',placeholder:'Fixed code provided by the Owner'});
 const signin=el('button',{type:'submit',class:'btn solid'},'Sign in to reveal');
 const login=el('form',{class:'dc-login',onsubmit:async e=>{e.preventDefault();if(busy)return;busy=true;signin.disabled=true;msg.textContent='Signing in…';try{const d=await rpc('gw_cards_login',{p_cid:cid.value.trim(),p_code:code.value.trim()});storeToken(d.token);customer=d.name?d.name+' · '+d.cid:d.cid;code.value='';enabled=true;applyBoard(d.board);msg.textContent='Choose any 3 cards. Each reveal is final for today.';}catch(e){msg.textContent=e.message;}finally{busy=false;signin.disabled=!enabled;render();}}},
  el('label',{},'CID',cid),el('label',{},'Fixed login code',code),signin);
 const signed=el('div',{class:'dc-signed',hidden:true}),who=el('strong',{}),refresh=button('Refresh cards',()=>loadStatus()),logout=button('Sign out',async()=>{const old=token;storeToken('');board=null;customer='';render();msg.textContent='Signed out. Your reveals stay saved for today.';try{await rpc('gw_cards_logout',{p_token:old});}catch{}});
 signed.append(who,refresh,logout);
 const grid=el('div',{class:'dc-grid',id:'dailyCardGrid','aria-label':'Ten daily reward cards'});
 wrap.append(el('div',{class:'dc-intro'},el('div',{},el('span',{class:'dc-eyebrow'},'A LITTLE LUCK, EVERY DAY'),el('h2',{},'Pick your daily surprise'),el('p',{class:'sub'},'10 hidden cards. 3 chances. Come back each day for a fresh set.')),el('div',{class:'dc-counter'},count,clock)),
  el('div',{class:'dc-access'},el('p',{class:'sub'},'Sign in with your CID and the fixed code chosen by the Owner. Use the same code every day. Your 3 reveals reset at 6 AM Bangladesh time.'),login,signed),msg,grid);
 function setClock(data){resetAt=Date.parse(data.reset_at);serverOffset=Date.parse(data.server_now)-Date.now();tick();}
 function tick(){if(!resetAt){clock.textContent='Reset · 6 AM (Bangladesh)';return;}const secs=Math.max(0,Math.ceil((resetAt-Date.now()-serverOffset)/1000));const hh=String(Math.floor(secs/3600)).padStart(2,'0'),mm=String(Math.floor(secs%3600/60)).padStart(2,'0'),ss=String(secs%60).padStart(2,'0');clock.textContent='Resets in '+hh+':'+mm+':'+ss+' · 6 AM';if(!secs){resetAt=0;if(token){storeToken('');board=null;customer='';render();msg.textContent='A new day has started. Sign in again for your 3 reveals.';}loadPublic();}}
 const history=el('div',{class:'dc-history',hidden:true}),historyList=el('div',{class:'dc-activity'});history.append(el('h3',{},'Completed daily rewards'),el('p',{class:'sub'},'Rewards marked done by staff and Displayable by the Owner. Latest 100 completed rewards.'),historyList);wrap.append(history);
 let historyKey='';
 function applyBoard(data){board=data;setClock(data);render();}
 const cardNodes=[];
 const setText=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
 function render(){
  login.hidden=!!token;signed.hidden=!token;who.textContent=customer;logout.disabled=busy;signin.disabled=busy||!enabled;
  history.hidden=!token;const nextHistory=JSON.stringify(token?board?.history||[]:[]);if(historyKey!==nextHistory){historyKey=nextHistory;historyList.replaceChildren();(token?board?.history||[]:[]).forEach(r=>historyList.append(el('div',{},el('strong',{},r.reward),el('span',{},r.day+' · Card '+r.position+' · Done'),el('small',{},new Date(r.done_at).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'})+' (Bangladesh)'))));if(!historyList.childElementCount)historyList.append(el('p',{class:'sub'},'No displayable rewards completed yet.'));}
  count.textContent=token&&board?board.remaining+' of 3 reveals left':'3 reveals per day';
  for(let i=1;i<=10;i++){
   const c=board?.cards.find(x=>x.position===i),opened=!!token&&!!c?.revealed;
   if(!cardNodes[i]){
    const card=button('',()=>reveal(i),'dc-card'),symbol=el('span',{class:'dc-symbol','aria-hidden':'true'}),title=el('strong',{class:'dc-card-title'}),hint=el('span',{class:'dc-card-hint'});
    card.append(el('span',{class:'dc-card-number'},String(i).padStart(2,'0')),symbol,title,hint);grid.append(card);cardNodes[i]={card,symbol,title,hint};
   }
   const {card,symbol,title,hint}=cardNodes[i];
   const rewardText=c?.reward||(c?.done?'Completed':'Awaiting staff');
   const cls='dc-card'+(opened?' is-revealed':''),label=opened?'Card '+i+': '+rewardText:'Reveal card '+i;
   if(card.className!==cls)card.className=cls;
   card.disabled=opened||busy||!enabled||!token||!board||board.remaining===0;
   if(card.getAttribute('aria-label')!==label)card.setAttribute('aria-label',label);
   if(card.getAttribute('aria-pressed')!==String(opened))card.setAttribute('aria-pressed',String(opened));
   setText(symbol,opened?'✦':'✧');setText(title,opened?rewardText:'GREEN WONDERLAND');
   setText(hint,opened?(c.done?'Done': 'Revealed · awaiting confirmation'):!token?'Sign in to reveal':board?.remaining===0?'Back tomorrow':'Tap to reveal');
  }
 }
 async function reveal(position){if(busy||!token)return;busy=true;render();msg.textContent='Revealing your card…';try{const d=await rpc('gw_cards_reveal',{p_token:token,p_position:position});applyBoard(d.board);msg.textContent='Card '+position+' revealed. Staff can check your CID and confirm the reward. '+(d.board.remaining?d.board.remaining+' reveals left.':'All 3 reveals used. Come back after 6 AM.');}catch(e){if(e.data?.expired){storeToken('');board=null;}if(e.data?.board)applyBoard(e.data.board);msg.textContent=e.message;}finally{busy=false;render();}}
 async function loadPublic(){try{const d=await rpc('gw_cards_public');enabled=d.enabled;setClock(d);if(!token)msg.textContent=enabled?'Sign in with the CID and code provided by the Owner.':'Daily cards will open after the Owner sets the rewards and enables the game.';render();}catch(e){msg.textContent='Daily cards are temporarily unavailable. '+e.message;}}
 async function loadStatus(){if(!token||refreshing||busy)return;refreshing=true;const requestToken=token;try{const d=await rpc('gw_cards_status',{p_token:requestToken});if(token!==requestToken)return;enabled=d.enabled;customer=d.name?d.name+' · '+d.cid:d.cid;applyBoard(d.board);if(!enabled)msg.textContent='Daily cards are paused. Your revealed rewards remain saved.';}catch(e){if(token!==requestToken)return;if(e.data?.expired){storeToken('');board=null;render();}msg.textContent=e.message;}finally{refreshing=false;}}

 // Owner controls. Customers reuse Owner-chosen codes; only their hashes are stored.
 const owner=el('div',{class:'card2 dc-owner',id:'dailyCardsOwner',hidden:true}),ownerMsg=el('p',{class:'msg',role:'status'}),ownerBody=el('div',{});
 owner.append(el('h3',{},'Daily cards · Owner only'),el('p',{class:'sub'},'Set reward probabilities, create customer IDs, and see recent reveals. Each customer gets 10 random cards and can reveal 3 per day.'),button('Load / refresh daily card controls',()=>loadOwner()),ownerMsg,ownerBody);$('crewPanel').append(owner);
 const isOwner=()=>!!signedIn&&String(signedIn.role).trim().toLowerCase()==='owner';
 function ownerPin(){if(!window.gwPin)throw new Error('Sign out of the crew panel and sign in again with your Owner code.');return window.gwPin;}
 async function ownerCall(fn,args){if(!isOwner())throw new Error('Owner access required.');return rpc(fn,{p_pin:ownerPin(),...args});}
 async function loadOwner(){if(ownerBusy||!isOwner())return;ownerBusy=true;ownerMsg.textContent='Loading…';try{const d=await ownerCall('gw_cards_owner_get',{});if(!isOwner())return;renderOwner(d);ownerLoaded=true;ownerMsg.textContent='Card edits apply to daily sets that have not started. Existing reveals and daily limits stay unchanged.';}catch(e){ownerMsg.textContent=e.message;}finally{ownerBusy=false;}}
 function renderOwner(data){
  ownerBody.replaceChildren();
  const active=el('input',{type:'checkbox',checked:data.settings.enabled});
  const rewardInputs=data.settings.rewards.map((value,i)=>el('input',{value,maxlength:120,required:true,'aria-label':'Reward '+(i+1)}));
  const chanceInputs=data.settings.rewards.map((_,i)=>el('input',{type:'number',min:0,max:100,step:0.01,required:true,value:data.settings.probabilities?.[i]??10,'aria-label':'Probability for reward '+(i+1)+' (%)'}));
  const displayInputs=data.settings.rewards.map((_,i)=>el('input',{type:'checkbox',checked:data.settings.displayable?.[i]??true,'aria-label':'Displayable reward '+(i+1)}));
  const totalLabel=el('p',{class:'dc-probability-total',role:'status'}),saveSettings=el('button',{type:'submit',class:'btn solid small'},'Save rewards & probabilities');
  let savingSettings=false;
  function updateTotal(){
   const values=chanceInputs.map(x=>x.valueAsNumber),valid=values.every(x=>Number.isFinite(x)&&x>=0&&x<=100&&Number(x.toFixed(2))===x),total=values.reduce((sum,x)=>sum+(Number.isFinite(x)?Math.round(x*100):0),0);
   const ready=valid&&total===10000;
   totalLabel.textContent='Total: '+(total/100).toFixed(2)+'%'+(ready?' — ready to save':valid?' — must equal 100%':' — use values from 0 to 100 with up to 2 decimal places');
   totalLabel.dataset.valid=String(ready);saveSettings.disabled=savingSettings||!ready;return ready;
  }
  chanceInputs.forEach(input=>input.addEventListener('input',updateTotal));
  const equal=button('Set equal chances',()=>{chanceInputs.forEach(input=>{input.value='10';});updateTotal();});
  const settings=el('form',{class:'dc-settings',onsubmit:async e=>{e.preventDefault();if(!updateTotal()||savingSettings)return;savingSettings=true;updateTotal();try{
   await ownerCall('gw_cards_owner_save_displayable',{p_enabled:active.checked,p_rewards:rewardInputs.map(x=>x.value.trim()),p_probabilities:chanceInputs.map(x=>x.valueAsNumber),p_displayable:displayInputs.map(x=>x.checked)});
   ownerMsg.textContent='Rewards and probabilities saved. Existing daily sets stay unchanged.';await loadPublic();
  }catch(e){ownerMsg.textContent=e.message;}finally{savingSettings=false;updateTotal();}}},
   el('h4',{},'Rewards & probabilities'),el('p',{class:'sub'},'Set the chance of each reward on a single card. Percentages must total 100%. Each of the 10 cards draws independently, so rewards can repeat. Set 0% to disable a reward; use “Try again” for no reward.'),
   el('p',{class:'sub'},'Displayable rewards appear to customers only after an employee marks them done. Unchecked rewards stay visible to staff only. These settings apply to daily sets that have not started.'),
   el('label',{class:'dc-toggle'},active,'Enable daily cards'),el('div',{class:'dc-reward-fields'},...rewardInputs.map((input,i)=>el('div',{class:'dc-reward-option'},el('label',{},'Reward '+(i+1),input),el('label',{},'Chance (%)',chanceInputs[i]),el('label',{class:'dc-display-toggle'},displayInputs[i],'Displayable')))),totalLabel,el('div',{class:'row'},saveSettings,equal));
  updateTotal();
  const codeInput=label=>el('input',{type:'password',required:true,minlength:6,maxlength:32,pattern:'[A-Za-z0-9]{6,32}',autocomplete:'new-password',placeholder:'6–32 letters or numbers','aria-label':label});
  const newCID=el('input',{required:true,maxlength:40,placeholder:'Customer CID','aria-label':'New customer CID'}),newName=el('input',{maxlength:60,placeholder:'Name (optional)','aria-label':'Customer name (optional)'}),newCode=codeInput('Fixed code for new customer'),newResult=el('div',{class:'dc-code-result',hidden:true});
  const create=el('form',{class:'dc-create',onsubmit:async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{
   const d=await ownerCall('gw_cards_owner_set_code',{p_cid:newCID.value.trim(),p_name:newName.value.trim(),p_code:newCode.value.trim(),p_action:'create'});
   showCode(d,newResult);ownerMsg.textContent=d.msg;data.accounts.unshift({cid:d.cid,name:newName.value.trim(),active:true});renderAccounts();newCID.value='';newName.value='';newCode.value='';
  }catch(e){ownerMsg.textContent=e.message;}finally{b.disabled=false;}}},el('h4',{},'Create customer ID'),el('p',{class:'sub'},'Choose a separate fixed code for this CID. Customers reuse it every day; only the reveal allowance resets. Codes use 6–32 letters or numbers and are not case-sensitive.'),el('div',{class:'row'},newCID,newName,newCode,el('button',{type:'submit',class:'btn solid small'},'Create customer ID')),newResult);
  const accountTitle=el('h4',{}),list=el('div',{class:'dc-account-list'}),search=el('input',{type:'search',placeholder:'Search customer CID or name','aria-label':'Search daily card customers'});
  const renderAccounts=()=>{accountTitle.textContent='Customer IDs ('+data.accounts.length+')';list.replaceChildren();const q=search.value.trim().toLowerCase();data.accounts.filter(a=>(a.cid+' '+a.name).toLowerCase().includes(q)).forEach(a=>{
   const out=el('div',{class:'dc-code-result',hidden:true}),row=el('div',{class:'dc-account'},el('strong',{},a.cid+(a.name?' · '+a.name:'')+' · '+(a.active?'Active':'Disabled')));
   const change=async(action,b)=>{b.disabled=true;try{const d=await ownerCall('gw_cards_owner_account',{p_cid:a.cid,p_name:a.name,p_action:action});if(action==='reset')showCode(d,out);else{a.active=action==='enable';renderAccounts();}ownerMsg.textContent=d.msg;}catch(e){ownerMsg.textContent=e.message;}finally{b.disabled=false;}};
   const replacement=codeInput('New fixed code for '+a.cid);
   const confirmReset=el('details',{},el('summary',{},'Change login code'),el('p',{class:'sub'},'Choose a new fixed code for this CID. The previous code and logins stop working. Today’s reveals stay used.'));
   const resetForm=el('form',{class:'row',onsubmit:async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{
    const d=await ownerCall('gw_cards_owner_set_code',{p_cid:a.cid,p_name:a.name,p_code:replacement.value.trim(),p_action:'set_code'});showCode(d,out);replacement.value='';ownerMsg.textContent=d.msg;
   }catch(err){ownerMsg.textContent=err.message;}finally{btn.disabled=false;}}},replacement,el('button',{type:'submit',class:'btn small'},'Save fixed code'));
   confirmReset.append(resetForm);
   const toggle=button(a.active?'Disable ID':'Enable ID',()=>change(a.active?'disable':'enable',toggle));row.append(toggle,confirmReset,out);list.append(row);
  });if(!list.childElementCount)list.append(el('p',{class:'sub'},'No matching customer IDs.'));};search.addEventListener('input',renderAccounts);renderAccounts();
  const activity=el('div',{class:'dc-activity'});data.activity.forEach(a=>activity.append(el('div',{},el('strong',{},a.cid+' · Card '+a.position),el('span',{},a.reward),el('small',{},new Date(a.at).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'})+' (Bangladesh)'))));if(!data.activity.length)activity.append(el('p',{class:'sub'},'No cards revealed yet.'));
  ownerBody.append(settings,create,accountTitle,search,list,el('h4',{},'Recent reveals'),el('p',{class:'sub'},'Latest 100 reveals, shared across all browsers.'),activity);
 }
 function showCode(d,out){out.hidden=false;const loginText='Green Wonderland daily cards\nCID: '+d.cid+'\nFixed login code: '+d.code+'\nReuse this same code every day.\n'+location.origin+location.pathname+'#daily-cards';const status=el('p',{role:'status'});out.replaceChildren(el('pre',{},loginText),button('Copy customer login',async()=>{try{await navigator.clipboard.writeText(loginText);status.textContent='Copied. Give this privately to the customer.';}catch{status.textContent='Select the details above and copy them.';}}),status);}
 function syncOwner(){owner.hidden=!isOwner();const next=isOwner()?(signedIn.id+'|'+window.gwPin):'';if(next!==ownerKey){ownerKey=next;ownerLoaded=false;ownerBody.replaceChildren();ownerMsg.textContent='';}if(isOwner()&&!ownerLoaded&&!ownerBusy)loadOwner();}
 // Shared CID lookup for every signed-in crew member. Server rechecks the code on each call.
 const staff=el('div',{class:'card2 dc-staff',id:'dailyCardsStaff',hidden:true}),staffMsg=el('p',{class:'msg',role:'status'}),staffList=el('div',{class:'dc-staff-list'});
 const staffCID=el('input',{required:true,maxlength:40,placeholder:'Customer CID','aria-label':'Reward lookup CID'}),staffSearch=el('button',{type:'submit',class:'btn small solid'},'Find daily rewards');
 let staffKey='',staffVersion=0,staffSignature='',staffQuery='',staffLoading=false;
 const staffForm=el('form',{class:'row',onsubmit:e=>{e.preventDefault();staffQuery=staffCID.value.trim();lookupRewards(true);}},staffCID,staffSearch);
 staff.append(el('h3',{},'Daily rewards · Employee lookup'),el('p',{class:'sub'},'Search a CID to see its latest 100 revealed cards. Mark each reward done after handling it. All employees share the same status.'),staffForm,staffMsg,staffList);$('crewPanel').append(staff);
 async function lookupRewards(force=false){
  if(!signedIn||!staffQuery||staffLoading)return;
  const version=staffVersion,query=staffQuery,credential=window.gwPin;staffLoading=true;staffSearch.disabled=true;
  try{
   if(!credential)throw new Error('Sign out and sign in with your employee code.');
   const d=await rpc('gw_cards_staff_lookup',{p_pin:credential,p_cid:query});if(version!==staffVersion)return;
   staffMsg.textContent=d.cid+(d.name?' · '+d.name:'')+' — '+d.activity.length+' revealed card(s).';
   const signature=JSON.stringify(d);if(!force&&signature===staffSignature)return;staffSignature=signature;staffList.replaceChildren();
   d.activity.forEach(r=>{
    const row=el('article',{class:'dc-staff-reward'},el('strong',{},r.reward),el('span',{},r.day+' · Card '+r.position),el('small',{},'Revealed '+new Date(r.at).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'})+' (Bangladesh)'),el('small',{},r.displayable?'Displayable after completion':'Staff only · not displayable'));
    if(r.done_at)row.append(el('span',{class:'dc-done'},'Done · '+r.employee_name+' · '+new Date(r.done_at).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'})));
    else {const done=button('Mark as done',async()=>{done.disabled=true;try{await rpc('gw_cards_staff_done',{p_pin:credential,p_cid:d.cid,p_day:r.day,p_position:r.position});if(version!==staffVersion)return;staffMsg.textContent='Reward marked done.';await lookupRewards(true);if(token)loadStatus();}catch(e){if(version===staffVersion){staffMsg.textContent=e.message;done.disabled=false;}}});row.append(done);}
    staffList.append(row);
   });if(!d.activity.length)staffList.append(el('p',{class:'sub'},'This customer has not revealed any cards yet.'));
  }catch(e){if(version===staffVersion){staffMsg.textContent=e.message;staffList.replaceChildren();staffSignature='';}}finally{if(version===staffVersion){staffLoading=false;staffSearch.disabled=false;}}
 }
 function syncStaff(){const key=signedIn?(signedIn.id+'|'+window.gwPin):'';staff.hidden=!signedIn;if(key!==staffKey){staffKey=key;staffVersion++;staffLoading=false;staffSearch.disabled=false;staffQuery='';staffCID.value='';staffSignature='';staffMsg.textContent='';staffList.replaceChildren();}}
 function syncAccess(){syncOwner();syncStaff();}
 document.addEventListener('gw-permissions-changed',syncAccess);window.addEventListener('gw-auth-changed',syncAccess);
 render();loadPublic().then(()=>{loadStatus();if(location.hash==='#daily-cards')section.scrollIntoView({block:'start'});});syncAccess();setInterval(tick,1000);
 setInterval(()=>{if(!document.hidden){loadStatus();syncAccess();if(!staff.hidden)lookupRewards();}},15000);
})();
