(function(root) {
  function getLaunchState(state) {
    const account = state.accounts?.find(a => a.id === state.selectedAccount);
    const instance = state.instances?.find(i => i.id === state.selectedInstance);
    if (state.stopping) return { disabled:true, label:'Останавливаем…', hint:'Дождитесь закрытия Minecraft.', action:'' };
    if (state.running) return { disabled:!!state.busy, label:'■  Остановить', hint:'Minecraft запущен. Кнопка остановит игру.', action:'' };
    if (state.busy) return { disabled:true, label:'Подождите…', hint:state.operation || 'Выполняется операция. Дождитесь её завершения.', action:'' };
    if (!account) return { disabled:true, label:'▶  Играть', hint:'Сначала войдите через Microsoft с лицензией Minecraft Java.', action:'account' };
    const owner=account.type==='microsoft'?account:null;
    if(!owner?.licenseVerified)return {disabled:true,label:'▶  Играть',hint:'Для запуска нужна лицензия Minecraft Java. Войдите через Microsoft с лицензированным аккаунтом.',action:'license'};
    if (!instance) return { disabled:true, label:'▶  Играть', hint:state.instances?.length?'Выберите сборку из списка рядом с кнопкой «Играть».':'Создайте сборку или импортируйте .mrpack, затем выберите её для запуска.', action:'instance' };
    return { disabled:false, label:'▶  Играть', hint:`Всё готово · ${instance.name} · в игре ${owner.name}`, action:'' };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { getLaunchState };
  else root.getLaunchState = getLaunchState;
})(typeof window !== 'undefined' ? window : globalThis);
