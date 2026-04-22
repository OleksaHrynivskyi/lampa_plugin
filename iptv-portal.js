(function() {
  'use strict';

  // щоб не дублювався
  if (window.__iptvPortalPluginLoaded) return;
  window.__iptvPortalPluginLoaded = true;

  // назва в меню
  Lampa.Lang.add({
    iptv_portal: {
      ru: 'IPTV Portal',
      uk: 'IPTV Portal',
      en: 'IPTV Portal'
    }
  });

  // 🔥 ГОЛОВНЕ — редірект
  function openPortal() {
    var target = 'http://lampaua.mooo.com/lite/iptvportal/app?v=15&mode=list&player=0';

    // відкриває в тій же вкладці
    window.location.href = target;

    // якщо хочеш в новій вкладці — заміни на:
    // window.open(target, '_blank');
  }

  function menuIcon() {
    return '<svg><use xlink:href="#sprite-broadcast"></use></svg>';
  }

  function inject() {
    if (!window.Lampa || !Lampa.Menu || !Lampa.Menu.addButton || window.__iptvPortalMenuAdded)
      return;

    window.__iptvPortalMenuAdded = true;

    Lampa.Menu.addButton(
      menuIcon(),
      Lampa.Lang.translate('iptv_portal'),
      openPortal
    );
  }

  // чек поки лампа загрузиться
  if (window.appready) {
    inject();
  } else {
    Lampa.Listener.follow('app', function(e) {
      if (e.type === 'ready') inject();
    });
  }

})();
