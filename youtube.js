(function () {
  'use strict';

  // ─── Публічні Invidious-сервери (використовуються по черзі) ───
  var INVIDIOUS_HOSTS = [
    'https://invidious.nerdvpn.de',
    'https://invidious.privacydev.net',
    'https://inv.nadeko.net',
    'https://invidious.lunar.icu',
  ];

  var hostIndex = 0;

  function getHost() {
    return INVIDIOUS_HOSTS[hostIndex % INVIDIOUS_HOSTS.length];
  }

  function nextHost() {
    hostIndex++;
  }

  // ─── Invidious API ─────────────────────────────────────────
  function invApi(path) {
    return getHost() + '/api/v1' + path;
  }

  function invFetch(path, onSuccess, onError, _attempt) {
    var attempt = _attempt || 0;
    if (attempt >= INVIDIOUS_HOSTS.length) { onError('Всі сервери недоступні'); return; }

    $.ajax({
      url: invApi(path),
      timeout: 10000,
      dataType: 'json',
      success: onSuccess,
      error: function () {
        nextHost();
        invFetch(path, onSuccess, onError, attempt + 1);
      }
    });
  }

  // ─── CSS ───────────────────────────────────────────────────
  var cssInjected = false;
  function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;
    var s = document.createElement('style');
    s.textContent = [
      '.ytfeed-tabs{display:flex;gap:.6em;padding:1em 1.5em .5em;flex-shrink:0}',
      '.ytfeed-tab{display:flex;align-items:center;gap:.4em;padding:.4em 1em;border-radius:1em;',
      'background:rgba(255,255,255,.08);color:rgba(255,255,255,.6);font-size:.9em;white-space:nowrap;cursor:pointer;transition:all .2s}',
      '.ytfeed-tab.focus{background:rgba(255,255,255,.2);color:#fff}',
      '.ytfeed-tab.active{background:#fff;color:#000}',
      '.ytfeed-tab.active.focus{background:#e0e0e0;color:#000}',
      '.ytfeed-tab svg{width:1.1em;height:1.1em;flex-shrink:0}',
      '.ytfeed-empty{padding:2em 1.5em;opacity:.45;font-size:1.1em}',
      '.ytfeed-channel{font-size:.75em;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}',
      '.ytfeed-quality{display:flex;flex-direction:column;gap:.5em;padding:.5em 0}',
      '.ytfeed-quality-item{padding:.6em 1.2em;border-radius:.5em;background:rgba(255,255,255,.08);',
      'color:#fff;cursor:pointer;font-size:1em;transition:background .15s}',
      '.ytfeed-quality-item.focus{background:rgba(255,255,255,.25)}',
    ].join('');
    document.head.appendChild(s);
  }

  var ICONS = {
    home:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
    trend:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>',
  };

  // ═══════════════════════════════════════════════════════════
  //  Компонент
  // ═══════════════════════════════════════════════════════════
  function YouTubeFeed(object) {
    var scroll  = new Lampa.Scroll({ mask: true, over: true });
    var html    = $('<div></div>');
    var head    = $('<div class="ytfeed-tabs"></div>');
    var body    = $('<div></div>');

    var active_zone = 'content';
    var last_tab, last_card;
    var activeTab  = 'home';
    var lastSearch = '';
    var tabButtons = {};
    var currentXhr = null;

    var TABS = [
      { id: 'home',   title: 'Головна',  icon: ICONS.home },
      { id: 'trend',  title: 'Тренди',   icon: ICONS.trend },
      { id: 'search', title: 'Пошук',    icon: ICONS.search },
    ];

    // ── Контролери ──────────────────────────────────────────
    var ctrl_head = {
      toggle: function () {
        active_zone = 'head';
        Lampa.Controller.collectionSet(head);
        var t = (last_tab && $.contains(document.documentElement, last_tab))
                ? last_tab : tabButtons[activeTab][0];
        Lampa.Controller.collectionFocus(t, head);
      },
      left:  function () { Navigator.canmove('left') ? Navigator.move('left') : Lampa.Controller.toggle('menu'); },
      right: function () { Navigator.canmove('right') && Navigator.move('right'); },
      up:    function () {},
      down:  function () { body.find('.selector').length && Lampa.Controller.toggle('content'); },
      back:  function () { Lampa.Activity.backward(); }
    };

    var ctrl_content = {
      toggle: function () {
        active_zone = 'content';
        var t = (last_card && $.contains(document.documentElement, last_card))
                ? last_card : body.find('.selector').eq(0)[0];
        if (t) {
          Lampa.Controller.collectionSet(scroll.render());
          Lampa.Controller.collectionFocus(t, scroll.render());
        } else {
          Lampa.Controller.toggle('head');
        }
      },
      left:  function () { Navigator.canmove('left') ? Navigator.move('left') : Lampa.Controller.toggle('menu'); },
      right: function () { Navigator.canmove('right') && Navigator.move('right'); },
      up:    function () { Navigator.canmove('up') ? Navigator.move('up') : Lampa.Controller.toggle('head'); },
      down:  function () { Navigator.canmove('down') && Navigator.move('down'); },
      back:  function () { Lampa.Activity.backward(); }
    };

    // ── Створення ───────────────────────────────────────────
    this.create = function () {
      injectCSS();

      TABS.forEach(function (tab) {
        var btn = $('<div class="ytfeed-tab selector">' + tab.icon + '<span>' + tab.title + '</span></div>');
        if (tab.id === activeTab) btn.addClass('active');
        tabButtons[tab.id] = btn;

        btn.on('hover:focus',          function () { btn.addClass('focus'); last_tab = btn[0]; });
        btn.on('hover:hover',          function () { btn.addClass('focus'); });
        btn.on('hover:exit hover:blur',function () { btn.removeClass('focus'); });
        btn.on('hover:enter',          function () { switchTab(tab.id); });

        head.append(btn);
      });

      html.append(head);
      html.append(scroll.render());
      scroll.minus(head);
      scroll.append(body);

      object.activity.loader(true);
      loadHome();

      return this.render();
    };

    function switchTab(id) {
      if (id === activeTab && id !== 'search') return;
      activeTab = id;
      head.find('.ytfeed-tab').removeClass('active');
      if (tabButtons[id]) tabButtons[id].addClass('active');

      if (id === 'home')   loadHome();
      if (id === 'trend')  loadTrending();
      if (id === 'search') openSearch();
    }

    function resetBody() {
      body.empty();
      last_card = null;
      if (currentXhr) { currentXhr.abort(); currentXhr = null; }
    }

    // ── Завантаження даних ──────────────────────────────────

    function loadHome() {
      resetBody();
      object.activity.loader(true);

      // Популярні відео (trending загальне)
      invFetch('/trending?type=Default&region=UA', function (data) {
        object.activity.loader(false);
        if (!data || !data.length) { showEmpty('Немає даних'); activateContent(); return; }
        buildGrid('Популярне', data);
        activateContent();
      }, function () {
        object.activity.loader(false);
        showEmpty('Сервер Invidious недоступний. Спробуйте пізніше.');
        activateContent();
      });
    }

    function loadTrending() {
      resetBody();
      object.activity.loader(true);

      invFetch('/trending?type=Music&region=UA', function (music) {
        buildGrid('Музика 🎵', music || []);
        invFetch('/trending?type=Gaming&region=UA', function (gaming) {
          object.activity.loader(false);
          buildGrid('Ігри 🎮', gaming || []);
          activateContent();
        }, function () {
          object.activity.loader(false);
          activateContent();
        });
      }, function () {
        object.activity.loader(false);
        showEmpty('Помилка завантаження');
        activateContent();
      });
    }

    function openSearch() {
      Lampa.Input.edit({
        title: 'Пошук YouTube',
        value: lastSearch,
        free: true,
        nosave: true
      }, function (value) {
        if (value && value.trim()) {
          lastSearch = value.trim();
          doSearch(lastSearch);
        } else {
          Lampa.Controller.toggle(active_zone);
        }
      });
    }

    function doSearch(query) {
      resetBody();
      object.activity.loader(true);

      invFetch('/search?q=' + encodeURIComponent(query) + '&type=video', function (data) {
        object.activity.loader(false);
        var items = (data || []).filter(function (i) { return i.type === 'video'; });
        if (!items.length) { showEmpty('Нічого не знайдено: «' + query + '»'); activateContent(); return; }
        buildGrid('Результати: ' + query, items);
        activateContent();
      }, function () {
        object.activity.loader(false);
        showEmpty('Помилка пошуку');
        activateContent();
      });
    }

    // ── Побудова карток ─────────────────────────────────────

    function buildGrid(title, items) {
      if (!items.length) return;

      if (title) {
        body.append(
          $('<div class="items-line__head" style="padding-top:.3em">'+
            '<div class="items-line__title">' + escapeHtml(title) + '</div></div>')
        );
      }

      var grid = $('<div class="category-full"></div>');
      items.forEach(function (item) { grid.append(makeCard(item)); });
      body.append(grid);
    }

    function makeCard(item) {
      // Invidious: videoId, title, author, lengthSeconds, videoThumbnails[]
      var thumb = '';
      if (item.videoThumbnails && item.videoThumbnails.length) {
        // Беремо medium або перший доступний
        var tObj = item.videoThumbnails.find(function(t){ return t.quality === 'medium'; })
                || item.videoThumbnails[0];
        thumb = tObj.url || '';
        // Якщо відносний URL — додаємо хост
        if (thumb && thumb.indexOf('http') !== 0) thumb = getHost() + thumb;
      }

      var duration = '';
      if (item.lengthSeconds) {
        var s = item.lengthSeconds;
        duration = (s >= 3600 ? Math.floor(s/3600) + ':' : '') +
                   pad(Math.floor((s%3600)/60)) + ':' + pad(s%60);
      }

      var card = Lampa.Template.get('card', { title: item.title || '' });
      card.addClass('card--collection selector');
      card.find('.card__img').attr('src', thumb);

      var age = card.find('.card__age');
      if (item.author) age.text(item.author).addClass('ytfeed-channel');
      else age.remove();

      if (duration) {
        card.find('.card__view').append(
          '<div class="card__type">' + escapeHtml(duration) + '</div>'
        );
      }

      card.on('hover:focus', function () { last_card = card[0]; scroll.update(card, true); });
      card.on('hover:enter', function () { openVideo(item); });

      return card;
    }

    // ── Відтворення ─────────────────────────────────────────

    function openVideo(item) {
      var id = item.videoId;
      if (!id) return;

      Lampa.Loading.start(function () {
        if (currentXhr) currentXhr.abort();
      });

      // Отримуємо деталі відео з Invidious — там є adaptiveFormats та formatStreams
      currentXhr = $.ajax({
        url: invApi('/videos/' + id),
        timeout: 15000,
        dataType: 'json',
        success: function (data) {
          Lampa.Loading.stop();
          currentXhr = null;

          // Збираємо MP4-потоки (formatStreams — прямі MP4, без адаптивного стрімінгу)
          var streams = (data.formatStreams || []).filter(function (f) {
            return f.container === 'mp4';
          });

          // Якщо немає — беремо з adaptiveFormats тільки відео+аудіо разом (itag 18, 22)
          if (!streams.length) {
            streams = (data.adaptiveFormats || []).filter(function (f) {
              return f.container === 'mp4' && f.type && f.type.indexOf('video') !== -1;
            });
          }

          if (!streams.length) {
            Lampa.Noty.show('Не вдалося знайти MP4-потік для цього відео');
            return;
          }

          // Сортуємо по якості (більше — краще)
          streams.sort(function (a, b) {
            return (parseInt(b.resolution) || 0) - (parseInt(a.resolution) || 0);
          });

          if (streams.length === 1) {
            playStream(streams[0], data.title);
          } else {
            showQualityPicker(streams, data.title);
          }
        },
        error: function (jqXHR) {
          Lampa.Loading.stop();
          currentXhr = null;
          if (jqXHR.statusText === 'abort') return;
          // Якщо поточний сервер не відповів — пробуємо наступний
          nextHost();
          openVideo(item);
        }
      });
    }

    function playStream(stream, title) {
      Lampa.Player.play({
        title:  title || '',
        url:    stream.url,
        method: 'play',
      });
    }

    function showQualityPicker(streams, title) {
      // Показуємо меню вибору якості через Lampa.Select
      var items = streams.map(function (s) {
        return {
          title: s.qualityLabel || s.resolution || s.itag || 'MP4',
          stream: s
        };
      });

      Lampa.Select.show({
        title: 'Оберіть якість',
        items: items,
        onSelect: function (item) {
          playStream(item.stream, title);
        },
        onBack: function () {
          Lampa.Controller.toggle('content');
        }
      });
    }

    // ── Утиліти ─────────────────────────────────────────────

    function showEmpty(text) {
      body.append($('<div class="ytfeed-empty"></div>').text(text));
    }

    function activateContent() {
      scroll.update(body);
      if (body.find('.selector').length) {
        Lampa.Controller.toggle('content');
      } else {
        Lampa.Controller.toggle('head');
      }
    }

    function escapeHtml(str) {
      var d = document.createElement('div');
      d.appendChild(document.createTextNode(String(str)));
      return d.innerHTML;
    }

    function pad(n) {
      return n < 10 ? '0' + n : String(n);
    }

    // ── Lifecycle ────────────────────────────────────────────
    this.start = function () {
      Lampa.Controller.add('head', ctrl_head);
      Lampa.Controller.add('content', ctrl_content);
      Lampa.Controller.toggle(active_zone);
    };

    this.pause   = function () {};
    this.stop    = function () {};
    this.render  = function () { return html; };
    this.destroy = function () {
      if (currentXhr) currentXhr.abort();
      scroll.destroy();
      body.remove();
    };
  }

  Lampa.Component.add('youtube_feed', YouTubeFeed);

  // ── Кнопка в меню ───────────────────────────────────────
  function addMenuButton() {
    if ($('.menu__item[data-action="youtube_feed"]').length) return;

    var btn = $(
      '<li class="menu__item selector" data-action="youtube_feed">' +
        '<div class="menu__ico">' +
          '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545' +
            's-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814' +
            'a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505' +
            'a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z' +
            'M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="currentColor"/>' +
          '</svg>' +
        '</div>' +
        '<div class="menu__text">YouTube</div>' +
      '</li>'
    );

    btn.on('hover:enter', function () {
      Lampa.Activity.push({ url: '', title: 'YouTube', component: 'youtube_feed', page: 1 });
    });

    var settings = $('.menu .menu__list .menu__item[data-action="settings"]');
    if (settings.length) settings.before(btn);
    else $('.menu .menu__list').eq(0).append(btn);
  }

  if (window.appready) addMenuButton();
  else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') addMenuButton(); });

})();
