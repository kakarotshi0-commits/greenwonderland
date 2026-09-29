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
    notice(data?'Menu synced across browsers.':'Owner: verify your email, then publish the menu from the browser where you made your edits.');
    $('publishLocalCatalog').hidden=!!data;
  }
  async function verifyOwner(){
    const {data:{session}}=await client.auth.getSession();
    owner=false;
    if(session){const result=await client.rpc('is_catalog_owner');owner=result.data===true;}
    $('catalogAuthStatus').textContent=owner?'Owner verified. Shared saving is enabled.':session?'This email does not have Owner access.':'Verify your Owner email to save changes for everyone.';
    $('catalogSignOut').hidden=!session;
    $('catalogAuthForm').hidden=owner;
  }
  publishState=async function(options={}){
    if(!options.catalog)return localSave();
    if(!ready)return {ok:false,reason:'Shared menu is still loading or unavailable. Retry shortly.'};
    if(!owner)return {ok:false,reason:'Verify your Owner email in Shared menu access first. Nothing was published.'};
    if(saving)return {ok:false,reason:'A save is already running. Please wait.'};
    saving=true;
    const payload=JSON.parse(JSON.stringify(snapshot()));
    try{
      const {data,error}=await client.rpc('save_catalog',{p_payload:payload,p_revision:revision});
      if(error)return {ok:false,reason:error.message};
      revision=data;baseline=JSON.stringify(payload);await localSave();
      $('publishLocalCatalog').hidden=true;notice('Saved online. Other browsers receive this menu automatically.');
      return {ok:true,shared:true};
    }finally{saving=false;}
  };
  const oldMessage=msgFor;
  msgFor=result=>result.ok&&result.shared?'Saved online for everyone.':oldMessage(result);
  $('catalogAuthForm').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('catalogSendLink');button.disabled=true;
    try{
      const {error}=await client.auth.signInWithOtp({email:$('catalogEmail').value.trim(),options:{emailRedirectTo:'https://kakarotshi0-commits.github.io/greenwonderland/'}});
      $('catalogAuthStatus').textContent=error?error.message:'Check your email and open the verification link in this browser. Then return to Shared menu access.';
    }finally{button.disabled=false;}
  });
  $('catalogSignOut').addEventListener('click',async()=>{await client.auth.signOut();await verifyOwner();});
  $('publishLocalCatalog').addEventListener('click',async()=>{
    if(!owner){notice('Verify your Owner email first.');return;}
    if(revision!==0){notice('A shared menu already exists. Reload to view it before editing.');return;}
    const result=await publishState({catalog:true});notice(msgFor(result));if(result.ok)paint();
  });
  $('reloadCatalog').addEventListener('click',()=>{
    if(JSON.stringify(snapshot())!==baseline && !confirm('Discard unsaved menu edits and load the shared menu?'))return;
    load(true);
  });
  client.auth.onAuthStateChange(()=>{setTimeout(verifyOwner,0);});
  verifyOwner();load();
  setInterval(()=>{if(!document.hidden)load();},15000);
  window.addEventListener('focus',()=>load());
})();
