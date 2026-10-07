/* Customer orders, private receipts, staff decisions and owner-issued wheel codes. */
(() => {
  'use strict';
  const API='https://wtiefpuczygmyjaampdg.supabase.co/rest/v1/rpc/', KEY='sb_publishable_raWlqZYNpGUfZ05HT07u4g_mlQhGdif';
  const $=id=>document.getElementById(id), money=n=>'$'+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))||fallback;}catch{return fallback;}};
  const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
  const el=(tag,attrs={},...children)=>{
    const n=document.createElement(tag);
    for(const [k,v] of Object.entries(attrs)) {
      if(k.startsWith('on')) n.addEventListener(k.slice(2),v);
      else if(k==='class') n.className=v;
      else if(v!==false&&v!=null) n.setAttribute(k,v===true?'':String(v));
    }
    children.flat().forEach(c=>{if(c!=null)n.append(c.nodeType?c:document.createTextNode(String(c)));});return n;
  };
  const button=(text,action,kind='btn small')=>el('button',{type:'button',class:kind,onclick:action},text);
  async function rpc(name,args={}) {
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),20000);
    try {
      const r=await fetch(API+name,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(args),signal:controller.signal});
      const data=await r.json();
      if(!r.ok||data?.ok===false) { const err=new Error(data?.msg||data?.message||'Request failed. Please try again.');err.definitive=true;throw err; }
      return data;
    } catch(e) {if(e.name==='AbortError')throw new Error('Connection timed out. Retry safely using the same request.');throw e;}
    finally{clearTimeout(timer);}
  }
  let basket=read('gw-customer-cart-v1',[]), receipts=read('gw-customer-receipts-v1',[]), pending=read('gw-customer-pending-v1',null);
  if(!Array.isArray(basket))basket=[];if(!Array.isArray(receipts))receipts=[];
  basket=basket.filter(x=>x&&x.id!=null&&Number.isInteger(x.qty)&&x.qty>0&&x.qty<=9999);
  receipts=receipts.filter(x=>x&&typeof x.id==='string'&&/^[a-f0-9]{64}$/.test(x.token)).slice(0,20);
  if(pending&&(!pending.args||!pending.id||!/^[a-f0-9]{64}$/.test(pending.token)))pending=null;
  let wheels=[], current=null, currentOrder=null, sending=false, receiptBusy=false, queueBusy=false, queueAgain=false, lastQueueSignature='', queueVersion=0, manualRequest=null;
  const section=el('section',{id:'customer-order'}), wrap=el('div',{class:'wrap'});
  section.append(wrap);$('menu').after(section);
  const basketRows=el('div',{id:'customerCartRows'}), cartTotal=el('strong',{id:'customerCartTotal'}), eligibility=el('p',{class:'sub',id:'customerRewardTier'});
  const notice=el('p',{class:'msg',role:'status',id:'customerOrderMessage'});
  const name=el('input',{id:'orderCustomerName',required:true,maxlength:60,autocomplete:'off',placeholder:'In-game name'});
  const cid=el('input',{id:'orderCustomerCID',required:true,maxlength:30,autocomplete:'off',placeholder:'In-game CID'});
  const phone=el('input',{id:'orderCustomerPhone',type:'tel',maxlength:30,autocomplete:'off',placeholder:'Optional'});
  const submit=el('button',{type:'submit',class:'btn solid',id:'placeCustomerOrder'},'Send order to staff');
  const form=el('form',{id:'customerOrderForm',onsubmit:placeOrder},
    el('label',{},'Name (required)',name),el('label',{},'CID (required)',cid),el('label',{},'Phone (optional)',phone),
    el('p',{class:'sub'},'For in-game orders. Staff will review your order before it is confirmed.'),submit);
  const receiptBox=el('div',{id:'customerReceipt',class:'card2',hidden:true}), history=el('div',{class:'row',id:'customerOrderHistory'});
  wrap.append(el('div',{class:'section-head'},el('h2',{},'Your order'),el('a',{href:'#menu',class:'btn small'},'Browse products')),
    el('div',{class:'gw-order-layout'},el('div',{class:'card2'},el('h3',{},'Your products'),basketRows,cartTotal,eligibility),el('div',{class:'card2'},el('h3',{},'Customer details'),form)),notice,history,receiptBox);
  const cartLink=el('a',{class:'btn small gw-cart-link',href:'#customer-order'},'Your order (0)');
  $('menu').querySelector('.section-head').append(cartLink);
  const products=()=>basket.map(line=>{const item=STATE.menu.find(p=>String(p.id)===String(line.id));return {...line,item};});
  const basketTotal=()=>Math.round(products().reduce((sum,line)=>sum+(line.item?Number(line.item.price)*line.qty:0),0)*100)/100;
  function renderBasket(){
    basketRows.replaceChildren();
    products().forEach(line=>{
      const qty=el('input',{type:'number',min:1,max:9999,step:1,value:line.qty,'aria-label':'Quantity for '+(line.item?.name||'Unavailable product'),disabled:!!pending||sending});
      const lineTotal=el('span',{},line.item?money(line.item.price*line.qty):'—');
      qty.addEventListener('input',()=>{const v=Number(qty.value);if(!Number.isInteger(v)||v<1||v>9999){submit.disabled=true;return;}basket.find(x=>String(x.id)===String(line.id)).qty=v;save('gw-customer-cart-v1',basket);lineTotal.textContent=line.item?money(line.item.price*v):'—';renderBasketSummary();});
      qty.addEventListener('change',()=>renderBasket());
      const remove=button('Remove',()=>{if(pending||sending)return;basket=basket.filter(x=>String(x.id)!==String(line.id));save('gw-customer-cart-v1',basket);renderBasket();});remove.disabled=!!pending||sending;
      basketRows.append(el('div',{class:'gw-order-line'},el('div',{},el('strong',{},line.item?.name||'Product no longer available'),el('div',{class:'sub'},line.item?money(line.item.price)+' each':'Remove this item before ordering')),qty,lineTotal,remove));
    });
    if(!basket.length)basketRows.append(el('p',{class:'sub'},'Choose products from the menu using Add to order.'));
    renderBasketSummary();
  }
  function renderBasketSummary(){
    const total=basketTotal();cartTotal.textContent='Total: '+money(total);
    const tier=[...wheels].sort((a,b)=>Number(b.min)-Number(a.min)||b.id-a.id).find(w=>total>=Number(w.min));
    eligibility.textContent=tier?'After staff confirmation: one '+tier.name+' code will appear on your invoice.':wheels.length?'Wheel codes start at '+money(Math.min(...wheels.map(w=>Number(w.min))))+' after staff confirmation.':'Eligible orders receive a wheel code after staff confirmation.';
    cartLink.textContent='Your order ('+basket.reduce((s,x)=>s+x.qty,0)+')';
    submit.disabled=sending||(!pending&&(!basket.length||products().some(x=>!x.item)));
    submit.textContent=sending?'Sending…':pending?'Retry submission':'Send order to staff';
    [name,cid,phone].forEach(n=>{n.disabled=sending||!!pending;});
  }
  $('grid').addEventListener('click',event=>{
    const b=event.target.closest('[data-order-product]');if(!b)return;
    if(pending||sending){notice.textContent='Finish or retry the current submission before starting another order.';section.scrollIntoView({behavior:'smooth'});return;}
    const item=STATE.menu.find(p=>String(p.id)===b.dataset.orderProduct);if(!item)return;
    const line=basket.find(x=>String(x.id)===String(item.id));
    if(line){if(line.qty>=9999)return;line.qty++;}else basket.push({id:String(item.id),qty:1});
    save('gw-customer-cart-v1',basket);renderBasket();notice.textContent=item.name+' added to your order.';
    b.textContent='Added ✓';setTimeout(()=>{if(b.isConnected)b.textContent='Add to order';},1100);
  });
  function makeToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');}
  async function placeOrder(event){
    event.preventDefault();if(sending)return;
    if(!pending){
      if(!name.value.trim()||!cid.value.trim()){notice.textContent='Name and CID are required.';return;}
      if(!basket.length){notice.textContent='Add at least one product.';return;}
      const id=crypto.randomUUID(),token=makeToken();
      pending={id,token,args:{p_id:id,p_token:token,p_name:name.value.trim(),p_cid:cid.value.trim(),p_phone:phone.value.trim(),p_items:basket.map(x=>({id:x.id,qty:x.qty})),p_expected_total:basketTotal()}};
      save('gw-customer-pending-v1',pending);
    }
    sending=true;receiptBox.hidden=true;renderBasket();notice.textContent='Sending your order…';
    try{
      const data=await rpc('gw_place_order',pending.args);
      current={id:pending.id,token:pending.token};remember(current);
      pending=null;save('gw-customer-pending-v1',null);basket=[];save('gw-customer-cart-v1',basket);
      history.replaceChildren();renderHistory();showReceipt(data.order);
      notice.textContent='Order sent. Keep your private order link to view its status and invoice on any browser.';
      loadQueue(true);
      receiptBox.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){notice.textContent=e.message;if(e.definitive){pending=null;save('gw-customer-pending-v1',null);}}
    finally{sending=false;renderBasket();}
  }
  function remember(ref){receipts=[ref,...receipts.filter(x=>x.id!==ref.id)].slice(0,20);save('gw-customer-receipts-v1',receipts);}
  function invoiceText(o){
    return ['GREEN WONDERLAND — '+(o.status==='confirmed'?'INVOICE':'ORDER'), 'Order: '+o.id,'Status: '+o.status.toUpperCase(),'Placed: '+new Date(o.created_at).toLocaleString(),
      'Name: '+o.customer_name,'CID: '+o.customer_cid,...(o.customer_phone?['Phone: '+o.customer_phone]:[]),'',...o.items.map(x=>x.name+' × '+x.qty+' — '+money(x.price*x.qty)),
      '', 'Total: '+money(o.total),...(o.employee_name?['Handled by: '+o.employee_name]:[]),...(o.decline_reason?['Reason: '+o.decline_reason]:[]),
      ...(o.status==='confirmed'&&o.reward_code?['','Reward wheel: '+o.wheel_name,'Reward code: '+o.reward_code,'Active — one spin. Each code works once.']:o.status==='confirmed'?['This order does not qualify for a wheel code.']:o.status==='declined'?['No active reward code. This order was declined.']:['Wheel reward locked — an employee must confirm this order first.'])].join('\n');
  }
  async function copy(text,where){try{await navigator.clipboard.writeText(text);where.textContent='Copied.';}catch{where.textContent='Copy unavailable. Select the displayed text to copy it.';}}
  function showReceipt(o){
    currentOrder=o;receiptBox.hidden=false;receiptBox.replaceChildren();
    const status=el('p',{class:'msg',role:'status'}), link=new URL(location.href);link.hash='order='+current.id+'&key='+current.token;
    const text=invoiceText(o), display=el('pre',{class:'gw-order-invoice'},text);
    const actions=el('div',{class:'row'},button('Refresh status',refreshReceipt),button('Copy invoice',()=>copy(text,status)),button('Download invoice',()=>{
      const u=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=el('a',{href:u,download:'GW-'+o.id+'.txt'});a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
    }),button('Copy private order link',()=>copy(link.href,status)));
    receiptBox.append(el('div',{class:'section-head'},el('h3',{},o.status==='confirmed'?'Your invoice':'Order status'),el('span',{class:'gw-order-badge '+o.status},o.status)),
      el('p',{class:'sub'},o.status==='pending'?'Waiting for staff. This page refreshes automatically.':o.status==='declined'?'Staff declined this order. You can place a new order.':'Confirmed. Your invoice is ready.'),display,actions,
      el('p',{class:'sub'},'Keep this link private: anyone with it can view this invoice and its reward code.'),el('input',{readonly:true,value:link.href,'aria-label':'Private order link',class:'gw-private-link'}),status);
    if(o.status==='confirmed'&&o.reward_code&&window.RewardWheel)actions.append(button('Open reward wheel',()=>RewardWheel.openSpin()));
  }
  async function refreshReceipt(){
    if(!current||receiptBusy)return;receiptBusy=true;const ref=current;
    try{const data=await rpc('gw_get_order',{p_id:ref.id,p_token:ref.token});if(current===ref&&JSON.stringify(data.order)!==JSON.stringify(currentOrder))showReceipt(data.order);}
    catch(e){if(current===ref)notice.textContent=e.message;}finally{receiptBusy=false;}
  }
  function renderHistory(){history.replaceChildren();if(!receipts.length)return;history.append(el('span',{class:'sub'},'Your saved orders:'));receipts.forEach(ref=>history.append(button(ref.id.slice(0,8),()=>{current=ref;currentOrder=null;refreshReceipt();})));}
  function readOrderLink(){const params=new URLSearchParams(location.hash.slice(1)),id=params.get('order'),token=params.get('key');if(id&&/^[0-9a-f-]{36}$/i.test(id)&&/^[a-f0-9]{64}$/.test(token||'')){current={id,token};currentOrder=null;remember(current);renderHistory();refreshReceipt();section.scrollIntoView();}}

  // Staff order queue; secrets are never stored with public catalogue or receipts.
  const staff=el('div',{class:'card2',id:'staffOrders',hidden:true}), queue=el('div',{id:'staffOrderList'}),staffMsg=el('p',{class:'msg',role:'status'});
  const filter=el('select',{'aria-label':'Order status filter'},...['all','pending','confirmed','declined'].map(s=>el('option',{value:s},s==='all'?'All orders':s[0].toUpperCase()+s.slice(1))));
  const orderAlert=el('a',{href:'#staffOrders',class:'btn small',id:'staffOrderAlert',hidden:true},'Customer orders');
  $('crewPanel').prepend(orderAlert);
  filter.addEventListener('change',()=>loadQueue(true));
  staff.append(el('h3',{},'Customer orders'),el('p',{class:'sub'},'Confirm only after checking the order. Confirmation records the sale and issues any eligible wheel code.'),el('div',{class:'row'},filter,button('Refresh orders',()=>loadQueue(true))),staffMsg,queue);$('crewPanel').append(staff);
  const isOwner=()=>!!signedIn&&String(signedIn.role).trim().toLowerCase()==='owner';
  const canStaff=()=>!!signedIn&&(isOwner()||getPerms(signedIn.role).sell);
  function pin(){if(!window.gwPin){const p=window.prompt('Enter your staff code to manage shared orders:');if(p?.trim())window.gwPin=p.trim();}return window.gwPin||'';}
  async function loadQueue(force=false){
    if(!canStaff()||!window.gwPin)return;
    if(queueBusy){if(force)queueAgain=true;return;}
    queueBusy=true;const version=queueVersion,code=window.gwPin,status=filter.value;
    try{const data=await rpc('gw_order_queue',{p_pin:code,p_status:status});if(version!==queueVersion||code!==window.gwPin||status!==filter.value)return;
      const pendingCount=Number(data.pending_count??data.orders.filter(o=>o.status==='pending').length);
      orderAlert.textContent='Customer orders · '+pendingCount+' pending';
      const signature=JSON.stringify([status,data.orders]);if(!force&&signature===lastQueueSignature)return;lastQueueSignature=signature;
      staffMsg.textContent=pendingCount+' pending · '+data.orders.length+' shown. '+(status==='all'?'Pending first, then most recent.':'Filtered to '+status+'.');
      const previous=new Map([...queue.querySelectorAll('.gw-staff-order')].map(card=>[card.dataset.orderId,card]));
      const cards=[];
      if(!data.orders.length)cards.push(el('p',{class:'sub'},status==='all'?'No orders yet.':'No '+status+' orders.'));
      data.orders.forEach(o=>{
        const old=previous.get(o.id), rowSignature=JSON.stringify(o);
        if(old?.dataset.signature===rowSignature){cards.push(old);return;}
        const card=el('article',{class:'gw-staff-order','data-order-id':o.id,'data-signature':rowSignature}), info=el('details',{},el('summary',{},o.customer_name+' · CID '+o.customer_cid+' · '+money(o.total)+' · ',el('span',{class:'gw-order-badge '+o.status},o.status)),el('pre',{class:'gw-order-invoice'},invoiceText(o)));
        info.open=old?.querySelector('details')?.open||false;
        card.append(info);
        if(o.status==='pending'){
          const reason=el('input',{maxlength:300,placeholder:'Decline reason (optional)','aria-label':'Decline reason for '+o.id.slice(0,8)});
          const act=async(decision)=>{
            if(!pin())return;ok.disabled=no.disabled=true;staffMsg.textContent='Saving decision…';
            try{await rpc('gw_decide_order',{p_pin:window.gwPin,p_id:o.id,p_decision:decision,p_reason:reason.value});await loadQueue(true);if(current?.id===o.id)await refreshReceipt();}
            catch(e){staffMsg.textContent=e.message;ok.disabled=no.disabled=false;}
          };
          const ok=button('Confirm order',()=>act('confirmed'),'btn solid small'),no=button('Decline order',()=>act('declined'));
          card.append(el('div',{class:'row'},ok,no,reason));
        }else card.append(button('Copy invoice',()=>copy(invoiceText(o),staffMsg)));
        cards.push(card);
      });
      // Keep unchanged rows in place so polling never discards typed decline reasons or focus.
      [...queue.children].forEach(card=>{if(!cards.includes(card))card.remove();});
      cards.forEach((card,i)=>{if(queue.children[i]!==card)queue.insertBefore(card,queue.children[i]||null);});
    }catch(e){if(version===queueVersion)staffMsg.textContent='Could not load orders: '+e.message;}finally{queueBusy=false;if(queueAgain){queueAgain=false;loadQueue(true);}}
  }
  const manual=el('div',{class:'card2',id:'ownerRewardCodes',hidden:true}),wheelSelect=el('select',{'aria-label':'Wheel for manual code',required:true}),note=el('input',{maxlength:300,placeholder:'Reason or note (optional)','aria-label':'Code note'}),manualMsg=el('p',{class:'msg',role:'status'}),manualResult=el('pre',{class:'gw-order-invoice',hidden:true});
  const generate=button('Generate reward code',async()=>{
    if(!isOwner()||!pin())return;if(!wheelSelect.value){manualMsg.textContent='Choose a wheel.';return;}
    if(!manualRequest)manualRequest={id:crypto.randomUUID(),wheel:Number(wheelSelect.value),note:note.value};
    generate.disabled=true;manualMsg.textContent='Generating…';
    try{const d=await rpc('gw_owner_generate_code',{p_pin:window.gwPin,p_request_id:manualRequest.id,p_wheel_id:manualRequest.wheel,p_note:manualRequest.note});manualResult.textContent=d.wheel_name+'\nReward code: '+d.code+'\nOne spin. Each code works once.';manualResult.hidden=false;manualMsg.textContent='Code generated. Copy it for the customer.';another.hidden=false;copyManual.hidden=false;}
    catch(e){manualMsg.textContent=e.message;generate.disabled=false;if(e.definitive)manualRequest=null;}
  },'btn solid small');
  const another=button('Generate another',()=>{manualRequest=null;generate.disabled=false;manualResult.hidden=true;another.hidden=copyManual.hidden=true;manualMsg.textContent='Choose a wheel, then generate a new code.';}),copyManual=button('Copy code details',()=>copy(manualResult.textContent,manualMsg));another.hidden=copyManual.hidden=true;
  manual.append(el('h3',{},'Generate reward code · Owner only'),el('p',{class:'sub'},'Create a one-use code for a chosen wheel. This does not create a sale.'),el('div',{class:'row'},wheelSelect,note,generate,another,copyManual),manualResult,manualMsg);$('crewPanel').append(manual);
  let identity='';
  function syncAccess(){
    const next=(signedIn?.id||'')+'|'+(signedIn?.role||'')+'|'+(window.gwPin||'')+'|'+canStaff();
    staff.hidden=!canStaff();orderAlert.hidden=!canStaff();manual.hidden=!isOwner();
    if(next!==identity){identity=next;queueVersion++;lastQueueSignature='';queue.replaceChildren();manualResult.hidden=true;manualRequest=null;generate.disabled=false;another.hidden=copyManual.hidden=true;
      staffMsg.textContent=canStaff()&&!window.gwPin?'Sign out and sign in again with your code to load shared orders.':'';if(canStaff())loadQueue(true);}
  }
  window.GWOrders={issueSaleReward:async sale=>{if(!pin())throw new Error('Sign in with your staff code to issue the reward.');return rpc('gw_issue_sale_reward',{p_pin:window.gwPin,p_sale_id:String(sale.id)});}};
  document.addEventListener('gw-permissions-changed',syncAccess);window.addEventListener('gw-auth-changed',syncAccess);
  window.addEventListener('hashchange',readOrderLink);
  window.addEventListener('focus',()=>{syncAccess();refreshReceipt();loadQueue(true);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncAccess();refreshReceipt();loadQueue(true);}});
  const menuObserver=new MutationObserver(()=>renderBasket());menuObserver.observe($('grid'),{childList:true});
  rpc('rw_get_wheels').then(data=>{wheels=data;wheelSelect.replaceChildren(...wheels.map(w=>el('option',{value:w.id},w.name)));renderBasket();}).catch(()=>{manualMsg.textContent='Could not load wheels. Refresh this page to retry.';});
  renderBasket();renderHistory();syncAccess();readOrderLink();
  if(!current&&receipts.length){current=receipts[0];refreshReceipt();}
  if(pending){name.value=pending.args.p_name;cid.value=pending.args.p_cid;phone.value=pending.args.p_phone||'';notice.textContent='An earlier submission needs checking. Retry it safely without creating another order.';}
  setInterval(()=>{if(!document.hidden){syncAccess();refreshReceipt();loadQueue();}},10000);
})();
