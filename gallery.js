(() => {
  const API = 'https://wtiefpuczygmyjaampdg.supabase.co';
  const KEY = 'sb_publishable_raWlqZYNpGUfZ05HT07u4g_mlQhGdif';
  const PAGE = 12;
  let communityLimit = PAGE, busy = false, again = false;
  const previews = new Map();
  const $ = id => document.getElementById(id);
  // Any signed-in crew member can add a crew photo (staff: only their own). Only the Owner can remove one.
  const TOP = ['owner', 'admin', 'administrator'];
  const roleOf = () => String((signedIn && signedIn.role) || '').trim().toLowerCase();
  const canUploadCrew = () => !!signedIn;
  const isTop = () => !!signedIn && TOP.includes(roleOf());
  const isOwner = () => !!signedIn && roleOf() === 'owner';
  function getPin(message) {   // the code is kept in memory only; ask again if this tab lost it
    if (!window.gwPin) { const p = window.prompt(message || 'Enter your staff code to continue:'); if (p && p.trim()) window.gwPin = p.trim(); }
    return window.gwPin || '';
  }
  const crewUpload = $('crewPhotoForm').closest('details');
  const crewNotice = document.createElement('p');
  crewNotice.className = 'gallery-permission-note';
  crewNotice.textContent = 'Sign in through the Crew panel to add your crew photo.';
  crewUpload.before(crewNotice);
  function fillMembers() {   // Owner/Admin choose anyone; everyone else sees only themselves
    const sel = $('crewPhotoMember'), cur = sel.value;
    const list = isTop() ? STATE.roster : STATE.roster.filter(p => signedIn && p.id === signedIn.id);
    sel.replaceChildren();
    if (isTop() || !list.length) { const ph = document.createElement('option'); ph.value = ''; ph.textContent = 'Choose a crew member'; sel.append(ph); }
    list.forEach(person => { const o = document.createElement('option'); o.value = person.id; o.textContent = person.name + ' \u00b7 ' + person.role; sel.append(o); });
    sel.value = isTop() ? (list.some(p => p.id === cur) ? cur : '') : (list[0] ? list[0].id : '');
  }
  function updateCrewPermission() {
    fillMembers();
    const allowed = canUploadCrew();
    crewUpload.hidden = !allowed;
    crewUpload.style.display = allowed ? '' : 'none';
    crewNotice.hidden = allowed;
    if (!allowed) crewUpload.open = false;
    crewUpload.querySelectorAll('input,select,textarea,button').forEach(control => control.disabled = !allowed);
  }
  document.addEventListener('gw-permissions-changed', () => { updateCrewPermission(); loadGalleries(); });
  updateCrewPermission();
  async function request(path, options = {}) {
    const response = await fetch(API + path, {...options, headers: {apikey: KEY, ...options.headers}});
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.message || result.error || 'Photo service is temporarily unavailable. Please try again.');
    }
    return response.status === 204 ? null : response.json();
  }
  function imageUrl(path) {
    return API + '/storage/v1/object/public/gw-gallery/' + path.split('/').map(encodeURIComponent).join('/');
  }
  function photoCard(photo, person) {
    const card = document.createElement('article'); card.className = 'gallery-photo';
    const media = document.createElement(photo ? 'button' : 'div'); media.className = 'gallery-photo-media';
    if (photo) {
      media.type = 'button'; media.setAttribute('aria-label', 'View photo by ' + photo.author);
      const img = document.createElement('img'); img.src = imageUrl(photo.object_path); img.alt = photo.caption || 'Photo by ' + photo.author; img.loading = 'lazy';
      media.append(img); media.addEventListener('click', () => openPhoto(photo));
    } else {
      const initials = document.createElement('span'); initials.className = 'gallery-initials'; initials.textContent = person.name.split(/\s+/).map(n => n[0]).join('').slice(0,2);
      const hint = document.createElement('span'); hint.textContent = 'Photo coming soon'; media.append(initials, hint);
    }
    const body = document.createElement('div'); body.className = 'gallery-photo-body';
    const name = document.createElement('h3'); name.textContent = person?.name || photo.author; body.append(name);
    const detail = document.createElement('p'); detail.textContent = person ? person.role : new Date(photo.created_at).toLocaleDateString(); body.append(detail);
    if (photo?.caption) {const caption = document.createElement('p'); caption.className='gallery-caption'; caption.textContent=photo.caption; body.append(caption);}
    if (photo && photo.gallery === 'crew' && isOwner()) {
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'btn small'; rm.textContent = 'Remove photo';
      rm.addEventListener('click', () => removePhoto(photo)); body.append(rm);
    }
    card.append(media,body); return card;
  }
  async function removePhoto(photo) {
    if (!confirm('Remove this crew photo for everyone? This cannot be undone.')) return;
    const pin = getPin('Enter your Owner code to remove this photo:'); if (!pin) return;
    try {
      const res = await request('/rest/v1/rpc/gw_gallery_remove', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({p_pin: pin, p_id: photo.id})});
      if (res && res.ok === false) { window.gwPin = null; throw new Error(res.msg || 'Not allowed.'); }
      await loadGalleries();
    } catch (error) { alert('Could not remove the photo. ' + error.message); }
  }
  function openPhoto(photo) {
    $('galleryFullImage').src=imageUrl(photo.object_path); $('galleryFullImage').alt=photo.caption || photo.author;
    $('galleryFullTitle').textContent=photo.author; $('galleryFullCaption').textContent=photo.caption;
    $('galleryLightbox').showModal();
  }
  async function loadGalleries() {
    if (busy) { again = true; return; } busy=true;
    $('galleryLoadStatus').textContent='Loading shared photos…';
    try {
      const crewIds=STATE.roster.map(p=>p.id);
      const [crew,community]=await Promise.all([
        request('/rest/v1/gallery_photos?select=*&gallery=eq.crew&order=created_at.desc&limit=500'),
        request('/rest/v1/gallery_photos?select=*&gallery=eq.community&order=created_at.desc&limit='+(communityLimit+1))
      ]);
      $('crewGalleryGrid').replaceChildren(...STATE.roster.map(person => photoCard(crew.find(p=>p.crew_id===person.id),person)));
      $('communityGalleryGrid').replaceChildren(...community.slice(0,communityLimit).map(photo=>photoCard(photo)));
      $('communityEmpty').hidden=community.length>0;
      $('loadMorePhotos').hidden=community.length<=communityLimit;
      $('galleryLoadStatus').textContent='Photos are shared with everyone. Updated '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})+'.';
    } catch (error) { $('galleryLoadStatus').textContent='Could not load shared photos. '+error.message; }
    finally {busy=false; if (again) { again=false; loadGalleries(); }}
  }
  async function compress(file) {
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
    if(file.size>10*1024*1024) throw new Error('Please choose an image smaller than 10 MB.');
    const bitmap=await createImageBitmap(file);
    try {
      const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext('2d');context.fillStyle='#112016';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.78));
      if(!blob || blob.size>1048576) throw new Error('This image is too detailed. Try a smaller image.');
      return blob;
    } finally {bitmap.close();}
  }
  function bindUpload(kind) {
    const form=$(kind+'PhotoForm'), fileInput=$(kind+'PhotoFile'), status=$(kind+'PhotoStatus'), preview=$(kind+'PhotoPreview');
    let pending=null;
    fileInput.addEventListener('change',()=>{
      pending=null;status.textContent='';
      if(previews.has(kind)) URL.revokeObjectURL(previews.get(kind));
      const file=fileInput.files[0];preview.hidden=!file;
      if(file){const url=URL.createObjectURL(file);previews.set(kind,url);preview.src=url;}
      else preview.removeAttribute('src');
    });
    form.addEventListener('submit',async event=>{
      event.preventDefault();const button=form.querySelector('button[type=submit]');if(button.disabled)return;
      if(kind==='crew' && !canUploadCrew()){status.textContent='Please sign in to add a crew photo.';return;}
      const file=fileInput.files[0];if(!file){status.textContent='Choose a picture first.';return;}
      const person=kind==='crew'?STATE.roster.find(p=>p.id===$('crewPhotoMember').value):null;
      const author=person?person.name:$('communityPhotoName').value.trim();
      if(!author || (kind==='crew'&&!person)){status.textContent='Please select a crew member or enter your name.';return;}
      if(kind==='crew' && !isTop() && person.id!==signedIn.id){status.textContent='You can only add your own crew photo.';return;}
      button.disabled=true;status.textContent='Preparing your photo…';
      try {
        if(!pending){
          const blob=await compress(file), id=crypto.randomUUID(), path=kind+'/'+id+'.jpg';
          if(kind==='crew' && !canUploadCrew()) throw new Error('Please sign in first.');
          status.textContent='Uploading photo…';
          await request('/storage/v1/object/gw-gallery/'+path,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'false'},body:blob});
          pending={id,object_path:path};
        }
        status.textContent='Adding to the gallery…';
        if(kind==='crew' && !canUploadCrew()) throw new Error('Please sign in first.');
        const caption=$(kind+'PhotoCaption').value.trim();
        if(kind==='crew'){
          const pin=getPin('Enter your staff code to publish your crew photo:');
          if(!pin) throw new Error('Your staff code is needed.');
          const res=await request('/rest/v1/rpc/gw_crew_photo_add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_pin:pin,p_id:pending.id,p_object_path:pending.object_path,p_caption:caption,p_crew_id:person.id})});
          if(res&&res.ok===false){window.gwPin=null;throw new Error(res.msg||'Not allowed.');}
        } else {
          await request('/rest/v1/gallery_photos',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({...pending,gallery:kind,author,crew_id:null,caption})});
        }
        pending=null;form.reset();preview.hidden=true;preview.removeAttribute('src');
        if(previews.has(kind)){URL.revokeObjectURL(previews.get(kind));previews.delete(kind);}
        status.textContent='Your photo is live! Everyone can see it in the gallery.';
        await loadGalleries();
      } catch(error){status.textContent='Photo was not published. '+error.message+' You can retry.';}
      finally{button.disabled=kind==='crew' && !canUploadCrew();}
    });
  }
  $('crewGalleryGrid').replaceChildren(...STATE.roster.map(person=>photoCard(null,person)));
  bindUpload('crew');bindUpload('community');
  $('refreshPhotos').addEventListener('click',loadGalleries);
  $('loadMorePhotos').addEventListener('click',()=>{communityLimit+=PAGE;loadGalleries();});
  $('closeGalleryPhoto').addEventListener('click',()=>$('galleryLightbox').close());
  $('galleryLightbox').addEventListener('click',event=>{if(event.target===$('galleryLightbox'))$('galleryLightbox').close();});
  loadGalleries();
})();
