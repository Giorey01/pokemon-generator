// Parti condivise tra il generatore (index.html) e la scheda (pokemon.html)
window.TYPE_COLORS = {
  1: '#9a9a6b', 2: '#b3261e', 3: '#8f7fe0', 4: '#93358f', 5: '#c9a94a', 6: '#a8922f',
  7: '#8f9e17', 8: '#5f4a8a', 9: '#8f8fa8', 10: '#e06a1c', 11: '#4a7be0', 12: '#5aa83a',
  13: '#d9a900', 14: '#e0457a', 15: '#5fb3b3', 16: '#5a2ee0', 17: '#5a463a', 18: '#d9709a'
};

window.padNumber = function (n) { return ('000' + n).slice(-4); };

window.typeBadge = function (t) {
  var s = document.createElement('span');
  s.className = 'type';
  s.style.background = window.TYPE_COLORS[t];
  s.textContent = window.TYPES[t];
  return s;
};

// barra a 10 tacche + "n/10"
window.complexityBar = function (level) {
  var wrap = document.createElement('span');
  var bar = document.createElement('span');
  bar.className = 'bar';
  for (var i = 1; i <= 10; i++) {
    var seg = document.createElement('i');
    if (i <= level) seg.className = 'on';
    bar.appendChild(seg);
  }
  wrap.appendChild(bar);
  var b = document.createElement('b');
  b.textContent = ' ' + level + '/10';
  wrap.appendChild(b);
  return wrap;
};

// data di oggi nell'intestazione
document.getElementById('today').textContent =
  new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
