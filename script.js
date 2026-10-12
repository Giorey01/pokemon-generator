(function () {
  var POKEMON = window.POKEMON; // [numero, nome, [id tipi], complessità]
  var TYPES = window.TYPES;
  var MAX_QTY = 20;

  var $ = function (id) { return document.getElementById(id); };
  var qty = $('qty'), type = $('type'), type2 = $('type2'), cmin = $('cmin'), cmax = $('cmax');

  // --- costruzione dei menu ---
  function option(value, text) {
    var o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    return o;
  }
  type.appendChild(option('', '-- Qualsiasi tipo --'));
  type2.appendChild(option('', '-- Nessun secondo tipo --'));
  Object.keys(TYPES)
    .sort(function (a, b) { return TYPES[a].localeCompare(TYPES[b], 'it'); })
    .forEach(function (id) {
      type.appendChild(option(id, TYPES[id]));
      type2.appendChild(option(id, TYPES[id]));
    });
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
    // tipi richiesti (0, 1 o 2): il Pokémon deve averli tutti
    var wanted = [type.value, type2.value]
      .filter(function (v, i, a) { return v && a.indexOf(v) === i; })
      .map(function (v) { return parseInt(v, 10); });
    var lo = parseInt(cmin.value, 10), hi = parseInt(cmax.value, 10);
    return POKEMON.filter(function (p) {
      return wanted.every(function (t) { return p[2].indexOf(t) !== -1; }) && p[3] >= lo && p[3] <= hi;
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
  type2.addEventListener('change', updatePool);
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

  // ogni scheda è un link che apre la pagina del Pokémon in una nuova scheda
  function card(p) {
    var el = document.createElement('a');
    el.className = 'card';
    el.href = 'pokemon.html?id=' + p[0];
    el.target = '_blank';
    el.title = 'Apri la scheda di ' + p[1];

    var head = document.createElement('div');
    head.className = 'card-head';
    head.textContent = 'N° ' + padNumber(p[0]);
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
    p[2].forEach(function (t) { types.appendChild(typeBadge(t)); });
    el.appendChild(types);

    var cx = document.createElement('div');
    cx.className = 'cx';
    cx.appendChild(document.createTextNode('Complessità: '));
    cx.appendChild(complexityBar(p[3]));
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
    type2.value = '';
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

  updatePool();
})();
