import { describe, expect, it, vi } from 'vitest';

import { cleanDrawing, cleanFragment, composeSvg, drawMascot, DrawError } from './mascot';
import PRESETS from './mascot-presets.json';

describe('cleanFragment', () => {
  it('keeps plain shapes and their drawing attributes', () => {
    expect(cleanFragment('<circle cx="60" cy="60" r="10" fill="#e0604a"/><path d="M1 2 Q3 4 5 6" stroke="#000" stroke-width="2"/>'))
      .toBe('<circle cx="60" cy="60" r="10" fill="#e0604a"/><path d="M1 2 Q3 4 5 6" stroke="#000" stroke-width="2"/>');
  });

  it('drops anything that could run, load or link', () => {
    const evil = [
      '<script>alert(1)</script>',
      '<circle cx="1" cy="1" r="1" onload="alert(1)"/>',
      '<image href="https://evil.example/x.png"/>',
      '<a href="javascript:alert(1)"><circle r="1"/></a>',
      '<foreignObject><div>hi</div></foreignObject>',
      '<style>*{}</style>',
      '<rect width="10" height="10" fill="url(#g)" style="x"/>',
      '<rect width="10" height="10" fill="javascript:alert(1)"/>',
      '<rect width="10" height="10" transform="translate(1,1) url(x)"/>',
      '<use href="#x"/>',
    ].join('');
    const clean = cleanFragment(evil)!;
    expect(clean).not.toMatch(/script|onload|href|image|foreign|style|url|javascript|use|<a/i);
    expect(clean).toBe('<circle cx="1" cy="1" r="1"/><circle r="1"/><rect width="10" height="10"/><rect width="10" height="10"/><rect width="10" height="10"/>');
  });

  it('keeps groups balanced and drops text', () => {
    expect(cleanFragment('<g transform="rotate(10 60 60)"><circle r="2"/>hello<g><rect width="1"/>'))
      .toBe('<g transform="rotate(10 60 60)"><circle r="2"/><g><rect width="1"/></g></g>');
  });

  it('refuses a fragment with nothing drawable left', () => {
    expect(cleanFragment('<script>x</script><text>hi</text>')).toBeNull();
    expect(cleanFragment('')).toBeNull();
  });
});

describe('cleanDrawing', () => {
  const part = '<circle cx="60" cy="60" r="50" fill="#123456"/>';
  it('needs a body and all four faces, and tidies the name', () => {
    expect(cleanDrawing({ name: 'Gronk <b>!', body: part, happy: part, coach: part, stern: part, cheer: part }))
      .toMatchObject({ name: 'Gronk b', body: part });
    expect(cleanDrawing({ name: 'x', body: part, happy: part, coach: part, stern: part })).toBeNull();
    expect(cleanDrawing({ body: part, happy: part, coach: part, stern: part, cheer: part })?.name).toBe('Buddy');
  });

  it('composes a whole SVG from a body and a face', () => {
    expect(composeSvg('<b/>', '<f/>')).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><b/><f/></svg>');
  });
});

describe('the built-in presets', () => {
  it('are sixteen: a cute and a swole version of eight animals', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['monkey', 'cat', 'dog', 'frog', 'panda', 'bunny', 'bird', 'penguin'].flatMap((a) => [`${a}-cute`, `${a}-swole`]));
  });

  it('are already clean: the cleaner leaves every one exactly as it is', () => {
    for (const p of PRESETS) {
      expect(cleanDrawing({ name: p.name, body: p.body, ...p.faces })).toEqual({ name: p.name, body: p.body, faces: p.faces });
    }
  });
});

describe('drawMascot', () => {
  const part = '<circle cx="60" cy="60" r="50" fill="#123456"/>';
  const reply = (status: number, text?: string) => vi.fn(async () => new Response(
    text === undefined ? '{}' : JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status },
  ));

  it('asks once and returns a cleaned drawing', async () => {
    const fetcher = reply(200, JSON.stringify({ name: 'Gronk', body: part + '<script>x</script>', happy: part, coach: part, stern: part, cheer: part }));
    const d = await drawMascot('a kettlebell', { key: 'k', fetcher: fetcher as unknown as typeof fetch });
    expect(d.body).toBe(part);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
  });

  it('fails fast and says why when busy, broken or incomplete', async () => {
    await expect(drawMascot('x', { key: 'k', fetcher: reply(503) as unknown as typeof fetch })).rejects.toThrow(/busy/);
    await expect(drawMascot('x', { key: 'k', fetcher: reply(200, 'not json') as unknown as typeof fetch })).rejects.toThrow(/garbled/);
    await expect(drawMascot('x', { key: 'k', fetcher: reply(200, JSON.stringify({ name: 'a', body: part })) as unknown as typeof fetch })).rejects.toThrow(DrawError);
  });
});
