// Keep the select as the data model while rendering a full-width, searchable picker.
(function(){
 const pickers=new Map();let openPicker;
 class Picker{
  constructor(select){
   this.select=select;this.trigger=document.createElement('button');this.trigger.type='button';this.trigger.id=select.id+'-trigger';this.trigger.className='instance-trigger';this.trigger.setAttribute('role','combobox');this.trigger.setAttribute('aria-haspopup','listbox');this.trigger.setAttribute('aria-expanded','false');this.trigger.setAttribute('aria-label',select.id==='instance-select'?'Выбранная сборка':'Сборка для установки');
   select.classList.add('native-instance-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');select.after(this.trigger);
   const label=document.querySelector('label[for="'+select.id+'"]');if(label)label.htmlFor=this.trigger.id;
   this.trigger.onclick=()=>this.toggle();this.trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();this.show();this.focusOption(e.key==='ArrowUp'?-1:0);}};
   select.addEventListener('change',()=>this.refresh());new MutationObserver(()=>this.refresh()).observe(select,{childList:true,subtree:true,attributes:true});
   if(select.id==='instance-select'){const surface=select.closest('.launch-picker');surface.classList.add('clickable-picker');surface.addEventListener('click',e=>{if(!this.trigger.contains(e.target)){e.preventDefault();this.toggle();}});}
   this.refresh();
  }
  refresh(){
   const option=this.select.selectedOptions[0];this.trigger.replaceChildren();const text=document.createElement('span');text.className='instance-caption';const name=document.createElement('b');name.textContent=option?.textContent || 'Выберите сборку…';text.append(name);if(option?.dataset.detail){const detail=document.createElement('small');detail.textContent=option.dataset.detail;text.append(detail);}const arrow=document.createElement('span');arrow.className='picker-arrow';arrow.textContent='⌄';this.trigger.append(text,arrow);this.trigger.disabled=this.select.disabled;if(this.menu){if(this.select.disabled || !this.select.isConnected)this.close();else this.draw();}
  }
  toggle(){if(this.menu)this.close();else this.show();}
  show(){
   if(this.select.disabled)return;if(this.menu)return;openPicker?.close();openPicker=this;
   this.menu=document.createElement('div');this.menu.className='instance-menu';this.menu.id=this.select.id+'-menu';this.trigger.setAttribute('aria-controls',this.menu.id+'-list');this.trigger.setAttribute('aria-expanded','true');
   this.search=document.createElement('input');this.search.type='search';this.search.placeholder='Найти сборку…';this.search.setAttribute('aria-label','Поиск сборки');this.search.className='instance-menu-search';this.search.oninput=()=>this.draw();
   this.list=document.createElement('div');this.list.id=this.menu.id+'-list';this.list.className='instance-menu-list';this.list.setAttribute('role','listbox');this.list.setAttribute('aria-label','Сборки');this.menu.append(this.search,this.list);(this.select.closest('dialog') || document.body).append(this.menu);this.draw();this.position();this.search.focus();
   this.menu.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.close(true);}else if(e.key==='Enter' && e.target===this.search){e.preventDefault();this.options()[0]?.click();}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=this.options(),at=items.indexOf(document.activeElement);let next=e.key==='Home'?0:e.key==='End'?items.length-1:at+(e.key==='ArrowDown'?1:-1);if(next<0)next=items.length-1;if(next>=items.length)next=0;items[next]?.focus();}else if(e.key==='Tab')this.close();};
  }
  options(){return [...(this.list?.querySelectorAll('button:not(:disabled)') || [])];}
  focusOption(index){const items=this.options();items[index<0?items.length-1:index]?.focus();}
  draw(){
   if(!this.list)return;const query=(this.search?.value || '').trim().toLocaleLowerCase();this.list.replaceChildren();
   for(const option of this.select.options){if(!option.value || !(option.textContent+' '+(option.dataset.detail || '')).toLocaleLowerCase().includes(query))continue;const b=document.createElement('button');b.type='button';b.className='instance-option';b.setAttribute('role','option');b.setAttribute('aria-selected',String(option.selected));b.disabled=option.disabled;
    const icon=document.createElement('span');icon.className='instance-option-icon';icon.textContent=option.selected?'✓':'▧';const copy=document.createElement('span');const name=document.createElement('b');name.textContent=option.textContent;copy.append(name);if(option.dataset.detail){const detail=document.createElement('small');detail.textContent=option.dataset.detail;copy.append(detail);}b.append(icon,copy);
    b.onclick=()=>{this.select.value=option.value;this.close(true);this.select.dispatchEvent(new Event('change',{bubbles:true}));};this.list.append(b);
   }
   if(!this.list.children.length){const empty=document.createElement('p');empty.className='muted picker-empty';empty.textContent=this.select.options.length>1?'Сборка не найдена':'Сначала создайте сборку в «Мои сборки»';this.list.append(empty);}
  }
  position(){if(!this.menu)return;const r=this.trigger.getBoundingClientRect();const width=Math.min(Math.max(r.width,290),innerWidth-24);this.menu.style.width=width+'px';this.menu.style.left=Math.min(Math.max(12,r.left),innerWidth-width-12)+'px';const height=Math.min(330,this.menu.scrollHeight);const below=innerHeight-r.bottom-12;this.menu.style.top=(below>=height?r.bottom+8:Math.max(12,r.top-height-8))+'px';this.menu.style.maxHeight=Math.min(330,innerHeight-24)+'px';}
  close(focus=false){this.menu?.remove();this.menu=null;this.list=null;this.trigger.setAttribute('aria-expanded','false');if(openPicker===this)openPicker=null;if(focus)this.trigger.focus();}
 }
 document.addEventListener('pointerdown',e=>{if(openPicker && !openPicker.menu.contains(e.target) && !openPicker.trigger.contains(e.target) && !openPicker.select.closest('.launch-picker')?.contains(e.target))openPicker.close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape' && openPicker){e.preventDefault();openPicker.close(true);}},true);
 document.addEventListener('close',()=>openPicker?.close(),true);addEventListener('resize',()=>openPicker?.position());document.addEventListener('scroll',()=>openPicker?.position(),true);
 window.InstancePicker={enhance:select=>{if(!pickers.has(select.id))pickers.set(select.id,new Picker(select));return pickers.get(select.id);},refresh:()=>pickers.forEach(p=>p.refresh()),close:()=>openPicker?.close()};
})();
