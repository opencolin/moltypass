import { describe, it, expect, beforeEach } from 'vitest';
import { auditLog } from '../src/background/audit-log';
import { itemHistory } from '../src/background/item-history';
import { __resetForTesting as resetAuditDb } from '../src/background/audit-db';

beforeEach(async () => {
  resetAuditDb();
  await chrome.storage.local.clear();
});

describe('itemHistory', () => {
  it('returns empty page for an unknown keyId', async () => {
    const page = await itemHistory('never-existed');
    expect(page.events).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it('records item.created', async () => {
    await auditLog.itemCreated({
      keyId: 'k1',
      keyLabel: 'personal',
      service: 'anthropic',
      captureMethod: 'create-detector',
    });
    const page = await itemHistory('k1');
    expect(page.events).toHaveLength(1);
    expect(page.events[0].kind).toBe('item.created');
    expect(page.events[0].meta.captureMethod).toBe('create-detector');
  });

  it('records item.renamed with old + new label', async () => {
    await auditLog.itemCreated({
      keyId: 'k2',
      keyLabel: 'personal',
      service: 'openai',
      captureMethod: 'paste',
    });
    await auditLog.itemRenamed({
      keyId: 'k2',
      oldLabel: 'personal',
      newLabel: 'work',
    });
    const page = await itemHistory('k2');
    // Newest first.
    expect(page.events.map(e => e.kind)).toEqual(['item.renamed', 'item.created']);
    expect(page.events[0].meta.oldLabel).toBe('personal');
    expect(page.events[0].meta.newLabel).toBe('work');
  });

  it('records item.notes_updated with length + hadNotesBefore', async () => {
    await auditLog.itemNotesUpdated({
      keyId: 'k3',
      notesLength: 42,
      hadNotesBefore: false,
    });
    await auditLog.itemNotesUpdated({
      keyId: 'k3',
      notesLength: 0,
      hadNotesBefore: true,
    });
    const page = await itemHistory('k3');
    expect(page.events).toHaveLength(2);
    expect(page.events[0].meta.notesLength).toBe(0);
    expect(page.events[0].meta.hadNotesBefore).toBe(1);
    expect(page.events[1].meta.notesLength).toBe(42);
    expect(page.events[1].meta.hadNotesBefore).toBe(0);
  });

  it('records item.file_attached and item.file_removed', async () => {
    await auditLog.itemFileAttached({
      keyId: 'k4',
      fileName: 'service-account.json',
      fileSize: 2048,
    });
    await auditLog.itemFileRemoved({
      keyId: 'k4',
      fileName: 'service-account.json',
    });
    const page = await itemHistory('k4');
    expect(page.events.map(e => e.kind)).toEqual(['item.file_removed', 'item.file_attached']);
    expect(page.events[1].meta.fileName).toBe('service-account.json');
    expect(page.events[1].meta.fileSize).toBe(2048);
  });

  it('records item.deleted', async () => {
    await auditLog.itemCreated({
      keyId: 'k5',
      keyLabel: 'tmp',
      service: 'gemini',
      captureMethod: 'picker',
    });
    await auditLog.itemDeleted({
      keyId: 'k5',
      keyLabel: 'tmp',
      service: 'gemini',
    });
    const page = await itemHistory('k5');
    expect(page.events.map(e => e.kind)).toEqual(['item.deleted', 'item.created']);
  });

  it('includes rotate.complete + revoke as item-history events', async () => {
    // rotate + revoke are pre-existing kinds that also mutate the item,
    // so they should show up alongside the new item.* kinds.
    await auditLog.itemCreated({
      keyId: 'k6',
      keyLabel: 'personal',
      service: 'anthropic',
      captureMethod: 'create-detector',
    });
    await auditLog.rotate({
      keyId: 'k6',
      oldKeyId: 'k6',
      newKeyId: 'k7',
      affectedGrants: 3,
    });
    await auditLog.revoke({
      keyId: 'k6',
      scope: 'key',
    });
    const page = await itemHistory('k6');
    expect(page.events.map(e => e.kind)).toEqual(['revoke', 'rotate.complete', 'item.created']);
  });

  it('excludes proxy.ok events (not item mutations)', async () => {
    await auditLog.itemCreated({
      keyId: 'k8',
      keyLabel: 'personal',
      service: 'anthropic',
      captureMethod: 'paste',
    });
    // A hundred proxy calls should NOT appear in item history.
    for (let i = 0; i < 5; i++) {
      await auditLog.proxyOk({
        origin: 'https://claude.ai',
        service: 'anthropic',
        keyId: 'k8',
        status: 200,
        pathPreview: '/v1/messages',
        latencyMs: 100,
      });
    }
    const page = await itemHistory('k8');
    expect(page.events).toHaveLength(1);
    expect(page.events[0].kind).toBe('item.created');
  });

  it('respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await auditLog.itemNotesUpdated({
        keyId: 'k9',
        notesLength: i,
        hadNotesBefore: i > 0,
      });
    }
    const page = await itemHistory('k9', { limit: 3 });
    expect(page.events).toHaveLength(3);
    expect(page.nextCursor).not.toBeNull();
  });

  it('paginates via cursor', async () => {
    for (let i = 0; i < 6; i++) {
      await auditLog.itemNotesUpdated({
        keyId: 'k10',
        notesLength: i,
        hadNotesBefore: i > 0,
      });
    }
    const page1 = await itemHistory('k10', { limit: 3 });
    expect(page1.events).toHaveLength(3);
    const page2 = await itemHistory('k10', { limit: 3, cursor: page1.nextCursor! });
    expect(page2.events).toHaveLength(3);
    // No overlap between the two pages.
    const seen = new Set(page1.events.map(e => `${e.ts}-${e.meta.notesLength}`));
    for (const e of page2.events) {
      expect(seen.has(`${e.ts}-${e.meta.notesLength}`)).toBe(false);
    }
  });

  it('filters by since', async () => {
    await auditLog.itemCreated({
      keyId: 'k11',
      keyLabel: 'x',
      service: 'anthropic',
      captureMethod: 'paste',
    });
    const cutoff = Date.now() + 1;
    // Wait 5ms so the next event's ts is strictly > cutoff.
    await new Promise(r => setTimeout(r, 5));
    await auditLog.itemRenamed({
      keyId: 'k11',
      oldLabel: 'x',
      newLabel: 'y',
    });
    const page = await itemHistory('k11', { since: cutoff });
    expect(page.events).toHaveLength(1);
    expect(page.events[0].kind).toBe('item.renamed');
  });

  it('long labels are truncated to 64 chars in meta', async () => {
    const long = 'a'.repeat(200);
    await auditLog.itemRenamed({
      keyId: 'k12',
      oldLabel: long,
      newLabel: 'short',
    });
    const page = await itemHistory('k12');
    expect((page.events[0].meta.oldLabel as string).length).toBe(64);
  });
});
