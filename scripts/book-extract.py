"""Read the leader advancement tables' text out of Index of the Untold.

Run through `node scripts/book-extract.mjs`, which pipes in every row of
`src/data/advancements.js` and merges what comes back into `book/book.json`.
Needs Python with PyMuPDF (`pip install pymupdf`).

    python -X utf8 scripts/book-extract.py docs/Index_of_the_Untold.pdf < entries.json

Prints one JSON object, key -> entry, on stdout. Problems go to stderr, and any
problem is a row the parser could not read with confidence, so it is left out
rather than guessed at.

Read by font, not by text: the suit, range and defence symbols are letters in
the M4ESymbols face (a Crow is a 'c', a Pulse a 'p'), and pdftotext cannot tell
them from prose. Each becomes the {{token}} BiggerHat uses, so the app renders
book text and register text the same way. Rows are split by the flip-value
column, and a stat line's numbers by the nearest Rg/Skl/Rst/TN/Dmg header,
because the values are centred under left-aligned headings.
"""
import pymupdf, sys, json, re
from collections import defaultdict

GLYPH = {'c': 'crow', 'C': 'crow', 'm': 'mask', 'r': 'ram', 't': 'tome', 's': 'stone',
         'f': 'signature', 'p': 'pulse', 'y': 'melee', 'z': 'missile', 'q': 'magic',
         'u': 'fortitude', 'x': 'warding', 'v': 'unusual', '+': '+', '-': '-'}
SUITS = {'crow', 'mask', 'ram', 'tome', 'stone'}
RANGE = {'melee': 'Melee', 'missile': 'Missile', 'magic': 'Magic', 'pulse': 'Pulse'}
SPACE = {'x': 0, 'c': ' ', 'sym': False, 'bold': False}

doc = pymupdf.open(sys.argv[1])
entries = json.load(sys.stdin)
problems = []


def lines_of(page):
    out = []
    for b in page.get_text('rawdict', sort=True)['blocks']:
        for l in b.get('lines', []):
            chars = []
            for s in l['spans']:
                sym = 'M4ESymbols' in s['font']
                bold = 'Bold' in s['font']
                for c in s['chars']:
                    chars.append({'x': c['bbox'][0], 'c': c['c'], 'sym': sym, 'bold': bold, 'xb': 'ExtraBold' in s['font']})
            if not chars:
                continue
            out.append({'x': l['bbox'][0], 'y': (l['bbox'][1] + l['bbox'][3]) / 2, 'chars': chars})
    return out


def raw(l):
    return ''.join(c['c'] for c in l['chars'])


def render(chars):
    s = ''
    for ch in chars:
        if ch['sym'] and ch['c'].strip():
            s += '{{%s}}' % GLYPH.get(ch['c'], ch['c'])
        else:
            s += ch['c']
    s = s.replace('\t', ' ')
    s = re.sub(r'[  ]+', ' ', s)
    return s.strip()


def text_of(ls):
    return render([c for l in ls for c in (l['chars'] + [SPACE])])


def tidy(s):
    s = re.sub(r'\s+', ' ', s).strip()
    s = s.replace('’', "'").replace('‘', "'")
    s = s.replace('per- manently', 'permanently')
    return s


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def cluster(ls, gap=14):
    groups = []
    for l in sorted(ls, key=lambda l: l['y']):
        if groups and l['y'] - groups[-1][-1]['y'] <= gap:
            groups[-1].append(l)
        else:
            groups.append([l])
    return [{'y': sum(l['y'] for l in g) / len(g), 'lines': g} for g in groups]


def header_cols(line):
    s = raw(line)
    cols = {}
    for word in ['Rg', 'Skl', 'Rst', 'TN', 'Dmg']:
        i = s.find(word)
        if i >= 0:
            cols[word] = line['chars'][i]['x']
    return cols


def is_header(l):
    s = raw(l)
    return bool(re.search(r'\b(Rg|Skl|Rst|TN|Dmg)\b', s)) and all(c['bold'] or not c['c'].strip() for c in l['chars'])


