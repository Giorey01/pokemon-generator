(function () {
  var POKEMON = window.POKEMON; // [numero, nome, [id tipi], complessità]
  var TYPES = window.TYPES;
  var TYPE_COLORS = {
    1: '#9a9a6b', 2: '#b3261e', 3: '#8f7fe0', 4: '#93358f', 5: '#c9a94a', 6: '#a8922f',
    7: '#8f9e17', 8: '#5f4a8a', 9: '#8f8fa8', 10: '#e06a1c', 11: '#4a7be0', 12: '#5aa83a',
    13: '#d9a900', 14: '#e0457a', 15: '#5fb3b3', 16: '#5a2ee0', 17: '#5a463a', 18: '#d9709a'
  };
  var MAX_QTY = 20;

  var $ = function (id) { return document.getElementById(id); };
  var qty = $('qty'), type = $('type'), cmin = $('cmin'), cmax = $('cmax');

  // --- costruzione dei menu ---
  function option(value, text) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    return o;
  }
  type.appendChild(option('', '-- Qualsiasi tipo --'));
  Object.keys(TYPES)
    .sort(function (a, b) { return TYPES[a].localeCompare(TYPES[b], 'it'); })
    .forEach(function (id) { type.appendChild(option(id, TYPES[id])); });
  for (var i = 1; i <= 10; i++) {
    cmin.appendChild(option(i, i));
    cmax.appendChild(option(i, i));
  }
  cmax.value = 10;

  // --- filtri ---
  function readQty() {
    var n = parseInt(qty.value, 10);
    if (isNaN(n) || n < 1) n = 1;
    if (n > MAX_QTY) n = MAX_QTY;
    return n;
  }

  function candidates() {
    var t = type.value ? parseInt(type.value, 10) : null;
    var lo = parseInt(cmin.value, 10), hi = parseInt(cmax.value, 10);
    return POKEMON.filter(function (p) {
      return (t === null || p[2].indexOf(t) !== -1) && p[3] >= lo && p[3] <= hi;
    });
  }

  function updatePool() {
    $('pool').textContent = 'Pokémon disponibili con questi filtri: ' + candidates().length;
  }

  // se "da" supera "a" (o viceversa) l'altro estremo lo segue
  cmin.addEventListener('change', function () {
    if (+cmin.value > +cmax.value) cmax.value = cmin.value;
    updatePool();
  });
  cmax.addEventListener('change', function () {
    if (+cmax.value < +cmin.value) cmin.value = cmax.value;
    updatePool();
  });
  type.addEventListener('change', updatePool);
  qty.addEventListener('change', function () { qty.value = readQty(); });

  Array.prototype.forEach.call(document.querySelectorAll('[data-qty]'), function (b) {
    b.addEventListener('click', function () { qty.value = b.getAttribute('data-qty'); });
  });

  // --- estrazione ---
  function sample(list, n) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a.slice(0, n);
  }

  function pad(n) { return ('000' + n).slice(-4); }

  function card(p) {
    var el = document.createElement('div');
    el.className = 'card';

    var head = document.createElement('div');
    head.className = 'card-head';
    head.textContent = 'N° ' + pad(p[0]);
    el.appendChild(head);

    var img = document.createElement('img');
    img.className = 'px';
    img.src = 'sprites/' + p[0] + '.png';
    img.alt = p[1];
    img.width = 144;
    img.height = 144;
    el.appendChild(img);

    var name = document.createElement('div');
    name.className = 'name';
    name.textContent = p[1];
    el.appendChild(name);

    var types = document.createElement('div');
    types.className = 'types';
    p[2].forEach(function (t) {
      var s = document.createElement('span');
      s.className = 'type';
      s.style.background = TYPE_COLORS[t];
      s.textContent = TYPES[t];
      types.appendChild(s);
    });
    el.appendChild(types);

    var cx = document.createElement('div');
    cx.className = 'cx';
    cx.appendChild(document.createTextNode('Complessità: '));
    var bar = document.createElement('span');
    bar.className = 'bar';
    for (var i = 1; i <= 10; i++) {
      var seg = document.createElement('i');
      if (i <= p[3]) seg.className = 'on';
      bar.appendChild(seg);
    }
    cx.appendChild(bar);
    var b = document.createElement('b');
    b.textContent = ' ' + p[3] + '/10';
    cx.appendChild(b);
    el.appendChild(cx);

    return el;
  }

  function generate() {
    var n = readQty();
    qty.value = n;
    var pool = candidates();
    var picked = sample(pool, n);
    var results = $('results'), notice = $('notice');

    results.textContent = '';
    if (picked.length === 0) {
      notice.textContent = 'ATTENZIONE: nessun Pokémon corrisponde a questi filtri. Prova ad allargare la complessità o a cambiare tipo.';
      notice.hidden = false;
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'La ricerca non ha prodotto risultati.';
      results.appendChild(empty);
      return;
    }
    if (picked.length < n) {
      notice.textContent = 'ATTENZIONE: ne hai chiesti ' + n + ' ma con questi filtri ' +
        (picked.length === 1 ? 'è stato trovato solo 1 risultato.' : 'sono stati trovati solo ' + picked.length + ' risultati.');
      notice.hidden = false;
    } else {
      notice.hidden = true;
    }
    picked.forEach(function (p) { results.appendChild(card(p)); });

    $('last').textContent = picked[picked.length - 1][1];
    bumpDraws();
  }

  $('go').addEventListener('click', generate);
  $('reset').addEventListener('click', function () {
    qty.value = 1;
    type.value = '';
    cmin.value = 1;
    cmax.value = 10;
    $('notice').hidden = true;
    updatePool();
  });

  // --- contatore estrazioni (solo su questo browser) ---
  var draws = 0;
  try { draws = parseInt(localStorage.getItem('draws'), 10) || 0; } catch (e) {}
  $('draws').textContent = draws;
  function bumpDraws() {
    draws++;
    $('draws').textContent = draws;
    try { localStorage.setItem('draws', draws); } catch (e) {}
  }

  $('today').textContent = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  updatePool();
})();
