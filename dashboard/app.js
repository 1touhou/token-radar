// Token Launch Radar — the dashboard.
// Reads window.RADAR (written beside dashboard/ by main.ts) and renders the
// ranked board, the live-token table, and a detail drawer for each protocol.
// Everything shown comes from data.js: no network, no framework, no imports.

(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var rows = DATA.rows || [];
  var live = DATA.live || [];
  var model = DATA.model || {};

  // ------------------------------------------------------------ formatting

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function dollars(value) {
    return '$' + Math.round(value).toLocaleString('en-US');
  }

  function compact(value) {
    if (value >= 1e9) return '$' + (value / 1e9).toFixed(2) + 'B';
    if (value >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
    if (value >= 1e3) return '$' + (value / 1e3).toFixed(1) + 'K';
    return dollars(value);
  }

  function pct(value) {
    if (value == null) return '—';
    var sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return sign + Math.abs(value).toFixed(1) + '%';
  }

  function ageText(days) {
    if (days == null) return '—';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }

  // ------------------------------------------------------------ farm plans
  //
  // The dashboard rebuilds each protocol's farm plan from the same rules
  // the model scores with: the capital follows the TVL tier, the hold
  // follows the age, the two category moves follow the category, and the
  // chain step follows how many chains the protocol lives on.

  function stakeFor(tvl) {
    if (tvl < 100000000) return 50;
    if (tvl < 1000000000) return 100;
    if (tvl < 10000000000) return 150;
    return 250;
  }

  function holdFor(ageDays) {
    var age = ageDays == null ? 365 : ageDays;
    if (age >= 365) return 30;
    if (age >= 180) return 45;
    return 60;
  }

  // Each category group names its two moves: the opening action and the
  // second action. The first function takes (name, chain, capital); the
  // second takes (name, chain, capital) too, and uses what it needs.
  var MOVES = {
    vault: [
      function (n, c, k, g) { return 'Deposit $' + k + ' into a ' + n + ' vault on ' + c + ' and keep the shares. Cost: $' + k + ' of capital and about $' + g + ' of gas. Time: 15 minutes to set up.'; },
      function (n, c, k) { return 'Move $' + k / 2 + ' between two ' + n + ' vaults on ' + c + '. Cost: about $2 of gas. Time: 10 minutes.'; }
    ],
    deposit: [
      function (n, c, k, g) { return 'Deposit $' + k + ' of USDC into ' + n + ' on ' + c + ' and keep the position open. Cost: $' + k + ' of capital and about $' + g + ' of gas. Time: 15 minutes to set up.'; },
      function (n) { return 'Vote or sign one governance action on ' + n + ' when it opens one. Cost: about $2 of gas. Time: 10 minutes.'; }
    ],
    supply: [
      function (n, c, k, g) { return 'Supply $' + k + ' of USDC to ' + n + ' on ' + c + ' and keep the position open. Cost: $' + k + ' of capital and about $' + g + ' of gas. Time: 15 minutes to set up.'; },
      function (n, _c, k) { return 'Borrow $' + k / 2 + ' against the position on ' + n + ' and repay it the same week. Cost: about $2 of gas. Time: 10 minutes.'; }
    ],
    liquidity: [
      function (n, c, k, g) { return 'Provide $' + k + ' of liquidity to ' + n + '\'s main pool on ' + c + ' and keep the position open. Cost: $' + k + ' of capital and about $' + g + ' of gas. Time: 15 minutes to set up.'; },
      function (n) { return 'Swap $25 of USDC for the pool\'s other asset on ' + n + ' and add it to the position. Cost: about $2 of gas. Time: 10 minutes.'; }
    ],
    stake: [
      function (n, _c, k, g) { return 'Stake $' + k + ' of the chain\'s staking asset through ' + n + ' and keep the receipt. Cost: $' + k + ' of capital and about $' + g + ' of gas. Time: 15 minutes to set up.'; },
      function (n) { return 'Restake or compound the rewards ' + n + ' pays, once, and keep the receipt. Cost: about $2 of gas. Time: 10 minutes.'; }
    ],
    bridge: [
      function (n, c, k, g) { return 'Bridge $' + k + ' of USDC to ' + c + ' through ' + n + ' and use the bridged funds in its app. Cost: $' + k + ' of capital and about $' + g + ' of gas. Time: 15 minutes to set up.'; },
      function (n, c) { return 'Send a second, smaller bridge of $25 through ' + n + ' to ' + c + ' in a different week. Cost: about $2 of gas. Time: 10 minutes.'; }
    ],
    margin: [
      function (n, _c, k, g) { return 'Deposit $' + k + ' of USDC as margin on ' + n + ' and open one small hedge. Cost: $' + k + ' of capital and about $' + g + ' of gas. Time: 15 minutes to set up.'; },
      function (n) { return 'Close the hedge on ' + n + ' and open a fresh one half its size. Cost: about $2 of gas. Time: 10 minutes.'; }
    ],
    mintYield: [
      function (_n, c, k, g) { return 'Mint $' + k + ' of the protocol\'s yield asset on ' + c + ' and hold it. Cost: $' + k + ' of capital and about $' + g + ' of gas. Time: 15 minutes to set up.'; },
      function (n) { return 'Check the yield ' + n + ' reports for the asset and reinvest one payout. Cost: about $2 of gas. Time: 10 minutes.'; }
    ],
    mintStable: [
      function (n, c, k, g) { return 'Mint or deposit $' + k + ' of the stable asset through ' + n + ' on ' + c + '. Cost: $' + k + ' of capital and about $' + g + ' of gas. Time: 15 minutes to set up.'; },
      function (n) { return 'Redeem $25 of the stable asset through ' + n + ' and deposit it again. Cost: about $2 of gas. Time: 10 minutes.'; }
    ],
    cover: [
      function (n, c, k, g) { return 'Buy $' + k + ' of cover from ' + n + ' on ' + c + ' and keep the policy. Cost: $' + k + ' of capital and about $' + g + ' of gas. Time: 15 minutes to set up.'; },
      function (n) { return 'Open a second, smaller cover on ' + n + ' for a different risk. Cost: about $2 of gas. Time: 10 minutes.'; }
    ],
    chainUse: [
      function (n, c, k, g) { return 'Use ' + n + ' on ' + c + ' with $' + k + ' of capital and keep the activity on-chain. Cost: $' + k + ' of capital and about $' + g + ' of gas. Time: 15 minutes to set up.'; },
      function (n) { return 'Make one more on-chain action on ' + n + ' in a different week. Cost: about $2 of gas. Time: 10 minutes.'; }
    ],
    market: [
      function (n, _c, k, g) { return 'Fund $' + k + ' and place one market position on ' + n + '. Cost: $' + k + ' of capital and about $' + g + ' of gas. Time: 15 minutes to set up.'; },
      function (n) { return 'Settle one market on ' + n + ' and place a second position in a different market. Cost: about $2 of gas. Time: 10 minutes.'; }
    ]
  };

  var CATEGORY_MOVE = {
    'Onchain Capital Allocator': 'vault', 'Risk Curators': 'vault',
    'Anchor BTC': 'deposit', 'Basis Trading': 'deposit', 'CeDeFi': 'deposit',
    'Crypto Card Issuer': 'deposit', 'Decentralized BTC': 'deposit',
    'Farm': 'deposit', 'Governance Incentives': 'deposit',
    'Liquidity Manager': 'deposit', 'Payments': 'deposit',
    'CDP': 'supply', 'Collateral Markets': 'supply', 'Lending': 'supply',
    'Uncollateralized Lending': 'supply',
    'Dexs': 'liquidity', 'Indexes': 'liquidity', 'Leveraged Farming': 'liquidity',
    'Yield': 'liquidity', 'Yield Aggregator': 'liquidity',
    'Liquid Restaking': 'stake', 'Liquid Staking': 'stake',
    'Restaking': 'stake', 'Staking Pool': 'stake',
    'Bridge': 'bridge', 'Canonical Bridge': 'bridge',
    'Derivatives': 'margin', 'Interest Rate Derivatives': 'margin',
    'RWA': 'mintYield',
    'Dual-Token Stablecoin': 'mintStable', 'Stablecoin Wrapper': 'mintStable',
    'Insurance': 'cover', 'Chain': 'chainUse', 'Prediction Market': 'market'
  };

  function farmPlan(row) {
    var capital = stakeFor(row.tvl_usd);
    var gas = capital >= 150 ? 8 : 4;
    var first = row.chains[0] || 'Ethereum';
    var second = row.chains[1];
    var moves = MOVES[CATEGORY_MOVE[row.category] || 'deposit'];
    var hold = holdFor(row.age_days);
    return [
      'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.',
      moves[0](row.name, first, capital, gas),
      moves[1](row.name, first, capital),
      'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote. Cost: about $2 of gas a week. Time: 10 minutes a week.',
      'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot. Cost: the $' + capital + ' stays in the position. Time: ' + hold + ' days.',
      second !== undefined
        ? 'Use ' + row.name + ' on a second chain too: move $25 of the position to ' + second + ' so the activity is not on one chain only. Cost: about $3 of bridge and gas fees. Time: 20 minutes.'
        : 'Keep gas on ' + first + ' ready before each action, so a weekly action is never skipped for a missing fee. Cost: about $5 of the chain’s gas token, held aside. Time: 5 minutes.',
      'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.',
      'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.'
    ];
  }

  // ------------------------------------------------------------ state

  var state = {
    tab: 'pre',
    q: '',
    category: '',
    chain: '',
    watchOnly: false,
    sortKey: 'rank',
    sortDir: 1,
    openSlug: null
  };

  var els = {
    facts: document.getElementById('facts'),
    tabPre: document.getElementById('tab-pre'),
    tabLive: document.getElementById('tab-live'),
    controls: document.getElementById('controls'),
    q: document.getElementById('q'),
    cat: document.getElementById('cat'),
    chain: document.getElementById('chain'),
    watch: document.getElementById('watch'),
    count: document.getElementById('count'),
    board: document.getElementById('board'),
    rows: document.getElementById('rows'),
    empty: document.getElementById('empty'),
    drawer: document.getElementById('drawer'),
    drawerBody: document.getElementById('drawer-body'),
    drawerClose: document.getElementById('drawer-close')
  };

  // ------------------------------------------------------------ header facts

  function renderFacts() {
    var items = [
      ['Watchlist', (DATA.watchlist_size || 0) + ' covered'],
      ['Board rows', String(DATA.board_size || rows.length)],
      ['Early finds', String(DATA.early_size || 0)],
      ['Live token', String(DATA.live_size || live.length)],
      ['Snapshot', DATA.as_of || '']
    ];
    els.facts.innerHTML = items.map(function (it) {
      return '<div><dt>' + esc(it[0]) + '</dt><dd>' + esc(it[1]) + '</dd></div>';
    }).join('');
  }

  function fillSelect(select, values) {
    var keep = select.value;
    select.innerHTML = '<option value="">All ' + (select === els.cat ? 'categories' : 'chains') + '</option>';
    values.forEach(function (v) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
    select.value = keep;
  }

  function fillFilters() {
    var cats = [];
    var chains = [];
    rows.forEach(function (r) {
      if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
      (r.chains || []).forEach(function (c) {
        if (chains.indexOf(c) < 0) chains.push(c);
      });
    });
    cats.sort();
    chains.sort();
    fillSelect(els.cat, cats);
    fillSelect(els.chain, chains);
  }

  // ------------------------------------------------------------ table

  function visibleRows() {
    var list = state.tab === 'pre' ? rows : live.map(function (r, i) {
      return {
        rank: i + 1, slug: r.slug, name: r.name, category: r.category,
        chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d,
        mcap_usd: r.mcap_usd, listed_at: null, age_days: null,
        implied_value_usd: r.mcap_usd, on_watchlist: false, live: true
      };
    });
    var q = state.q.trim().toLowerCase();
    return list.filter(function (r) {
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      if (state.category && r.category !== state.category) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchOnly && !r.on_watchlist) return false;
      return true;
    });
  }

  function sorted(list) {
    var key = state.sortKey;
    var dir = state.sortDir;
    return list.slice().sort(function (a, b) {
      var av = a[key];
      var bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
  }

  function changeClass(value) {
    if (value == null) return '';
    return value > 0 ? 'up' : value < 0 ? 'down' : '';
  }

  function renderTable() {
    var list = sorted(visibleRows());
    var isLive = state.tab === 'live';
    els.rows.innerHTML = list.map(function (r) {
      var sub = esc(r.category || 'No category') +
        (r.on_watchlist ? ' <span class="star" title="On the watchlist">★ watchlist</span>' : '') +
        '<span class="sub">' + esc((r.chains || []).join(', ')) + '</span>';
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong><span class="sub">' + sub + '</span></td>' +
        '<td class="num">' + compact(r.tvl_usd) + '</td>' +
        '<td class="num ' + changeClass(r.change_7d) + '">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + (isLive ? '—' : ageText(r.age_days)) + '</td>' +
        '<td class="num"><strong>' + dollars(r.implied_value_usd) + '</strong></td>' +
        '</tr>';
    }).join('');
    els.empty.hidden = list.length > 0;
    els.count.textContent = list.length + (isLive ? ' live-token protocols' : ' pre-token protocols');

    // The last column is a market cap on the live tab, an implied value otherwise.
    var heads = els.board.querySelectorAll('thead th');
    heads[5].textContent = isLive ? 'Market cap' : 'Implied value';
    heads[4].textContent = isLive ? 'Age' : 'Age';
    heads.forEach(function (th) {
      var key = th.getAttribute('data-sort');
      if (key) th.setAttribute('aria-sort', key === state.sortKey ? (state.sortDir === 1 ? 'ascending' : 'descending') : 'none');
    });
  }

  // ------------------------------------------------------------ drawer

  function renderDrawer(slug) {
    var row = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].slug === slug) { row = rows[i]; break; }
    }
    var liveRow = null;
    if (!row) {
      for (var j = 0; j < live.length; j++) {
        if (live[j].slug === slug) { liveRow = live[j]; break; }
      }
    }
    if (!row && !liveRow) return;

    if (liveRow) {
      els.drawerBody.innerHTML =
        '<h2>' + esc(liveRow.name) + '</h2>' +
        '<p class="meta">' + esc(liveRow.category || 'No category') + ' · ' + esc((liveRow.chains || []).join(', ')) + '</p>' +
        '<h3>Already trading</h3>' +
        '<p>This protocol\'s token already trades, so it is not ranked on the pre-token board. ' +
        'Its market cap is <strong>' + dollars(liveRow.mcap_usd) + '</strong> on ' + compact(liveRow.tvl_usd) + ' of TVL.</p>' +
        '<p class="caveat">The board ranks only protocols that record no token. A live-token ' +
        'protocol is shown here so the reader can tell the two apart at a glance.</p>';
      els.drawer.hidden = false;
      return;
    }

    var base = row.tvl_usd * (model.base_multiple == null ? 0.25 : model.base_multiple);
    var steps = farmPlan(row);
    els.drawerBody.innerHTML =
      '<h2>' + esc(row.name) + '</h2>' +
      '<p class="meta">Rank ' + row.rank + ' · ' + esc(row.category || 'No category') + ' · ' +
      esc((row.chains || []).join(', ')) + (row.on_watchlist ? ' · <span class="star">★ watchlist</span>' : '') + '</p>' +
      '<h3>Implied value</h3>' +
      '<div class="equation">' +
      '<div class="row"><span>TVL &times; 0.25</span><span>' + dollars(base) + '</span></div>' +
      '<div class="row"><span>&times; growth ' + row.growth_multiplier + '</span><span>7d ' + pct(row.change_7d) + '</span></div>' +
      '<div class="row"><span>&times; maturity ' + row.maturity_multiplier + '</span><span>' + ageText(row.age_days) + ' old</span></div>' +
      '<div class="row"><span>&times; breadth ' + row.breadth_multiplier + '</span><span>' + row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's') + '</span></div>' +
      '<div class="row total"><span>Implied value</span><span>' + dollars(row.implied_value_usd) + '</span></div>' +
      '</div>' +
      '<h3>How to farm it</h3>' +
      '<ol class="steps">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="caveat">This protocol records no token — the record may simply not ' +
      'carry one, so this is never a claim that it has none. The implied value ' +
      'follows from the snapshot\'s own figures alone.</p>';
    els.drawer.hidden = false;
  }

  function closeDrawer() {
    els.drawer.hidden = true;
    state.openSlug = null;
  }

  // ------------------------------------------------------------ wiring

  function setTab(tab) {
    state.tab = tab;
    state.openSlug = null;
    closeDrawer();
    els.tabPre.setAttribute('aria-selected', tab === 'pre' ? 'true' : 'false');
    els.tabLive.setAttribute('aria-selected', tab === 'live' ? 'true' : 'false');
    els.controls.style.display = tab === 'pre' ? '' : 'none';
    state.sortKey = tab === 'pre' ? 'rank' : 'rank';
    state.sortDir = 1;
    renderTable();
  }

  els.tabPre.addEventListener('click', function () { setTab('pre'); });
  els.tabLive.addEventListener('click', function () { setTab('live'); });

  els.q.addEventListener('input', function () { state.q = els.q.value; renderTable(); });
  els.cat.addEventListener('change', function () { state.category = els.cat.value; renderTable(); });
  els.chain.addEventListener('change', function () { state.chain = els.chain.value; renderTable(); });
  els.watch.addEventListener('change', function () { state.watchOnly = els.watch.checked; renderTable(); });

  els.board.querySelectorAll('thead th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
      if (state.sortKey === key) {
        state.sortDir = -state.sortDir;
      } else {
        state.sortKey = key;
        state.sortDir = key === 'name' ? 1 : -1;
      }
      renderTable();
    });
  });

  els.rows.addEventListener('click', function (event) {
    var tr = event.target.closest('tr[data-slug]');
    if (!tr) return;
    state.openSlug = tr.getAttribute('data-slug');
    renderDrawer(state.openSlug);
  });

  els.drawerClose.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeDrawer();
  });

  renderFacts();
  fillFilters();
  renderTable();
})();