def parse_actions(ls):
    """Split a cell's lines into action blocks at each 'Rg Skl Rst TN Dmg' header."""
    ls = sorted(ls, key=lambda l: (round(l['y']), l['x']))
    headers = [l for l in ls if is_header(l)]
    hy = sorted({round(h['y']) for h in headers})
    out = []
    for i, y in enumerate(hy):
        nxt = hy[i + 1] if i + 1 < len(hy) else 1e9
        cols = {}
        for h in headers:
            if round(h['y']) == y:
                cols.update(header_cols(h))
        body = [l for l in ls if y < round(l['y']) < nxt - 2 and not is_header(l)
                and raw(l).strip()]
        if 'Rg' not in cols or not body:
            continue
        rgx = cols['Rg'] - 6
        # Rows of lines; a row with anything in the stat zone starts an action.
        # Two actions can share one header (Ringmaster's Lure).
        rows = []
        for l in sorted(body, key=lambda l: l['y']):
            if rows and abs(l['y'] - rows[-1][0]['y']) <= 4:
                rows[-1].append(l)
            else:
                rows.append([l])
        groups = []
        for row in rows:
            chars = [c for l in sorted(row, key=lambda l: l['x']) for c in l['chars'] + [SPACE]]
            if any(c['x'] >= rgx and c['c'].strip() for c in chars if c is not SPACE) \
                    and any(c.get('xb') and c['x'] < rgx and c['c'].strip() for c in chars if c is not SPACE):
                groups.append({'y': row[0]['y'], 'name': [c for c in chars if c is SPACE or c['x'] < rgx],
                               'stat': [c for c in chars if c is not SPACE and c['x'] >= rgx], 'desc': []})
            elif groups and not groups[-1]['desc'] and row[0]['y'] - groups[-1]['y'] <= 12 \
                    and all(c.get('xb') or not c['c'].strip() for l in row for c in l['chars']):
                groups[-1]['name'] += [dict(SPACE, bold=True)] + [c for l in row for c in l['chars']]
            elif groups:
                groups[-1]['desc'].extend(row)
        for g in groups:
            out.append(one_action(cols, g['name'], g['stat'], g['desc']))
    return out


def one_action(cols, name_chars, stat_chars, desc):
    if True:
        # Values are centred under left-aligned headers, so split the stat row
        # into tokens and give each to the header nearest its middle.
        tokens, cur = [], []
        for c in sorted(stat_chars, key=lambda c: c['x']):
            if not c['c'].strip():
                if cur:
                    tokens.append(cur)
                cur = []
            else:
                cur.append(c)
        if cur:
            tokens.append(cur)
        centres = {k: x + (8 if k in ('Rg', 'TN') else 10) for k, x in cols.items()}
        cells = defaultdict(list)
        for tok in tokens:
            mid = (tok[0]['x'] + tok[-1]['x']) / 2 + 2
            col = min(centres, key=lambda k: abs(centres[k] - mid))
            cells[col].extend(tok)
        stat = {k: render(v) for k, v in cells.items()}
        glyphs = [GLYPH.get(c['c']) for c in name_chars if c['sym'] and c['c'].strip()]
        name = tidy(render([c for c in name_chars if not c['sym']]))
        m = re.match(r'(?:\{\{(\w+)\}\})?\s*(.*)', stat.get('Rg', '-'))
        rtype, rval = m.group(1), m.group(2).strip()

        def dash(v):
            v = (v or '').strip()
            return None if v in ('', '-', '—') else v
        rval = dash(rval)
        return {
            'kind': 'action', 'name': name,
            'isSignature': 'signature' in glyphs,
            'stoneCost': 1 if 'stone' in glyphs else 0,
            'rangeTypeLabel': RANGE.get(rtype),
            'range': rval.rstrip('"') if rval else None,
            'stat': dash(stat.get('Skl')),
            'resistedBy': dash(stat.get('Rst')),
            'targetNumber': dash(stat.get('TN')),
            'damage': dash(stat.get('Dmg')),
            'description': tidy(text_of(desc)),
        }


results = {}
by_page = defaultdict(list)
for e in entries:
    by_page[e['page']].append(e)

