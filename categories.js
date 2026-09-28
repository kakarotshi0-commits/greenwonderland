function renderCategoryAdmin() {
  const rows=document.getElementById('categoryRows');
  rows.replaceChildren();
  CATS.forEach(category=>{
    const row=document.createElement('div');row.className='row';
    const name=document.createElement('span');
    const count=STATE.menu.filter(item=>item.category===category).length;
    name.textContent=category+' · '+count+' items';
    const target=document.createElement('select');target.setAttribute('aria-label','Move items from '+category+' to');
    const prompt=new Option('Move items to…','');target.add(prompt);
    CATS.filter(c=>c!==category).forEach(c=>target.add(new Option(c,c)));
    target.hidden=count===0;
    const remove=document.createElement('button');remove.type='button';remove.className='btn small';remove.textContent='Remove '+category;
    remove.disabled=CATS.length<=1;
    remove.addEventListener('click',async()=>{
      if(!signedIn || !getPerms(signedIn.role).categories)return;
      const message=document.getElementById('categoryMsg');
      if(CATS.length<=1){message.textContent='Keep at least one category.';return;}
      const items=STATE.menu.filter(item=>item.category===category);
      if(items.length && (!target.value || target.value===category || !CATS.includes(target.value))){message.textContent='Choose a destination for the items first.';return;}
      const previous=[...CATS];items.forEach(item=>item.category=target.value);
      CATS.splice(CATS.indexOf(category),1);
      const result=await publishState({catalog:true});
      if(!result.ok){CATS.splice(0,CATS.length,...previous);items.forEach(item=>item.category=category);message.textContent=msgFor(result);return;}
      if(activeCat===category)activeCat='All';
      refreshCategories();message.textContent='Category removed. Items kept. '+msgFor(result);
    });
    row.append(name,target,remove);rows.append(row);
  });
}
function refreshCategories(){
  const select=document.getElementById('mCat'),value=select.value;
  select.replaceChildren(...CATS.map(c=>new Option(c,c)));
  if(CATS.includes(value))select.value=value;
  renderCategoryAdmin();renderMenuAdmin();renderMenu();renderCrewPanel();
}
document.getElementById('addCategory').addEventListener('click',async()=>{
  if(!signedIn || !getPerms(signedIn.role).categories)return;
  const input=document.getElementById('newCategory'),name=input.value.trim(),message=document.getElementById('categoryMsg');
  if(!name || name.length>40){message.textContent='Enter a category name of 1–40 characters.';return;}
  if(name.toLowerCase()==='all' || CATS.some(c=>c.toLowerCase()===name.toLowerCase())){message.textContent='That category already exists or is reserved.';return;}
  CATS.push(name);const result=await publishState({catalog:true});
  if(!result.ok){CATS.pop();message.textContent=msgFor(result);return;}
  input.value='';refreshCategories();message.textContent='Category added. '+msgFor(result);
});
if(signedIn && getPerms(signedIn.role).categories)renderCategoryAdmin();
