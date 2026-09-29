(() => {
  const client=supabase.createClient('https://wtiefpuczygmyjaampdg.supabase.co','sb_publishable_raWlqZYNpGUfZ05HT07u4g_mlQhGdif');
  window.gwClient=client;
  const $=id=>document.getElementById(id);
  const snapshot=()=>({menu:STATE.menu,categories:[...CATS],content:STATE.content||{}});
  try { if(!localStorage.getItem("gw-menu-before-sync-v1"))localStorage.setItem("gw-menu-before-sync-v1",JSON.stringify(snapshot())); } catch {}
  let revision=0,ready=false,owner=false,saving=false,baseline=JSON.stringify(snapshot());
  const localSave=publishState;
  function notice(text){$('catalogStatus').textContent=text;}
  function paint(){
    if(!CATS.includes(activeCat))activeCat='All';
    refreshCategories();renderDescriptions();renderDescriptionEditor();
  }
  function apply(row){
    STATE.menu=row.payload.menu;STATE.content=row.payload.content||{};
    CATS.splice(0,CATS.length,...row.payload.categories);STATE.categories=CATS;
    revision=row.revision;baseline=JSON.stringify(snapshot());paint();
    // Cache only after the shared version has been received; never upload stale caches automatically.
    localSave();
  }
  async function load(force=false){
    if(saving || (!force && JSON.stringify(snapshot())!==baseline))return;
    const startingDraft=JSON.stringify(snapshot());
    const {data,error}=await client.from('site_catalog').select('payload,revision').eq('id',true).maybeSingle();
    if(error){notice('Shared menu unavailable. Your edits are kept here; retry before saving.');return;}
    ready=true;
    if(!force && JSON.stringify(snapshot())!==startingDraft)return;
    if(data && (force || data.revision!==revision))apply(data);
    notice(data?'Menu synced across browsers.':'Owner: sign in with your code, then publish the menu from the browser where you made your edits.');
    $('publishLocalCatalog').hidden=!!data;
  }
  const TOP=['owner','admin','administrator'];
  const isTop=()=>!!signedIn&&TOP.includes(String(signedIn.role).trim().toLowerCase());
  function refreshAccess(){
    owner=isTop()&&!!window.gwPin;
    $('catalogAuthStatus').textContent=owner?'Signed in as '+signedIn.role+'. Shared saving is enabled.':isTop()?'Sign out and sign in again with your code to save for everyone.':'Sign in as Owner or Admin (Crew section) to save changes for everyone.';
  }
  publishState=async function(options={}){
    if(!options.catalog)return localSave();
    if(!ready)return {ok:false,reason:'Shared menu is still loading or unavailable. Retry shortly.'};
    refreshAccess();
    if(!owner)return {ok:false,reason:'Sign in as Owner or Admin with your code first. Nothing was published.'};
    if(saving)return {ok:false,reason:'A save is already running. Please wait.'};
    saving=true;
    const payload=JSON.parse(JSON.stringify(snapshot()));
    try{
      const {data,error}=await client.rpc('save_catalog_pin',{p_pin:window.gwPin,p_payload:payload,p_revision:revision});
      if(error)return {ok:false,reason:error.message};
      if(!data||!data.ok)return {ok:false,reason:(data&&data.msg)||'Not allowed.'};
      revision=data.revision;baseline=JSON.stringify(payload);await localSave();
      $('publishLocalCatalog').hidden=true;notice('Saved online. Other browsers receive this menu automatically.');
      return {ok:true,shared:true};
    }finally{saving=false;}
  };
  const oldMessage=msgFor;
  msgFor=result=>result.ok&&result.shared?'Saved online for everyone.':oldMessage(result);
  $('publishLocalCatalog').addEventListener('click',async()=>{
    refreshAccess();if(!owner){notice('Sign in as Owner or Admin first.');return;}
    if(revision!==0){notice('A shared menu already exists. Reload to view it before editing.');return;}
    const result=await publishState({catalog:true});notice(msgFor(result));if(result.ok)paint();
  });
  $('reloadCatalog').addEventListener('click',()=>{
    if(JSON.stringify(snapshot())!==baseline && !confirm('Discard unsaved menu edits and load the shared menu?'))return;
    load(true);
  });
  window.addEventListener('gw-auth-changed',refreshAccess);
  refreshAccess();load();
  setInterval(()=>{if(!document.hidden)load();},15000);
  window.addEventListener('focus',()=>load());
})();