for page_no, es in sorted(by_page.items()):
    table = es[0]['table']
    page = doc[page_no + 1]
    ls = [l for l in lines_of(page) if 100 < l['y'] < 760]
    hdr = [l for l in ls if l['y'] < 130]
    body = [l for l in ls if l['y'] >= 130]

    def hx(word):
        for l in hdr:
            if word in raw(l):
                return l['x']
        return None

    if table in ('attack', 'tactical'):
        effx = hx('Effect Text') - 3
        anchors = cluster([l for l in body if l['x'] < hx('Type') - 10 and render(l['chars'])])
    elif table in ('action', 'ability'):
        effx = hx('Effect Text') - 3
        anchors = cluster([l for l in body if l['x'] < hx('Talent Name') - 8 and render(l['chars'])])
    elif table == 'summoning':
        effx = 150
        anchors = cluster([l for l in body if l['x'] < effx and render(l['chars'])])
    else:  # totem: rows anchor on the totem's name, and split at the widest gap
        effx = None
        anchors = cluster([l for l in body if 85 <= l['x'] < 160 and l['chars'][0]['bold']
                           and not re.match(r'(Df|Sp):', render(l['chars']))], gap=12)

    if len(anchors) != len(es):
        problems.append(f'p.{page_no} {table}: {len(anchors)} rows on the page, {len(es)} in the data')
        continue
    mids = [(anchors[i]['y'] + anchors[i + 1]['y']) / 2 for i in range(len(anchors) - 1)]
    if table == 'totem':
        mids = []
        for i in range(len(anchors) - 1):
            a, b = anchors[i]['lines'][-1]['y'], anchors[i + 1]['lines'][0]['y']
            ys = sorted({a, b} | {l['y'] for l in body if a < l['y'] < b})
            gap = max(range(len(ys) - 1), key=lambda j: ys[j + 1] - ys[j])
            mids.append((ys[gap] + ys[gap + 1]) / 2)
    bounds = [-1] + mids + [1e9]

    for i, e in enumerate(es):
        lo, hi = bounds[i], bounds[i + 1]
        value = e['value'] if e['value'] is not None else '?'
        key = f"advancement:{table}:{value}:{e['name']}"
        if table == 'totem':
            cell = [l for l in body if lo <= l['y'] < hi]
            ab = sorted([l for l in cell if 155 <= l['x'] < 245], key=lambda l: l['y'])
            abil = tidy(text_of(ab))
            abilities = []
            if abil and abil.lower() != 'none':
                parts = re.split(r'(?:^|\s)((?:\{\{\w+\}\}\s*)*[A-Z][^:.]{1,40}?):\s', ' ' + abil)
                # parts: ['', head1, body1, head2, body2, ...]
                for j in range(1, len(parts) - 1, 2):
                    head = parts[j]
                    g = re.findall(r'\{\{(\w+)\}\}', head)
                    abilities.append({'kind': 'ability', 'name': re.sub(r'\{\{\w+\}\}\s*', '', head).strip(),
                                      'suits': ' '.join('{{%s}}' % x for x in g) or None,
                                      'description': parts[j + 1].strip()})
            actions = parse_actions([l for l in cell if 245 <= l['x'] < 400]) \
                + parse_actions([l for l in cell if l['x'] >= 400])
            note = None
            if not actions:
                note = tidy(text_of(sorted([l for l in cell if l['x'] >= 245 and render(l['chars']) != 'none'],
                                           key=lambda l: l['y']))) or None
            results[key] = {'kind': 'totem', 'name': e['name'], 'abilities': abilities, 'actions': actions,
                            'description': note}
            continue
        cell = [l for l in body if lo <= l['y'] < hi and l['x'] >= effx]
        if e['name'] == 'Choose':
            results[key] = {'kind': 'modifier', 'name': e['name'],
                            'description': tidy(text_of(sorted(cell, key=lambda l: (round(l['y']), l['x']))))}
            continue
        if table in ('action', 'summoning'):
            acts = parse_actions(cell)
            if len(acts) != 1 or norm(acts[0]['name']) != norm(e['name']):
                problems.append(f"{key}: parsed {[a['name'] for a in acts]}")
            if acts:
                acts[0]['name'] = e['name']
                results[key] = acts[0]
            continue
        text = tidy(text_of(sorted(cell, key=lambda l: (round(l['y']), l['x']))))
        m = re.match(r'^((?:\{\{\w+\}\}\s*)*)(.*)$', text)
        glyphs = re.findall(r'\{\{(\w+)\}\}', m.group(1))
        rest = m.group(2)
        nm = re.match(r'^(.+?):\s*(.*)$', rest)
        if nm and norm(re.sub(r'\{\{\w+\}\}', '', nm.group(1))) == norm(e['name']):
            pre = re.findall(r'\{\{(\w+)\}\}', nm.group(1))
            glyphs += pre
            rest = nm.group(2)
        elif table == 'ability' or e.get('type') == 'Trigger':
            problems.append(f'{key}: name prefix not found in {text[:70]!r}')
        if table == 'ability':
            results[key] = {'kind': 'ability', 'name': e['name'],
                            'suits': ' '.join('{{%s}}' % g for g in glyphs) or None, 'description': rest}
        elif e.get('type') == 'Trigger':
            suit = next((g for g in glyphs if g in SUITS), None)
            if not suit:
                problems.append(f'{key}: no suit glyph')
            results[key] = {'kind': 'trigger', 'name': e['name'],
                            'suits': '{{%s}}' % suit if suit else None, 'description': rest}
        else:
            results[key] = {'kind': 'modifier', 'name': e['name'], 'description': text}

json.dump(results, sys.stdout, ensure_ascii=False)
for p in problems:
    print(p, file=sys.stderr)
