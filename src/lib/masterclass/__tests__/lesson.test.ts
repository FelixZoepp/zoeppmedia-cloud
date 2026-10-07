import { describe, it, expect } from 'vitest';
import { detectProvider, formatZeit, normalizeLesson, parseZeit, prepareLessonPatch, sanitizeLessonHtml, videoEmbedUrl, lessonPatchSchema } from '../lesson';

describe('sanitizeLessonHtml', () => {
  it('behält einfache Formatierung', () => {
    expect(sanitizeLessonHtml('<p>Hallo <strong>Welt</strong></p><ul><li>a</li></ul>')).toBe('<p>Hallo <strong>Welt</strong></p><ul><li>a</li></ul>');
  });
  it('entfernt Skripte, Event-Handler und Styles', () => {
    const out = sanitizeLessonHtml('<p onclick="alert(1)" style="color:red">x</p><script>alert(1)</script><img src=x onerror=alert(1)>');
    expect(out).toBe('<p>x</p>');
  });
  it('lässt nur sichere Links zu', () => {
    expect(sanitizeLessonHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeLessonHtml('<a href="https://zoepp.de">x</a>')).toBe('<a href="https://zoepp.de" target="_blank" rel="noopener noreferrer">x</a>');
    expect(sanitizeLessonHtml('<a href="//evil.com">x</a>')).toBe('<a>x</a>');
  });
  it('maskiert verschachtelte Tricks und schließt offene Tags', () => {
    expect(sanitizeLessonHtml('<scr<script>ipt>alert(1)')).not.toMatch(/<script/i);
    expect(sanitizeLessonHtml('<p><strong>offen')).toBe('<p><strong>offen</strong></p>');
    expect(sanitizeLessonHtml('a < b > c')).toBe('a &lt; b &gt; c');
  });
});

describe('Video', () => {
  it('erkennt Anbieter und baut Einbett-URLs mit Startzeit', () => {
    expect(detectProvider('https://youtu.be/abcdefGHI12')).toBe('youtube');
    expect(videoEmbedUrl('https://www.youtube.com/watch?v=abcdefGHI12', 75)).toBe('https://www.youtube-nocookie.com/embed/abcdefGHI12?rel=0&start=75&autoplay=1');
    expect(videoEmbedUrl('https://vimeo.com/123456')).toBe('https://player.vimeo.com/video/123456');
    expect(videoEmbedUrl('https://vimeo.com/123456/abcdef', 30)).toBe('https://player.vimeo.com/video/123456?h=abcdef&autoplay=1#t=30s');
    expect(videoEmbedUrl('https://www.loom.com/share/abc123')).toBe('https://www.loom.com/embed/abc123');
    expect(videoEmbedUrl('https://example.com/video.mp4')).toBeNull();
  });
  it('rechnet Zeiten hin und her', () => {
    expect(formatZeit(75)).toBe('1:15');
    expect(formatZeit(3725)).toBe('1:02:05');
    expect(parseZeit('1:15')).toBe(75);
    expect(parseZeit('01:02:05')).toBe(3725);
    expect(parseZeit('90')).toBe(90);
    expect(parseZeit('abc')).toBeNull();
  });
});

describe('Lektion speichern', () => {
  it('füllt fehlende Spalten mit Standardwerten (alte Datenbank)', () => {
    const l = normalizeLesson({ id: '1', module_id: 'm', title: 'T', sort_order: 2 });
    expect(l).toMatchObject({ status: 'veroeffentlicht', typ: 'video', tags: [], kapitel: [], anhaenge: [], pflicht: false });
  });
  it('lässt neue Felder weg, solange die Migration fehlt', () => {
    const row = prepareLessonPatch({ title: 'T', status: 'entwurf', video_url: 'https://www.loom.com/share/abc' }, false);
    expect(row).toEqual({ title: 'T', video_url: 'https://www.loom.com/share/abc', video_provider: 'youtube' });
  });
  it('filtert HTML, sortiert Kapitel und leitet den Anbieter ab', () => {
    const row = prepareLessonPatch(
      { content_html: '<p onclick="x">Hi</p>', kapitel: [{ sekunden: 90, titel: 'B' }, { sekunden: 10, titel: 'A' }], video_url: 'https://vimeo.com/1' },
      true,
    );
    expect(row.content_html).toBe('<p>Hi</p>');
    expect((row.kapitel as Array<{ titel: string }>).map((k) => k.titel)).toEqual(['A', 'B']);
    expect(row.video_provider).toBe('vimeo');
  });
  it('validiert URLs und Status', () => {
    expect(lessonPatchSchema.safeParse({ video_url: 'javascript:alert(1)' }).success).toBe(false);
    expect(lessonPatchSchema.safeParse({ status: 'live' }).success).toBe(false);
    expect(lessonPatchSchema.safeParse({ status: 'entwurf', tags: ['Akquise'] }).success).toBe(true);
  });
});

describe('Google Drive', () => {
  it('erkennt Drive-Freigabelinks und bettet sie als Vorschau ein', () => {
    expect(detectProvider('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing')).toBe('drive');
    expect(videoEmbedUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing')).toBe('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/preview');
    expect(videoEmbedUrl('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp')).toBe('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/preview');
  });
  it('alte Datenbank ohne Migration: Drive fällt auf youtube zurück', () => {
    expect(prepareLessonPatch({ video_url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view' }, false).video_provider).toBe('youtube');
    expect(prepareLessonPatch({ video_url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view' }, true).video_provider).toBe('drive');
  });
});
