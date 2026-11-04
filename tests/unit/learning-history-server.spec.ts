import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { historyFixture } from '../fixtures/learning/history-fixture.js';
import {
  emptyLearningState,
  applyLearningOperation,
  summarizeLearning
} from '../../laf-backend/functions/_shared/learning-domain.js';
import {
  encodeServerHistory,
  decodeServerHistory,
  syncWireResult
} from '../../laf-backend/functions/_shared/learning-history-server.js';
import { syncLearningOperations, readLearningHistoryPages } from '../../laf-backend/functions/_shared/learning-sync.js';
import { parsePastedMaterial } from '@/services/learning/material-intake.js';
import { decodeHistory } from '../../laf-backend/functions/_shared/learning-history.js';
import { INTAKE_SCOPE_REPLAY_CONTRACT } from '../../laf-backend/functions/_shared/learning-intake.js';
let large: any;
beforeAll(() => {
  large = historyFixture();
}, 20000);
function database(initial: any, revision = 10) {
  const id = `learning_sync_${crypto.createHash('sha256').update('u1').digest('hex')}`;
  const rows = new Map([[id, { _id: id, user_id: 'u1', state: initial, revision }]]);
  const db = {
    collection: () => ({
      where: (q: any) => ({
        get: async () => ({
          data: [...rows.values()]
            .filter((r) => Object.entries(q).every(([k, v]) => r[k] === v))
            .map((r) => structuredClone(r))
        }),
        update: async (next: any) => {
          const row = rows.get(q._id);
          if (!row || row.user_id !== q.user_id || row.revision !== q.revision) return { updated: 0 };
          rows.set(q._id, { ...row, ...structuredClone(next) });
          return { updated: 1 };
        }
      }),
      add: async (row: any) => {
        if (rows.has(row._id)) throw { code: 11000 };
        rows.set(row._id, structuredClone(row));
      }
    })
  };
  return { db, rows, id };
}
describe('服务端历史单文档与分页传输', () => {
  it('预读空账户后首次写入沿本机时区，重复与后续读取不重置路线时区', async () => {
    const { db } = database(emptyLearningState('u1', 'Asia/Shanghai'), 0);
    const read = await syncLearningOperations(db, 'u1', [], 'America/Los_Angeles');
    expect(read.state.timezone).toBe('Asia/Shanghai');
    expect(read.revision).toBe(0);
    const operations = [
      { id: 'tz-goal', type: 'conversation.start', at: Date.now(), data: { goal: '分数复习' } },
      {
        id: 'tz-route',
        type: 'journey.configure',
        at: Date.now(),
        data: {
          conversationId: 'tz-goal',
          title: '分数复习',
          startDay: '2026-10-13',
          durationDays: 2,
          minutes: 40,
          mode: 'batch',
          moduleIds: ['fraction-add-subtract']
        }
      }
    ];
    const first = await syncLearningOperations(db, 'u1', operations, 'America/Los_Angeles');
    expect(first.state.timezone).toBe('America/Los_Angeles');
    expect(first.state.conversations[0].journey.timezone).toBe('America/Los_Angeles');
    const repeated = await syncLearningOperations(db, 'u1', operations, 'Asia/Shanghai');
    expect(repeated).toEqual(first);
    expect((await syncLearningOperations(db, 'u1', [], 'Asia/Shanghai')).state).toEqual(first.state);
  });
  it.each(['UTC', 'Asia/Shanghai', 'America/New_York', 'America/Los_Angeles'])(
    '首次从改过时区的设备同步，%s 计划仍按事件原时区重建',
    async (timezone) => {
      const at = Date.parse('2026-10-16T06:30:00Z');
      const changedTimezone = timezone === 'Asia/Shanghai' ? 'America/Los_Angeles' : 'Asia/Shanghai';
      const operations = [
        { id: 'origin-plan', type: 'plan.set', at, data: { timezone, tasks: [] } },
        { id: 'origin-change', type: 'timezone.set', at: at + 1000, data: { timezone: changedTimezone } }
      ];
      let local = emptyLearningState('u1', timezone);
      for (const operation of operations) local = applyLearningOperation(local, operation).state;
      const { db } = database(emptyLearningState('u1', changedTimezone), 0);
      const result = await syncLearningOperations(db, 'u1', operations, changedTimezone);
      expect(result.state).toEqual(local);
      expect(result.state.plans[0].timezone).toBe(timezone);
      expect(await syncLearningOperations(db, 'u1', operations, 'UTC')).toEqual(result);
    }
  );
  it('已有事实即使旧存储版本为零，也不按另一设备时区重建', async () => {
    const start = { id: 'old-goal', type: 'conversation.start', at: Date.now(), data: { goal: '保留原目标' } };
    const original = applyLearningOperation(emptyLearningState('u1', 'America/Los_Angeles'), start).state;
    const { db } = database(original, 0);
    const result = await syncLearningOperations(db, 'u1', [start], 'Asia/Shanghai');
    expect(result.state).toEqual(original);
    expect(result.revision).toBe(0);
  });
  it('首次时区建立遇到无效批次时不留下部分事实或改写空记录', async () => {
    const { db, rows, id } = database(emptyLearningState('u1', 'Asia/Shanghai'), 0);
    const original = structuredClone(rows.get(id));
    await expect(
      syncLearningOperations(
        db,
        'u1',
        [
          { id: 'before-invalid', type: 'conversation.start', at: Date.now(), data: { goal: '分数复习' } },
          {
            id: 'invalid-answer',
            type: 'attempt.submit',
            at: Date.now(),
            data: { conversationId: 'before-invalid', answer: '1/2', explicit: true }
          }
        ],
        'America/Los_Angeles'
      )
    ).rejects.toThrow();
    expect(rows.get(id)).toEqual(original);
  });
  it('旧快照兼容，压缩完整 150 万以上字符且限制解压、损坏和账户', async () => {
    expect(await decodeServerHistory(emptyLearningState('u1'), 'u1')).toMatchObject({ owner: 'u1' });
    const packed = await encodeServerHistory(large, 'u1');
    expect(packed.format).toBe('learning-gzip-v1');
    expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify(large).length / 10);
    expect(await decodeServerHistory(packed, 'u1')).toEqual(large);
    await expect(decodeServerHistory(packed, 'u2')).rejects.toThrow('其他账户');
    await expect(decodeServerHistory({ ...packed, digest: '0'.repeat(64) }, 'u1')).rejects.toThrow('不一致');
    await expect(decodeServerHistory({ ...packed, payload: packed.payload + '=' }, 'u1')).rejects.toThrow('损坏');
    const bomb = gzipSync(Buffer.alloc(24000001)).toString('base64');
    await expect(decodeServerHistory({ ...packed, payload: bomb }, 'u1')).rejects.toThrow();
  });
  it('读取与重复补传不换版本；并发 CAS 合并，压缩单文档无遗留正文分页', async () => {
    const { db, rows, id } = database(await encodeServerHistory(large, 'u1'));
    const read = await syncLearningOperations(db, 'u1', [], 'Asia/Shanghai');
    expect(read.revision).toBe(10);
    const event = large.events[0];
    expect((await syncLearningOperations(db, 'u1', [event], 'Asia/Shanghai')).revision).toBe(10);
    const operation = (id: string) => ({
      id,
      type: 'message.add',
      at: Date.now(),
      data: { conversationId: 'history-c', role: 'user', content: id }
    });
    await Promise.all(
      ['device-a', 'device-b'].map((id) => syncLearningOperations(db, 'u1', [operation(id)], 'Asia/Shanghai'))
    );
    const current = await syncLearningOperations(db, 'u1', [], 'Asia/Shanghai');
    expect(current.state.events.length).toBe(large.events.length + 2);
    expect(rows.get(id).revision).toBe(12);
    expect(rows.size).toBe(1);
    expect(summarizeLearning(current.state).first).toMatchObject({ numerator: 2, denominator: 6 });
  });
  it('分页校验完整快照，精简回执不回传正文；变更、越界、跨用户不接受旧页', async () => {
    const { db } = database(await encodeServerHistory(large, 'u1'));
    const result = await syncLearningOperations(db, 'u1', [], 'Asia/Shanghai');
    const wire = syncWireResult(result),
      pages = [];
    expect(wire.state).toBeUndefined();
    expect(syncWireResult(result, true)).toEqual({
      accepted: [],
      revision: 10,
      snapshotRequired: true,
      intakeScopeReplayContracts: [INTAKE_SCOPE_REPLAY_CONTRACT]
    });
    expect(wire.intakeScopeReplayContracts).toEqual([INTAKE_SCOPE_REPLAY_CONTRACT]);
    for (let offset = 0; offset < wire.history.checksums.length; offset += 3) {
      const part = await readLearningHistoryPages(db, 'u1', {
        revision: 10,
        generation: wire.history.generation,
        offset,
        count: 3
      });
      pages.push(...part.pages);
    }
    expect(decodeHistory(wire.history, pages, 'u1')).toEqual(large);
    await expect(
      readLearningHistoryPages(db, 'u2', { revision: 10, generation: wire.history.generation, offset: 0, count: 3 })
    ).rejects.toThrow('已更新');
    await expect(
      readLearningHistoryPages(db, 'u1', { revision: 10, generation: wire.history.generation, offset: 0, count: 4 })
    ).rejects.toThrow('不合法');
    await syncLearningOperations(
      db,
      'u1',
      [
        {
          id: 'new',
          type: 'message.add',
          at: Date.now(),
          data: { conversationId: 'history-c', role: 'user', content: '新消息' }
        }
      ],
      'Asia/Shanghai'
    );
    await expect(
      readLearningHistoryPages(db, 'u1', { revision: 10, generation: wire.history.generation, offset: 0, count: 3 })
    ).rejects.toThrow('已更新');
  });
  it('压缩版本上的隐私墓碑原子替换正文，旧压缩/HTTP页不残留为历史记录', async () => {
    let state = structuredClone(large);
    const marker = 'TEST_ONLY_PRIVATE_DELETE_HISTORY';
    state = applyLearningOperation(state, {
      id: 'm',
      type: 'material.add',
      at: Date.now(),
      data: { material: parsePastedMaterial(marker, 'm1') }
    }).state;
    const { db, rows, id } = database(await encodeServerHistory(state, 'u1'));
    const result = await syncLearningOperations(
      db,
      'u1',
      [{ id: 'delete', type: 'material.delete', at: Date.now(), data: { materialId: 'm1', questionKeys: [] } }],
      'Asia/Shanghai'
    );
    expect(result.state.materials).toHaveLength(0);
    expect(JSON.stringify(await decodeServerHistory(rows.get(id).state, 'u1'))).not.toContain(marker);
    expect(rows.size).toBe(1);
  });
});
