(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  //  ▼▼▼ ВСТАВ СВІЙ GOOGLE API КЛЮЧ СЮДИ ▼▼▼
  // ═══════════════════════════════════════════════════════════
  var YT_API_KEY = 'ВСТАВ_СВІЙ_КЛЮЧ_ТУТ';
  // ═══════════════════════════════════════════════════════════

  var YT_API     = 'https://www.googleapis.com/youtube/v3';
  var STREAM_HOST = 'https://beta.l-vid.online'; // для отримання посилань на відео

  // ── Отримати URL для стріму (як в оригінальному плагіні) ──
  function streamUrl(videoId, title) {
    var token = Lampa.Storage.get('account_token', '');
    var uid   = Lampa.Storage.get('lampac_unic_id', '');
    return STREAM_HOST + '/lite/youtube' +
           '?videoID=' + encodeURIComponent(videoId) +
           '&title='   + encodeURIComponent(title) +
           '&token='   + encodeURIComponent(token) +
           '&uid='     + encodeURIComponent(uid);
  }

  // ── YouTube Data API ─────────────────────────────────────
  function ytFetch(endpoint, params, onSuccess, onError) {
    params.key = YT_API_KEY;
    $.ajax({
      url: YT_API + endpoint,
      data: params,
      timeout: 10000,
      dataType: 'json',
      success: onSuccess,
      error: function (xhr) {
        var msg = 'Помилка API';
        try {
          var e = JSON.parse(xhr.responseText);
          if (e.error && e.error.message) msg = e.error.message;
        } catch (_) {}
        onError(msg);
      }
    });
  }

  // ── CSS ──────────────────────────────────────────────────
  var cssInjected = false;
  function injectCSS() {
    if (cssInjected) return;
    cssInjected = true;
    var s = document.createElement('style');
    s.textContent = [
      '.ytfeed-tabs{display:flex;gap:.6em;padding:1em 1.5em .5em;flex-shrink:0}',
      '.ytfeed-tab{display:flex;align-items:center;gap:.4em;padding:.4em 1em;border-radius:1em;',
      'background:rgba(255,255,255,.08);color:rgba(255,255,255,.6);font-size:.9em;',
      'white-space:nowrap;cursor:pointer;transition:all .2s}',
      '.ytfeed-tab.focus{background:rgba(255,255,255,.2);color:#fff}',
      '.ytfeed-tab.active{background:#fff;color:#000}',
      '.ytfeed-tab.active.focus{background:#e0e0e0;color:#000}',
      '.ytfeed-tab svg{width:1.1em;height:1.1em;flex-shrink:0}',
      '.ytfeed-empty{padding:2em 1.5em;opacity:.45;font-size:1.1em}',
      '.ytfeed-channel{font-size:.75em;opacity:.6;overflow:hidden;',
      'text-overflow:ellipsis;white-space:nowrap;max-width:100%}',
    ].join('');
    document.head.appendChild(s);
  }

  var ICONS = {
    home:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
    trend:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>',
  };

  // ═══════════════════════════════════════════════════════
  //  Компонент
  // ═══════════════════════════════════════════════════════
  function YouTubeFeed(object) {
    var scroll      = new Lampa.Scroll({ mask: true, over: true });
    var html        = $('<div></div>');
    var head        = $('<div class="ytfeed-tabs"></div>');
    var body        = $('<div></div>');
    var active_zone = 'content';
    var last_tab, last_card;
    var activeTab   = 'home';
    var lastSearch  = '';
    var tabButtons  = {};
    var currentAjax = null;

    var TABS = [
      { id: 'home',   title: 'Головна', icon: ICONS.home },
      { id: 'trend',  title: 'Тренди',  icon: ICONS.trend },
      { id: 'search', title: 'Пошук',   icon: ICONS.search },
    ];

    // ── Контролери ──────────────────────────────────────
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

    // ── Створення ───────────────────────────────────────
    this.create = function () {
      injectCSS();

      TABS.forEach(function (tab) {
        var btn = $('<div class="ytfeed-tab selector">' + tab.icon + '<span>' + tab.title + '</span></div>');
        if (tab.id === activeTab) btn.addClass('active');
        tabButtons[tab.id] = btn;

        btn.on('hover:focus',           function () { btn.addClass('focus'); last_tab = btn[0]; });
        btn.on('hover:hover',           function () { btn.addClass('focus'); });
        btn.on('hover:exit hover:blur', function () { btn.removeClass('focus'); });
        btn.on('hover:enter',           function () { switchTab(tab.id); });
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
      body.empty(); last_card = null;
      if (currentAjax) { currentAjax.abort(); currentAjax = null; }
    }

    // ── Завантаження ────────────────────────────────────
    function loadHome() {
      resetBody(); object.activity.loader(true);
      ytFetch('/videos', {
        part: 'snippet,contentDetails', chart: 'mostPopular',
        regionCode: 'UA', hl: 'uk', maxResults: 30,
      }, function (data) {
        object.activity.loader(false);
        var items = data.items || [];
        if (!items.length) { showEmpty('Немає даних'); activateContent(); return; }
        buildGrid('Популярне в Україні 🇺🇦', items, true);
        activateContent();
      }, function (msg) {
        object.activity.loader(false); showEmpty('Помилка: ' + msg); activateContent();
      });
    }

    function loadTrending() {
      resetBody(); object.activity.loader(true);
      ytFetch('/videos', {
        part: 'snippet,contentDetails', chart: 'mostPopular',
        regionCode: 'UA', hl: 'uk', videoCategoryId: '10', maxResults: 20,
      }, function (music) {
        buildGrid('Музика 🎵', music.items || [], true);
        ytFetch('/videos', {
          part: 'snippet,contentDetails', chart: 'mostPopular',
          regionCode: 'UA', hl: 'uk', videoCategoryId: '20', maxResults: 20,
        }, function (gaming) {
          object.activity.loader(false);
          buildGrid('Ігри 🎮', gaming.items || [], true);
          activateContent();
        }, function () { object.activity.loader(false); activateContent(); });
      }, function (msg) {
        object.activity.loader(false); showEmpty('Помилка: ' + msg); activateContent();
      });
    }

    function openSearch() {
      Lampa.Input.edit({ title: 'Пошук YouTube', value: lastSearch, free: true, nosave: true },
        function (value) {
          if (value && value.trim()) { lastSearch = value.trim(); doSearch(lastSearch); }
          else Lampa.Controller.toggle(active_zone);
        });
    }

    function doSearch(query) {
      resetBody(); object.activity.loader(true);
      ytFetch('/search', {
        part: 'snippet', q: query, type: 'video',
        regionCode: 'UA', hl: 'uk', maxResults: 30,
      }, function (data) {
        object.activity.loader(false);
        var items = data.items || [];
        if (!items.length) { showEmpty('Нічого: «' + query + '»'); activateContent(); return; }

        var ids = items.map(function (i) { return i.id.videoId; }).join(',');
        ytFetch('/videos', { part: 'contentDetails', id: ids }, function (details) {
          var dur = {};
          (details.items || []).forEach(function (d) { dur[d.id] = d.contentDetails.duration; });
          items.forEach(function (i) { i._duration = dur[i.id.videoId] || ''; });
          buildSearchGrid('Результати: ' + query, items);
          activateContent();
        }, function () { buildSearchGrid('Результати: ' + query, items); activateContent(); });
      }, function (msg) {
        object.activity.loader(false); showEmpty('Помилка: ' + msg); activateContent();
      });
    }

    // ── Побудова карток ─────────────────────────────────
    function buildGrid(title, items, hasContentDetails) {
      if (!items.length) return;
      appendTitle(title);
      var grid = $('<div class="category-full"></div>');
      items.forEach(function (item) {
        var videoId  = typeof item.id === 'string' ? item.id : (item.id.videoId || '');
        var snippet  = item.snippet || {};
        var duration = hasContentDetails ? parseDuration((item.contentDetails || {}).duration || '') : '';
        grid.append(makeCard(videoId, snippet.title || '', snippet.channelTitle || '',
                             bestThumb(snippet.thumbnails), duration));
      });
      body.append(grid);
    }

    function buildSearchGrid(title, items) {
      if (!items.length) return;
      appendTitle(title);
      var grid = $('<div class="category-full"></div>');
      items.forEach(function (item) {
        var snippet = item.snippet || {};
        grid.append(makeCard(item.id.videoId || '', snippet.title || '', snippet.channelTitle || '',
                             bestThumb(snippet.thumbnails), parseDuration(item._duration || '')));
      });
      body.append(grid);
    }

    function appendTitle(title) {
      body.append($('<div class="items-line__head" style="padding-top:.3em">' +
        '<div class="items-line__title">' + escapeHtml(title) + '</div></div>'));
    }

    function makeCard(videoId, title, channel, thumb, duration) {
      var card = Lampa.Template.get('card', { title: title });
      card.addClass('card--collection selector');
      card.find('.card__img').attr('src', thumb);

      var age = card.find('.card__age');
      if (channel) age.text(channel).addClass('ytfeed-channel'); else age.remove();
      if (duration) card.find('.card__view').append('<div class="card__type">' + escapeHtml(duration) + '</div>');

      card.on('hover:focus', function () { last_card = card[0]; scroll.update(card, true); });
      card.on('hover:enter', function () { openVideo(videoId, title); });
      return card;
    }

    // ── Відтворення (як в оригінальному плагіні) ────────
    function openVideo(videoId, title) {
      if (!videoId) return;

      var xhr;
      Lampa.Loading.start(function () { if (xhr) xhr.abort(); });

      xhr = $.ajax({
        url:      streamUrl(videoId, title),
        timeout:  120000,
        dataType: 'json',
        success: function (data) {
          Lampa.Loading.stop();
          if (data && data.method === 'play') {
            Lampa.Player.play(data);
          } else if (data && data.error) {
            Lampa.Noty.show(data.error);
          } else {
            Lampa.Noty.show('Не вдалося отримати посилання на відео');
          }
        },
        error: function (jqXHR) {
          Lampa.Loading.stop();
          if (jqXHR.statusText === 'abort') return;
          var msg = 'Помилка завантаження відео';
          if (jqXHR.status === 0) msg = 'Таймаут — сервер не відповів';
          Lampa.Noty.show(msg);
        }
      });
    }

    // ── Утиліти ─────────────────────────────────────────
    function bestThumb(t) {
      if (!t) return '';
      return (t.medium || t.high || t.default || {}).url || '';
    }

    function parseDuration(iso) {
      if (!iso) return '';
      var m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!m) return '';
      var h = parseInt(m[1] || 0), min = parseInt(m[2] || 0), s = parseInt(m[3] || 0);
      return h ? h + ':' + pad(min) + ':' + pad(s) : pad(min) + ':' + pad(s);
    }

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    function escapeHtml(str) {
      var d = document.createElement('div');
      d.appendChild(document.createTextNode(String(str)));
      return d.innerHTML;
    }

    function showEmpty(text) { body.append($('<div class="ytfeed-empty"></div>').text(text)); }

    function activateContent() {
      scroll.update(body);
      if (body.find('.selector').length) Lampa.Controller.toggle('content');
      else Lampa.Controller.toggle('head');
    }

    // ── Lifecycle ────────────────────────────────────────
    this.start = function () {
      Lampa.Controller.add('head', ctrl_head);
      Lampa.Controller.add('content', ctrl_content);
      Lampa.Controller.toggle(active_zone);
    };
    this.pause   = function () {};
    this.stop    = function () {};
    this.render  = function () { return html; };
    this.destroy = function () {
      if (currentAjax) currentAjax.abort();
      scroll.destroy(); body.remove();
    };
  }

  Lampa.Component.add('youtube_feed', YouTubeFeed);

  // ── Кнопка меню ─────────────────────────────────────────
  function addMenuButton() {
    if ($('.menu__item[data-action="youtube_feed"]').length) return;
    var btn = $(
      '<li class="menu__item selector" data-action="youtube_feed">' +
        '<div class="menu__ico"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545' +
        's-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814' +
        'a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505' +
        'a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z' +
        'M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="currentColor"/></svg></div>' +
        '<div class="menu__text">YouTube</div></li>'
    );
    btn.on('hover:enter', function () {
      Lampa.Activity.push({ url: '', title: 'YouTube', component: 'youtube_feed', page: 1 });
    });
    var settings = $('.menu .menu__list .menu__item[data-action="settings"]');
    if (settings.length) settings.before(btn); else $('.menu .menu__list').eq(0).append(btn);
  }

  if (window.appready) addMenuButton();
  else Lampa.Listener.follow('app', function (e) { if (e.type === 'ready') addMenuButton(); });

})();
