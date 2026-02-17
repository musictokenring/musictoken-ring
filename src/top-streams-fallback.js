(function () {
  var region = 'latam';
  var offset = 0;
  var queries = { latam: 'latin', us: 'billboard', eu: 'europe top' };

  function getList() {
    return document.getElementById('streamDashboardTrackList');
  }

  function fallbackTracks(r) {
    var byRegion = {
      latam: [
 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz

 codex/find-reason-for-0%-songs-statistic-7dg0q0
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
        { title: 'Luna', artist: 'Feid', cover: 'https://e-cdns-images.dzcdn.net/images/cover/9f4c9025e2f4f4be85a8d0f95f3bc5fe/250x250-000000-80-0-0.jpg', stat: '• 34.8% del top' },
        { title: 'Si Antes Te Hubiera Conocido', artist: 'KAROL G', cover: 'https://e-cdns-images.dzcdn.net/images/cover/4aa4b9f4674f7f9f7428962456f31cc7/250x250-000000-80-0-0.jpg', stat: '• 33.1% del top' },
        { title: 'Perro Negro', artist: 'Bad Bunny', cover: 'https://e-cdns-images.dzcdn.net/images/cover/236f9df9f6f95cc8c6f0707dbe6839df/250x250-000000-80-0-0.jpg', stat: '• 32.1% del top' }
      ],
      us: [
        { title: 'Espresso', artist: 'Sabrina Carpenter', cover: 'https://e-cdns-images.dzcdn.net/images/cover/94bfaf6f3b278ba8e56ef8fca0ca65a4/250x250-000000-80-0-0.jpg', stat: '• 35.2% del top' },
        { title: 'Lose Control', artist: 'Teddy Swims', cover: 'https://e-cdns-images.dzcdn.net/images/cover/c025cd9e3f0980d7f33173f66c66fdfd/250x250-000000-80-0-0.jpg', stat: '• 33.0% del top' },
        { title: 'Beautiful Things', artist: 'Benson Boone', cover: 'https://e-cdns-images.dzcdn.net/images/cover/4ff4d2e2e89ae5fd3df5e6eabf78f8f6/250x250-000000-80-0-0.jpg', stat: '• 31.8% del top' }
      ],
      eu: [
        { title: "Stumblin' In", artist: 'Cyril', cover: 'https://e-cdns-images.dzcdn.net/images/cover/3f4b8cf4be2f16ebf3d6f8cfad8aa7c1/250x250-000000-80-0-0.jpg', stat: '• 35.0% del top' },
        { title: 'Mwaki', artist: 'Zerb', cover: 'https://e-cdns-images.dzcdn.net/images/cover/cc8f20c021f39d8444ec4f7f6d1d6e57/250x250-000000-80-0-0.jpg', stat: '• 33.2% del top' },
        { title: 'Texas Hold ’Em', artist: 'Beyoncé', cover: 'https://e-cdns-images.dzcdn.net/images/cover/c5dfcb2f5a13f5327dd58476fdd0f9ed/250x250-000000-80-0-0.jpg', stat: '• 31.8% del top' }
 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz


        { title: 'Luna', artist: 'Feid', cover: 'https://e-cdns-images.dzcdn.net/images/cover/9f4c9025e2f4f4be85a8d0f95f3bc5fe/250x250-000000-80-0-0.jpg' },
        { title: 'Si Antes Te Hubiera Conocido', artist: 'KAROL G', cover: 'https://e-cdns-images.dzcdn.net/images/cover/4aa4b9f4674f7f9f7428962456f31cc7/250x250-000000-80-0-0.jpg' },
        { title: 'Perro Negro', artist: 'Bad Bunny', cover: 'https://e-cdns-images.dzcdn.net/images/cover/236f9df9f6f95cc8c6f0707dbe6839df/250x250-000000-80-0-0.jpg' }
      ],
      us: [
        { title: 'Espresso', artist: 'Sabrina Carpenter', cover: 'https://e-cdns-images.dzcdn.net/images/cover/94bfaf6f3b278ba8e56ef8fca0ca65a4/250x250-000000-80-0-0.jpg' },
        { title: 'Lose Control', artist: 'Teddy Swims', cover: 'https://e-cdns-images.dzcdn.net/images/cover/c025cd9e3f0980d7f33173f66c66fdfd/250x250-000000-80-0-0.jpg' },
        { title: 'Beautiful Things', artist: 'Benson Boone', cover: 'https://e-cdns-images.dzcdn.net/images/cover/4ff4d2e2e89ae5fd3df5e6eabf78f8f6/250x250-000000-80-0-0.jpg' }
      ],
      eu: [
        { title: "Stumblin' In", artist: 'Cyril', cover: 'https://e-cdns-images.dzcdn.net/images/cover/3f4b8cf4be2f16ebf3d6f8cfad8aa7c1/250x250-000000-80-0-0.jpg' },
        { title: 'Mwaki', artist: 'Zerb', cover: 'https://e-cdns-images.dzcdn.net/images/cover/cc8f20c021f39d8444ec4f7f6d1d6e57/250x250-000000-80-0-0.jpg' },
        { title: 'Texas Hold ’Em', artist: 'Beyoncé', cover: 'https://e-cdns-images.dzcdn.net/images/cover/c5dfcb2f5a13f5327dd58476fdd0f9ed/250x250-000000-80-0-0.jpg' }
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
      ]
    };
    return byRegion[r] || byRegion.latam;
  }

 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47
 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz

 codex/find-reason-for-0%-songs-statistic-7dg0q0
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
  function applyCarouselPosition() {
    var list = getList();
    if (!list) return;
    var step = Math.max(220, Math.floor(list.clientWidth * 0.55));
    list.scrollTo({ left: offset * step, behavior: 'smooth' });
  }

 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz


 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
  function render(items) {
    var list = getList();
    if (!list) return;
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var t = items[i] || {};
      html += '<article class="stream-card">' +
        '<img src="' + (t.cover || '') + '" alt="' + (t.title || 'Track') + '">' +
        '<div class="stream-card-info">' +
        '<strong>' + (t.title || 'Sin título') + '</strong>' +
        '<span>' + (t.artist || 'Artista') + '</span>' +
 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz

 codex/find-reason-for-0%-songs-statistic-7dg0q0
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
        '<span class="stream-delta neutral">' + (t.stat || '• N/D') + '</span>' +
        '</div></article>';
    }
    list.innerHTML = html;
    applyCarouselPosition();
 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz


        '<span class="stream-delta neutral">• Cargando...</span>' +
        '</div></article>';
    }
    list.innerHTML = html;
    moveDashboardCarousel(0);
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
  }

  function updateRegionButtons(r) {
    var btns = document.querySelectorAll('.stream-region-tab');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      if (!btn || !btn.dataset) continue;
      btn.classList.toggle('active', btn.dataset.region === r);
    }
  }

  function loadFromDeezer(r) {
    var list = getList();
    if (!list) return;

    var cb = 'topStreamsCb_' + Date.now();
    var timeoutId = setTimeout(function () {
      if (window[cb]) {
        delete window[cb];
        render(fallbackTracks(r));
      }
    }, 6500);

    window[cb] = function (data) {
      clearTimeout(timeoutId);
      delete window[cb];
      var scriptEl = document.getElementById(cb);
      if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);

      var items = [];
      var rows = (data && data.data) ? data.data : [];
 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz

 codex/find-reason-for-0%-songs-statistic-7dg0q0
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
      var totalRank = 0;
      for (var i = 0; i < rows.length && i < 8; i++) {
        totalRank += Number(rows[i] && rows[i].rank ? rows[i].rank : 0);
      }

      for (var i = 0; i < rows.length && i < 8; i++) {
        var row = rows[i] || {};
        var rank = Number(row.rank || 0);
        var stat = '• N/D';
        if (rank > 0 && totalRank > 0) {
          stat = '• ' + ((rank / totalRank) * 100).toFixed(1) + '% del top';
        }
        items.push({
          title: row.title || 'Sin título',
          artist: row.artist && row.artist.name ? row.artist.name : 'Artista',
          cover: row.album && row.album.cover_medium ? row.album.cover_medium : '',
          stat: stat
 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz


      for (var i = 0; i < rows.length && i < 8; i++) {
        var row = rows[i] || {};
        items.push({
          title: row.title || 'Sin título',
          artist: row.artist && row.artist.name ? row.artist.name : 'Artista',
          cover: row.album && row.album.cover_medium ? row.album.cover_medium : ''
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
        });
      }
      if (!items.length) items = fallbackTracks(r);
      render(items);
    };

    var script = document.createElement('script');
    script.id = cb;
    script.src = 'https://api.deezer.com/search?q=' + encodeURIComponent(queries[r] || 'music') + '&limit=8&output=jsonp&callback=' + cb;
    script.onerror = function () {
      clearTimeout(timeoutId);
      delete window[cb];
      render(fallbackTracks(r));
    };
    document.head.appendChild(script);
  }

  window.setDashboardRegion = function (r) {
    region = r || 'latam';
    updateRegionButtons(region);
    render(fallbackTracks(region));
    loadFromDeezer(region);
  };

  window.moveDashboardCarousel = function (direction) {
 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz

 codex/find-reason-for-0%-songs-statistic-7dg0q0
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
feature/wall-street-v2
    if (typeof direction === 'number') {
      offset = Math.max(0, offset + direction);
    }
    applyCarouselPosition();
 codex/find-reason-for-0%-songs-statistic-usqut1

 codex/find-reason-for-0%-songs-statistic-ho6y47

 codex/find-reason-for-0%-songs-statistic-kq346f

 codex/find-reason-for-0%-songs-statistic-n3env6

 codex/find-reason-for-0%-songs-statistic-c0lumz


    var list = getList();
    if (!list) return;
    if (typeof direction === 'number') {
      offset = Math.max(0, offset + direction);
    }
    var step = Math.max(220, Math.floor(list.clientWidth * 0.55));
    list.scrollTo({ left: offset * step, behavior: 'smooth' });
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
 feature/wall-street-v2
  };

  function boot() {
    render(fallbackTracks(region));
    loadFromDeezer(region);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
