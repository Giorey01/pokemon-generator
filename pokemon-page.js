(function () {
  var POKEMON = window.POKEMON; // [numero, nome, [id tipi], complessità]
  var DETAILS = window.DETAILS;
  var REGIONS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unima', 'Kalos', 'Alola', 'Galar', 'Paldea'];
  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
  var STAT_NAMES = ['PS', 'Attacco', 'Difesa', 'Att. Speciale', 'Dif. Speciale', 'Velocità'];
  var STAT_MAX = 255;

  var $ = function (id) { return document.getElementById(id); };

  var id = parseInt(new URLSearchParams(location.search).get('id'), 10);
  var p = POKEMON[id - 1];
  var d = DETAILS[id];
  if (!p || !d) {
    $('profile').hidden = true;
    $('notice').textContent = 'ERRORE: il Pokémon richiesto non esiste. Torna al generatore e riprova.';
    $('notice').hidden = false;
    $('crumb').textContent = 'non trovato';
    return;
  }

  function decimal(n) { return (n / 10).toFixed(1).replace('.', ','); }

  function link(pid) {
    var a = document.createElement('a');
    a.href = 'pokemon.html?id=' + pid;
    a.textContent = POKEMON[pid - 1][1];
    return a;
  }

  // elenca i Pokémon separati da virgole dentro un elemento
  function appendLinks(el, ids) {
    ids.forEach(function (pid, i) {
      if (i) el.appendChild(document.createTextNode(', '));
      el.appendChild(link(pid));
    });
  }

  document.title = 'PokéGenerator Forum :: ' + p[1];
  $('crumb').textContent = p[1];
  $('title').textContent = p[1];
  $('name').textContent = p[1];
  $('number').textContent = 'N° ' + padNumber(id) + (d.rare === 2 ? ' — Pokémon misterioso' : d.rare === 1 ? ' — Pokémon leggendario' : '');
  $('sprite').src = 'sprites/' + id + '.png';
  $('sprite').alt = p[1];
  p[2].forEach(function (t) { $('types').appendChild(typeBadge(t)); });

  // precedente / successivo (circolare)
  $('prev').href = 'pokemon.html?id=' + (id === 1 ? POKEMON.length : id - 1);
  $('next').href = 'pokemon.html?id=' + (id === POKEMON.length ? 1 : id + 1);

  $('genus').textContent = d.genus;
  $('desc').textContent = d.desc;
  if (d.descEn) {
    var note = document.createElement('div');
    note.className = 'small';
    note.textContent = '(categoria e descrizione disponibili solo in inglese per questo Pokémon)';
    $('desc').appendChild(note);
  }
  $('height').textContent = decimal(d.height) + ' m';
  $('weight').textContent = decimal(d.weight) + ' kg';

  d.abilities.forEach(function (a, i) {
    if (i) $('abilities').appendChild(document.createTextNode(', '));
    $('abilities').appendChild(document.createTextNode(a[0]));
    if (a[1]) {
      var hidden = document.createElement('span');
      hidden.className = 'small';
      hidden.textContent = ' (nascosta)';
      $('abilities').appendChild(hidden);
    }
  });

  $('gen').textContent = ROMAN[d.gen - 1] + ' (' + REGIONS[d.gen - 1] + ')';
  $('gender').textContent = d.female < 0
    ? 'Senza genere'
    : (100 - d.female * 12.5).toString().replace('.', ',') + '% maschio, ' + (d.female * 12.5).toString().replace('.', ',') + '% femmina';
  $('capture').textContent = d.capture + ' / 255';

  var evo = $('evo');
  if (!d.from && !d.to.length) {
    evo.textContent = 'Non si evolve';
  } else {
    if (d.from) {
      evo.appendChild(document.createTextNode('Si evolve da '));
      evo.appendChild(link(d.from));
    }
    if (d.to.length) {
      if (d.from) evo.appendChild(document.createElement('br'));
      evo.appendChild(document.createTextNode('Si evolve in '));
      appendLinks(evo, d.to);
    }
  }

  $('cx').appendChild(complexityBar(p[3]));

  // statistiche base con barre
  var total = 0;
  d.stats.forEach(function (value, i) {
    total += value;
    var tr = document.createElement('tr');
    var th = document.createElement('th');
    th.textContent = STAT_NAMES[i];
    var num = document.createElement('td');
    num.className = 'num';
    num.textContent = value;
    var cell = document.createElement('td');
    var bar = document.createElement('div');
    bar.className = 'statbar';
    var fill = document.createElement('div');
    fill.style.width = Math.round(value / STAT_MAX * 100) + '%';
    fill.className = value < 60 ? 'low' : value < 100 ? 'mid' : 'high';
    bar.appendChild(fill);
    cell.appendChild(bar);
    tr.appendChild(th);
    tr.appendChild(num);
    tr.appendChild(cell);
    $('stats').appendChild(tr);
  });
  var tr = document.createElement('tr');
  tr.className = 'total';
  var th = document.createElement('th');
  th.textContent = 'Totale';
  var num = document.createElement('td');
  num.className = 'num';
  num.textContent = total;
  tr.appendChild(th);
  tr.appendChild(num);
  tr.appendChild(document.createElement('td'));
  $('stats').appendChild(tr);
})();
