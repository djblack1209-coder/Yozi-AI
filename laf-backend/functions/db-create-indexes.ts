/**
 * 数据库索引迁移脚本
 * B010 + B012 + B002: 为 MongoDB 集合添加必要索引
 *
 * 使用方式：
 * 1. 在 Laf 控制台的云函数中创建此函数
 * 2. 调用一次即可完成索引创建
 * 3. 索引创建是幂等操作，重复执行不会报错
 *
 * B002 更新：补充 13 个缺失集合的索引，修正 mistakes → mistake_book 集合名
 * B003 更新：修正 rankings/favorites/learning_goals 索引字段名与实际查询不匹配问题，
 *   补充 crawler_schools/crawler_meta/user_profiles/data_backups 集合索引，
 *   补充 goal_progress 复合索引，补充 users.nickname 索引
 * B004 更新：补充 9 个缺失索引（rankings 按周期查询、mistake_book 按 error_type/tags、
 *   practice_records 按 is_correct、favorites 按 source、learning_resources 文本索引+subject、
 *   users 按 total_questions），修正 rankings 过时索引
 * B005 更新：补充 10 个缺失集合索引（review_logs、email_code_attempts、pk_rooms、
 *   user_questions、user_materials、deep_corrections、user_school_favorites、
 *   admission_ratios、document_chunks、colleges），补充已有集合缺失字段索引
 *
 * @version 1.4.0
 */

import cloud from '@lafjs/cloud';
import { createLogger } from './_shared/api-response.js';
import { requireAdminAccess } from './_shared/admin-auth.js';
import {
  SECURITY_AUDIT_COLLECTION,
  SECURITY_AUDIT_RETENTION_SECONDS,
  SECURITY_AUDIT_TTL_INDEX
} from './_shared/security-audit-retention.js';

const logger = createLogger('[DbIndexes]');
const db = cloud.database();

type UserIdentityIndex = {
  key: Record<string, 1>;
  options: {
    name: string;
    unique: true;
    sparse?: true;
    partialFilterExpression?: Record<string, { $type: 'string' }>;
  };
};

// The protected standalone migration and the existing full migration share
// these definitions. Returning a copy prevents a caller from changing them.
const userIdentityIndexes: UserIdentityIndex[] = [
  {
    key: { wx_mobile_appid: 1, app_openid: 1 },
    options: {
      unique: true,
      name: 'idx_wx_mobile_identity_unique',
      partialFilterExpression: { wx_mobile_appid: { $type: 'string' }, app_openid: { $type: 'string' } }
    }
  },
  { key: { openid: 1 }, options: { unique: true, sparse: true, name: 'idx_openid_unique' } },
  { key: { h5_openid: 1 }, options: { unique: true, sparse: true, name: 'idx_h5_openid_unique' } },
  { key: { unionid: 1 }, options: { unique: true, sparse: true, name: 'idx_unionid_unique' } },
  {
    key: { wx_web_appid: 1, web_openid: 1 },
    options: {
      unique: true,
      name: 'idx_wx_web_identity_unique',
      partialFilterExpression: { wx_web_appid: { $type: 'string' }, web_openid: { $type: 'string' } }
    }
  },
  ...['apple', 'google'].map((provider) => ({
    key: { [`${provider}_client_id`]: 1, [`${provider}_sub`]: 1 } as Record<string, 1>,
    options: {
      unique: true as const,
      name: `idx_${provider}_identity_unique`,
      partialFilterExpression: {
        [`${provider}_client_id`]: { $type: 'string' as const },
        [`${provider}_sub`]: { $type: 'string' as const }
      }
    }
  })),
  { key: { phone: 1 }, options: { unique: true, sparse: true, name: 'idx_phone_unique' } }
];

export function getUserIdentityIndexes(): UserIdentityIndex[] {
  return structuredClone(userIdentityIndexes);
}

const desktopOAuthIndexes = [
  {
    key: { expires_at: 1 as const },
    options: { expireAfterSeconds: 0, name: 'idx_desktop_oauth_expiry' }
  }
];

export function getDesktopOAuthIndexes() {
  return structuredClone(desktopOAuthIndexes);
}

async function createDesktopOAuthIndexes() {
  const sessions = db.collection('desktop_oauth_sessions');
  for (const { key, options } of getDesktopOAuthIndexes()) await sessions.createIndex(key, options);
}

async function createUserIdentityIndexes() {
  const users = db.collection('users');
  for (const { key, options } of getUserIdentityIndexes()) await users.createIndex(key, options);
}

export default async function (ctx) {
  const requestId = `db_idx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    // [C3-FIX] 管理工具函数需要管理员权限
    const adminAuth = requireAdminAccess(ctx, {
      allowBodyFallback: true,
      allowJwtAdmin: false
    });
    if (!adminAuth.ok) {
      return {
        code: adminAuth.code,
        success: false,
        message: adminAuth.code === 503 ? adminAuth.message : '需要管理员权限，请提供 ADMIN_SECRET',
        requestId
      };
    }

    const scope = ctx.body?.scope;
    if (
      scope !== undefined &&
      scope !== 'all' &&
      scope !== 'user-identities' &&
      scope !== 'desktop-oauth' &&
      scope !== 'regional-auth'
    ) {
      return { code: 400, success: false, message: '索引迁移范围无效', requestId };
    }
    if (scope === 'regional-auth') {
      await createUserIdentityIndexes();
      for (const name of ['auth_confirmations', 'phone_codes'])
        await db.collection(name).createIndex({ expires_at: 1 }, { name: 'idx_auth_expiry', expireAfterSeconds: 0 });
      return { code: 0, success: true, message: '地区登录索引已配置', requestId };
    }
    if (scope === 'desktop-oauth') {
      try {
        await createDesktopOAuthIndexes();
        return { code: 0, success: true, message: '桌面授权保留期限已配置', requestId };
      } catch {
        return { code: 1, success: false, message: '桌面授权保留期限未配置', requestId };
      }
    }
    if (scope === 'user-identities') {
      try {
        await createUserIdentityIndexes();
        return {
          code: 0,
          success: true,
          message: '用户身份索引已完成',
          requestId,
          data: [{ collection: 'users(unique identities)', status: 'ok', indexes: userIdentityIndexes.length }]
        };
      } catch {
        // A duplicate-key error can include a real openid/unionid. Keep the
        // result fixed, and let the guarded operator recover a partial apply.
        return {
          code: 1,
          success: false,
          message: '用户身份索引未完成，请核对历史记录或索引定义',
          requestId,
          data: [{ collection: 'users(unique identities)', status: 'error' }]
        };
      }
    }

    const results = [];

    try {
      await createDesktopOAuthIndexes();
      results.push({ collection: 'desktop_oauth_sessions', status: 'ok', indexes: 1 });
    } catch {
      results.push({ collection: 'desktop_oauth_sessions', status: 'error', message: '桌面授权保留期限未配置' });
    }

    // ==================== 用户表索引 (B012) ====================
    try {
      const usersCol = db.collection('users');
      await usersCol.createIndex({ email: 1 }, { unique: true, sparse: true, name: 'idx_email' });
      await usersCol.createIndex({ openid: 1 }, { sparse: true, name: 'idx_openid' });
      await usersCol.createIndex({ h5_openid: 1 }, { sparse: true, name: 'idx_h5_openid' });
      await usersCol.createIndex({ unionid: 1 }, { sparse: true, name: 'idx_unionid' });
      await usersCol.createIndex({ created_at: -1 }, { name: 'idx_created_at' });
      // 补充: social-service.ts 按 nickname 正则搜索
      await usersCol.createIndex({ nickname: 1 }, { sparse: true, name: 'idx_nickname' });
      // B004: user-stats.ts 按 total_questions 排名查询
      await usersCol.createIndex({ total_questions: -1 }, { sparse: true, name: 'idx_total_questions' });
      results.push({ collection: 'users', status: 'ok', indexes: 7 });
    } catch (e) {
      results.push({ collection: 'users', status: 'error', message: e.message });
    }

    // ==================== 用户身份唯一索引（并发登录防重） ====================
    try {
      await createUserIdentityIndexes();
      results.push({ collection: 'users(unique identities)', status: 'ok', indexes: userIdentityIndexes.length });
    } catch {
      // 历史脏数据可能导致唯一索引创建失败，记录告警并允许后续索引继续执行
      results.push({
        collection: 'users(unique identities)',
        status: 'warn',
        message: '用户身份索引未完成，请核对历史记录或索引定义'
      });
    }

    // ==================== 错题本索引 (B010 - 修正: mistakes → mistake_book, userId → user_id) ====================
    try {
      const mistakeBookCol = db.collection('mistake_book');
      await mistakeBookCol.createIndex({ user_id: 1, created_at: -1 }, { name: 'idx_user_created' });
      await mistakeBookCol.createIndex(
        { user_id: 1, category: 1, created_at: -1 },
        { name: 'idx_user_category_created' }
      );
      await mistakeBookCol.createIndex({ user_id: 1, is_mastered: 1 }, { name: 'idx_user_mastered' });
      await mistakeBookCol.createIndex({ user_id: 1, _content_hash: 1 }, { name: 'idx_user_content_hash' });
      // B004: mistake-manager.ts 按 error_type 过滤
      await mistakeBookCol.createIndex(
        { user_id: 1, error_type: 1, created_at: -1 },
        { name: 'idx_user_errortype_created' }
      );
      // B004: mistake-manager.ts 按 tags 数组过滤
      await mistakeBookCol.createIndex({ user_id: 1, tags: 1, created_at: -1 }, { name: 'idx_user_tags_created' });
      results.push({ collection: 'mistake_book', status: 'ok', indexes: 6 });
    } catch (e) {
      results.push({ collection: 'mistake_book', status: 'error', message: e.message });
    }

    // ==================== 题库表索引 ====================
    try {
      const questionsCol = db.collection('questions');
      await questionsCol.createIndex({ userId: 1, category: 1 }, { name: 'idx_user_category' });
      await questionsCol.createIndex({ userId: 1, created_at: -1 }, { name: 'idx_user_created' });
      results.push({ collection: 'questions', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'questions', status: 'error', message: e.message });
    }

    // ==================== 学习目标表索引 ====================
    try {
      const goalsCol = db.collection('learning_goals');
      // 修正: 实际查询使用 user_id 而非 userId (learning-goal.ts)
      await goalsCol.createIndex({ user_id: 1, status: 1 }, { name: 'idx_user_status' });
      await goalsCol.createIndex({ user_id: 1, type: 1, status: 1 }, { name: 'idx_user_type_status' });
      await goalsCol.createIndex({ user_id: 1, created_at: -1 }, { name: 'idx_user_created' });
      results.push({ collection: 'learning_goals', status: 'ok', indexes: 3 });
    } catch (e) {
      results.push({ collection: 'learning_goals', status: 'error', message: e.message });
    }

    // ==================== 成就表索引 ====================
    try {
      const achievementsCol = db.collection('achievements');
      await achievementsCol.createIndex({ userId: 1 }, { name: 'idx_user' });
      await achievementsCol.createIndex(
        { userId: 1, achievementId: 1 },
        { unique: true, name: 'idx_user_achievement' }
      );
      results.push({ collection: 'achievements', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'achievements', status: 'error', message: e.message });
    }

    // ==================== PK 对战表索引 ====================
    try {
      const battlesCol = db.collection('pk_battles');
      await battlesCol.createIndex({ status: 1, created_at: -1 }, { name: 'idx_status_created' });
      await battlesCol.createIndex({ 'players.userId': 1, status: 1 }, { name: 'idx_player_status' });
      results.push({ collection: 'pk_battles', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'pk_battles', status: 'error', message: e.message });
    }

    // ==================== 排行榜表索引 ==================
    try {
      const rankCol = db.collection('rankings');
      // B004: 旧索引 { type: 1, score: -1 } 已过时，rank-center.ts 使用按周期的字段
      // 保留旧索引以兼容可能的其他查询，新增实际查询所需的索引
      await rankCol.createIndex({ type: 1, score: -1 }, { name: 'idx_type_score' });
      // 修正: 实际查询使用 uid 而非 userId (rank-center.ts, pk-battle.ts)
      await rankCol.createIndex({ uid: 1 }, { name: 'idx_uid' });
      // B004: rank-center.ts 按日/周/月/总分排行查询
      await rankCol.createIndex({ daily_date: 1, daily_score: -1 }, { name: 'idx_daily_date_score' });
      await rankCol.createIndex({ weekly_start: 1, weekly_score: -1 }, { name: 'idx_weekly_start_score' });
      await rankCol.createIndex({ monthly_start: 1, monthly_score: -1 }, { name: 'idx_monthly_start_score' });
      await rankCol.createIndex({ total_score: -1 }, { name: 'idx_total_score' });
      results.push({ collection: 'rankings', status: 'ok', indexes: 6 });
    } catch (e) {
      results.push({ collection: 'rankings', status: 'error', message: e.message });
    }

    // ==================== 学习小组表索引 ====================
    try {
      const groupsCol = db.collection('groups');
      await groupsCol.createIndex({ status: 1, created_at: -1 }, { name: 'idx_status_created' });
      await groupsCol.createIndex({ 'members.userId': 1 }, { name: 'idx_member_user' });
      results.push({ collection: 'groups', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'groups', status: 'error', message: e.message });
    }

    // ==================== 院校表索引 ====================
    try {
      const schoolsCol = db.collection('schools');
      await schoolsCol.createIndex({ name: 'text' }, { name: 'idx_name_text' });
      await schoolsCol.createIndex({ province: 1, is985: 1 }, { name: 'idx_province_985' });
      await schoolsCol.createIndex({ province: 1, is211: 1 }, { name: 'idx_province_211' });
      results.push({ collection: 'schools', status: 'ok', indexes: 3 });
    } catch (e) {
      results.push({ collection: 'schools', status: 'error', message: e.message });
    }

    // ==================== 专业表索引 (B015) ====================
    try {
      const majorsCol = db.collection('majors');
      await majorsCol.createIndex({ schoolId: 1, category: 1 }, { name: 'idx_school_category' });
      await majorsCol.createIndex({ schoolId: 1, degree: 1 }, { name: 'idx_school_degree' });
      await majorsCol.createIndex({ name: 'text', code: 'text' }, { name: 'idx_name_code_text' });
      results.push({ collection: 'majors', status: 'ok', indexes: 3 });
    } catch (e) {
      results.push({ collection: 'majors', status: 'error', message: e.message });
    }

    // ==================== 分数线表索引 ====================
    try {
      const scoreLinesCol = db.collection('score_lines');
      await scoreLinesCol.createIndex({ schoolId: 1, year: -1 }, { name: 'idx_school_year' });
      await scoreLinesCol.createIndex({ majorId: 1, year: -1 }, { name: 'idx_major_year' });
      results.push({ collection: 'score_lines', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'score_lines', status: 'error', message: e.message });
    }

    // ==================== 收藏表索引 ====================
    try {
      const favoritesCol = db.collection('favorites');
      // 修正: 实际查询使用 user_id/question_id 而非 userId/targetId (favorite-manager.ts)
      await favoritesCol.createIndex({ user_id: 1, created_at: -1 }, { name: 'idx_user_created' });
      await favoritesCol.createIndex({ user_id: 1, question_id: 1 }, { unique: true, name: 'idx_user_question' });
      await favoritesCol.createIndex(
        { user_id: 1, category: 1, created_at: -1 },
        { name: 'idx_user_category_created' }
      );
      // B004: favorite-manager.ts 按 source 过滤
      await favoritesCol.createIndex({ user_id: 1, source: 1, created_at: -1 }, { name: 'idx_user_source_created' });
      results.push({ collection: 'favorites', status: 'ok', indexes: 4 });
    } catch (e) {
      results.push({ collection: 'favorites', status: 'error', message: e.message });
    }

    // ==================== 验证码表索引 ====================
    try {
      const codesCol = db.collection('email_codes');
      await codesCol.createIndex({ email: 1, created_at: -1 }, { name: 'idx_email_created' });
      await codesCol.createIndex({ created_at: 1 }, { expireAfterSeconds: 600, name: 'idx_ttl_10min' });
      results.push({ collection: 'email_codes', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'email_codes', status: 'error', message: e.message });
    }

    // ==================== 邀请表索引 ====================
    try {
      const invitesCol = db.collection('invites');
      await invitesCol.createIndex({ inviterId: 1, inviteeId: 1 }, { unique: true, name: 'idx_inviter_invitee' });
      await invitesCol.createIndex({ inviteeId: 1 }, { name: 'idx_invitee' });
      results.push({ collection: 'invites', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'invites', status: 'error', message: e.message });
    }

    // ==================== 邀请统计表索引 ====================
    try {
      const inviteStatsCol = db.collection('invite_stats');
      await inviteStatsCol.createIndex({ userId: 1 }, { unique: true, name: 'idx_user' });
      results.push({ collection: 'invite_stats', status: 'ok', indexes: 1 });
    } catch (e) {
      results.push({ collection: 'invite_stats', status: 'error', message: e.message });
    }

    // ==================== B002: 以下为新增的缺失集合索引 ====================

    // ==================== 练习记录表索引 ====================
    try {
      const practiceCol = db.collection('practice_records');
      await practiceCol.createIndex({ user_id: 1, created_at: -1 }, { name: 'idx_user_created' });
      await practiceCol.createIndex({ user_id: 1, category: 1, created_at: -1 }, { name: 'idx_user_category_created' });
      // B004: answer-submit.ts 按 is_correct 过滤
      await practiceCol.createIndex(
        { user_id: 1, is_correct: 1, created_at: -1 },
        { name: 'idx_user_correct_created' }
      );
      results.push({ collection: 'practice_records', status: 'ok', indexes: 3 });
    } catch (e) {
      results.push({ collection: 'practice_records', status: 'error', message: e.message });
    }

    // ==================== 幂等记录表索引 ====================
    try {
      const idempotencyCol = db.collection('idempotency_records');
      await idempotencyCol.createIndex({ key: 1, expires_at: 1 }, { name: 'idx_key_expires' });
      await idempotencyCol.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'idx_ttl_auto' });
      results.push({ collection: 'idempotency_records', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'idempotency_records', status: 'error', message: e.message });
    }

    // ==================== 好友表索引 ====================
    try {
      const friendsCol = db.collection('friends');
      await friendsCol.createIndex({ user_id: 1, friend_id: 1 }, { unique: true, name: 'idx_user_friend' });
      await friendsCol.createIndex({ user_id: 1, status: 1 }, { name: 'idx_user_status' });
      await friendsCol.createIndex({ friend_id: 1, status: 1, created_at: -1 }, { name: 'idx_friend_status_created' });
      results.push({ collection: 'friends', status: 'ok', indexes: 3 });
    } catch (e) {
      results.push({ collection: 'friends', status: 'error', message: e.message });
    }

    // ==================== AI 好友记忆表索引 ====================
    try {
      const aiMemoryCol = db.collection('ai_friend_memory');
      await aiMemoryCol.createIndex({ user_id: 1, friend_type: 1, created_at: -1 }, { name: 'idx_user_type_created' });
      // 兼容 proxy-ai.ts 中的驼峰字段名
      await aiMemoryCol.createIndex({ userId: 1, friendType: 1 }, { name: 'idx_userId_friendType' });
      results.push({ collection: 'ai_friend_memory', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'ai_friend_memory', status: 'error', message: e.message });
    }

    // ==================== 每日统计表索引 ====================
    try {
      const dailyStatsCol = db.collection('daily_stats');
      await dailyStatsCol.createIndex({ user_id: 1, date_key: 1 }, { unique: true, name: 'idx_user_datekey' });
      await dailyStatsCol.createIndex({ user_id: 1, date: 1 }, { name: 'idx_user_date' });
      results.push({ collection: 'daily_stats', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'daily_stats', status: 'error', message: e.message });
    }

    // ==================== 目标进度表索引 ====================
    try {
      const goalProgressCol = db.collection('goal_progress');
      await goalProgressCol.createIndex({ user_id: 1, goal_type: 1, date: 1 }, { name: 'idx_user_type_date' });
      // 补充: learning-goal.ts 按 goal_id + date_key 查询
      await goalProgressCol.createIndex({ goal_id: 1, date_key: 1 }, { name: 'idx_goal_datekey' });
      await goalProgressCol.createIndex({ goal_id: 1 }, { name: 'idx_goal' });
      results.push({ collection: 'goal_progress', status: 'ok', indexes: 3 });
    } catch (e) {
      results.push({ collection: 'goal_progress', status: 'error', message: e.message });
    }

    // ==================== 学习进度表索引 ====================
    try {
      const learningProgressCol = db.collection('learning_progress');
      await learningProgressCol.createIndex(
        { user_id: 1, resource_id: 1 },
        { unique: true, name: 'idx_user_resource' }
      );
      results.push({ collection: 'learning_progress', status: 'ok', indexes: 1 });
    } catch (e) {
      results.push({ collection: 'learning_progress', status: 'error', message: e.message });
    }

    // ==================== 学习资源表索引 ====================
    try {
      const resourcesCol = db.collection('learning_resources');
      await resourcesCol.createIndex(
        { status: 1, recommend_weight: -1, view_count: -1 },
        { name: 'idx_status_recommend' }
      );
      await resourcesCol.createIndex({ status: 1, category: 1, view_count: -1 }, { name: 'idx_status_category_views' });
      await resourcesCol.createIndex(
        { status: 1, category: 1, created_at: -1 },
        { name: 'idx_status_category_created' }
      );
      // B004: learning-resource.ts 按 subject 过滤 + 关键词搜索
      await resourcesCol.createIndex({ status: 1, subject: 1, view_count: -1 }, { name: 'idx_status_subject_views' });
      await resourcesCol.createIndex({ status: 1, subject: 1, created_at: -1 }, { name: 'idx_status_subject_created' });
      // B004: 文本索引用于关键词搜索（替代 $regex 全表扫描）
      await resourcesCol.createIndex({ title: 'text', description: 'text', tags: 'text' }, { name: 'idx_search_text' });
      results.push({ collection: 'learning_resources', status: 'ok', indexes: 6 });
    } catch (e) {
      results.push({ collection: 'learning_resources', status: 'error', message: e.message });
    }

    // ==================== PK 记录表索引 ====================
    try {
      const pkRecordsCol = db.collection('pk_records');
      await pkRecordsCol.createIndex({ 'player1.uid': 1, created_at: -1 }, { name: 'idx_player1_created' });
      await pkRecordsCol.createIndex({ 'player2.uid': 1, created_at: -1 }, { name: 'idx_player2_created' });
      results.push({ collection: 'pk_records', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'pk_records', status: 'error', message: e.message });
    }

    // ==================== 资源收藏表索引 ====================
    try {
      const resFavCol = db.collection('resource_favorites');
      await resFavCol.createIndex({ user_id: 1, resource_id: 1 }, { unique: true, name: 'idx_user_resource' });
      await resFavCol.createIndex({ user_id: 1, created_at: -1 }, { name: 'idx_user_created' });
      results.push({ collection: 'resource_favorites', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'resource_favorites', status: 'error', message: e.message });
    }

    // ==================== 可疑行为表索引 ====================
    try {
      const suspiciousCol = db.collection('suspicious_behaviors');
      await suspiciousCol.createIndex({ uid: 1, created_at: -1 }, { name: 'idx_uid_created' });
      results.push({ collection: 'suspicious_behaviors', status: 'ok', indexes: 1 });
    } catch (e) {
      results.push({ collection: 'suspicious_behaviors', status: 'error', message: e.message });
    }

    // ==================== 用户封禁表索引 ====================
    try {
      const bansCol = db.collection('user_bans');
      await bansCol.createIndex({ uid: 1, expires_at: 1 }, { name: 'idx_uid_expires' });
      results.push({ collection: 'user_bans', status: 'ok', indexes: 1 });
    } catch (e) {
      results.push({ collection: 'user_bans', status: 'error', message: e.message });
    }

    // ==================== 安全审计日志表索引 (S005) ====================
    try {
      const auditCol = db.collection(SECURITY_AUDIT_COLLECTION);
      await auditCol.createIndex({ event: 1, timestamp: -1 }, { name: 'idx_event_time' });
      await auditCol.createIndex({ 'context.userId': 1, timestamp: -1 }, { name: 'idx_user_time' });
      await auditCol.createIndex({ severity: 1, timestamp: -1 }, { name: 'idx_severity_time' });
      await auditCol.createIndex(
        { created_at: 1 },
        { expireAfterSeconds: SECURITY_AUDIT_RETENTION_SECONDS, name: SECURITY_AUDIT_TTL_INDEX }
      );
      results.push({ collection: SECURITY_AUDIT_COLLECTION, status: 'ok', indexes: 4 });
    } catch (e) {
      results.push({ collection: SECURITY_AUDIT_COLLECTION, status: 'error', message: e.message });
    }

    // ==================== 补充: 爬虫院校表索引 (school-crawler-api.ts) ====================
    try {
      const crawlerSchoolsCol = db.collection('crawler_schools');
      await crawlerSchoolsCol.createIndex({ code: 1 }, { unique: true, name: 'idx_code' });
      await crawlerSchoolsCol.createIndex({ province: 1, code: 1 }, { name: 'idx_province_code' });
      await crawlerSchoolsCol.createIndex({ type: 1 }, { name: 'idx_type' });
      await crawlerSchoolsCol.createIndex({ name: 'text' }, { name: 'idx_name_text' });
      results.push({ collection: 'crawler_schools', status: 'ok', indexes: 4 });
    } catch (e) {
      results.push({ collection: 'crawler_schools', status: 'error', message: e.message });
    }

    // ==================== 补充: 爬虫元数据表索引 ====================
    try {
      const crawlerMetaCol = db.collection('crawler_meta');
      await crawlerMetaCol.createIndex({ type: 1 }, { unique: true, name: 'idx_type' });
      results.push({ collection: 'crawler_meta', status: 'ok', indexes: 1 });
    } catch (e) {
      results.push({ collection: 'crawler_meta', status: 'error', message: e.message });
    }

    // ==================== 补充: 用户画像表索引 (learning-resource.ts) ====================
    try {
      const userProfilesCol = db.collection('user_profiles');
      await userProfilesCol.createIndex({ user_id: 1 }, { unique: true, name: 'idx_user' });
      results.push({ collection: 'user_profiles', status: 'ok', indexes: 1 });
    } catch (e) {
      results.push({ collection: 'user_profiles', status: 'error', message: e.message });
    }

    // ==================== 补充: 数据备份表索引 (data-cleanup.ts) ====================
    try {
      const backupsCol = db.collection('data_backups');
      await backupsCol.createIndex({ backup_id: 1 }, { unique: true, name: 'idx_backup_id' });
      await backupsCol.createIndex({ created_at: -1 }, { name: 'idx_created' });
      results.push({ collection: 'data_backups', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'data_backups', status: 'error', message: e.message });
    }

    // ==================== [M-14 FIX] 频率限制记录表 TTL 索引 ====================
    // rate_limit_records 由 _shared/api-response.ts:checkRateLimitDistributed 使用
    // 缺少 TTL 索引会导致过期记录无限累积
    try {
      const rateLimitCol = db.collection('rate_limit_records');
      await rateLimitCol.createIndex({ key: 1, window_start: 1 }, { name: 'idx_key_window' });
      await rateLimitCol.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0, name: 'idx_ttl_auto' });
      results.push({ collection: 'rate_limit_records', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'rate_limit_records', status: 'error', message: e.message });
    }

    // ==================== [H-08 FIX] goal_progress unique 索引防并发重复 ====================
    // learning-goal.ts handleRecordProgress 使用 upsert 模式，需要 unique 索引兜底
    try {
      const goalProgressUniqueCol = db.collection('goal_progress');
      await goalProgressUniqueCol.createIndex(
        { user_id: 1, goal_type: 1, date: 1 },
        { unique: true, name: 'idx_user_type_date_unique' }
      );
      results.push({ collection: 'goal_progress (unique)', status: 'ok', indexes: 1 });
    } catch (e) {
      // 可能与已有的非 unique 索引冲突，记录但不阻断
      results.push({ collection: 'goal_progress (unique)', status: 'warn', message: e.message });
    }

    // ==================== AI课堂: lessons 集合索引 ====================
    try {
      const lessonsCol = db.collection('lessons');
      await lessonsCol.createIndex({ userId: 1, created_at: -1 }, { name: 'idx_user_created' });
      await lessonsCol.createIndex({ userId: 1, status: 1 }, { name: 'idx_user_status' });
      await lessonsCol.createIndex({ status: 1, updated_at: -1 }, { name: 'idx_status_updated' });
      results.push({ collection: 'lessons', status: 'ok', indexes: 3 });
    } catch (e) {
      results.push({ collection: 'lessons', status: 'error', message: e.message });
    }

    // ==================== AI课堂: classroom_sessions 集合索引 ====================
    try {
      const sessionsCol = db.collection('classroom_sessions');
      await sessionsCol.createIndex({ lessonId: 1, userId: 1 }, { name: 'idx_lesson_user' });
      await sessionsCol.createIndex({ userId: 1, startedAt: -1 }, { name: 'idx_user_started' });
      await sessionsCol.createIndex({ userId: 1, completedAt: 1 }, { sparse: true, name: 'idx_user_completed' });
      results.push({ collection: 'classroom_sessions', status: 'ok', indexes: 3 });
    } catch (e) {
      results.push({ collection: 'classroom_sessions', status: 'error', message: e.message });
    }

    // ==================== AI课堂: ai_grade_results 集合索引 ====================
    try {
      const gradeCol = db.collection('ai_grade_results');
      await gradeCol.createIndex({ userId: 1, created_at: -1 }, { name: 'idx_user_created' });
      await gradeCol.createIndex({ userId: 1, lessonId: 1 }, { sparse: true, name: 'idx_user_lesson' });
      await gradeCol.createIndex({ userId: 1, questionId: 1 }, { name: 'idx_user_question' });
      results.push({ collection: 'ai_grade_results', status: 'ok', indexes: 3 });
    } catch (e) {
      results.push({ collection: 'ai_grade_results', status: 'error', message: e.message });
    }

    // ==================== AI诊断: ai_diagnoses 集合索引 ====================
    try {
      const diagCol = db.collection('ai_diagnoses');
      await diagCol.createIndex({ userId: 1, created_at: -1 }, { name: 'idx_user_created' });
      await diagCol.createIndex({ userId: 1, sessionId: 1 }, { name: 'idx_user_session' });
      results.push({ collection: 'ai_diagnoses', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'ai_diagnoses', status: 'error', message: e.message });
    }

    // ==================== AI诊断: practice_session_cache 集合索引 ====================
    try {
      const sessionCacheCol = db.collection('practice_session_cache');
      await sessionCacheCol.createIndex(
        { user_id: 1, session_id: 1 },
        { unique: true, name: 'idx_user_session_unique' }
      );
      await sessionCacheCol.createIndex({ user_id: 1, diagnosis_status: 1 }, { name: 'idx_user_diag_status' });
      await sessionCacheCol.createIndex({ created_at: 1 }, { expireAfterSeconds: 7 * 24 * 3600, name: 'idx_ttl_7d' }); // 7天自动过期
      results.push({ collection: 'practice_session_cache', status: 'ok', indexes: 3 });
    } catch (e) {
      results.push({ collection: 'practice_session_cache', status: 'error', message: e.message });
    }

    // ==================== 错题本: 补充SM-2复习调度索引 ====================
    try {
      const mistakeCol = db.collection('mistake_book');
      await mistakeCol.createIndex(
        { user_id: 1, is_mastered: 1, next_review_at: 1 },
        { name: 'idx_user_review_schedule' }
      );
      await mistakeCol.createIndex(
        { user_id: 1, knowledge_point: 1, is_mastered: 1 },
        { name: 'idx_user_kp_mastered' }
      );
      results.push({ collection: 'mistake_book (SM-2)', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'mistake_book (SM-2)', status: 'error', message: e.message });
    }

    // ==================== B005: 以下为第15轮审计新增的缺失集合索引 ====================

    // ==================== review_logs 复习日志索引 [P0] ====================
    // 高频读写，FSRS 优化器需全量读取，数据增长最快的集合
    try {
      const reviewLogsCol = db.collection('review_logs');
      await reviewLogsCol.createIndex({ user_id: 1, review: -1 }, { name: 'idx_user_review' });
      await reviewLogsCol.createIndex({ user_id: 1, card_id: 1, card_type: 1 }, { name: 'idx_user_card' });
      await reviewLogsCol.createIndex({ user_id: 1, created_at: -1 }, { name: 'idx_user_created' });
      results.push({ collection: 'review_logs', status: 'ok', indexes: 3 });
    } catch (e) {
      results.push({ collection: 'review_logs', status: 'error', message: e.message });
    }

    // ==================== email_code_attempts 邮箱验证码尝试记录索引 [P0] ====================
    // 安全防护查询（防暴力破解），每次邮箱登录都执行
    try {
      const emailAttemptsCol = db.collection('email_code_attempts');
      await emailAttemptsCol.createIndex(
        { email: 1, success: 1, created_at: -1 },
        { name: 'idx_email_success_created' }
      );
      // TTL 自动清理 24 小时前的记录
      await emailAttemptsCol.createIndex({ created_at: 1 }, { expireAfterSeconds: 86400, name: 'idx_ttl_24h' });
      results.push({ collection: 'email_code_attempts', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'email_code_attempts', status: 'error', message: e.message });
    }

    // ==================== pk_rooms PK匹配房间索引 [P0] ====================
    // 实时匹配高频查询，匹配中每秒轮询
    try {
      const pkRoomsCol = db.collection('pk_rooms');
      await pkRoomsCol.createIndex(
        { status: 1, category: 1, question_count: 1, created_at: 1 },
        { name: 'idx_match_query' }
      );
      await pkRoomsCol.createIndex({ 'player1.uid': 1, status: 1 }, { name: 'idx_player1_status' });
      // TTL 自动清理 1 小时前的过期房间
      await pkRoomsCol.createIndex({ created_at: 1 }, { expireAfterSeconds: 3600, name: 'idx_ttl_1h' });
      results.push({ collection: 'pk_rooms', status: 'ok', indexes: 3 });
    } catch (e) {
      results.push({ collection: 'pk_rooms', status: 'error', message: e.message });
    }

    // ==================== user_questions 用户自定义题库索引 [P0] ====================
    // 题库管理高频分页查询
    try {
      const userQuestionsCol = db.collection('user_questions');
      await userQuestionsCol.createIndex({ userId: 1, createdAt: -1 }, { name: 'idx_user_created' });
      await userQuestionsCol.createIndex({ userId: 1, materialId: 1 }, { name: 'idx_user_material' });
      await userQuestionsCol.createIndex({ userId: 1, category: 1 }, { name: 'idx_user_category' });
      results.push({ collection: 'user_questions', status: 'ok', indexes: 3 });
    } catch (e) {
      results.push({ collection: 'user_questions', status: 'error', message: e.message });
    }

    // ==================== user_materials 用户学习资料索引 [P1] ====================
    try {
      const userMaterialsCol = db.collection('user_materials');
      await userMaterialsCol.createIndex({ userId: 1, createdAt: -1 }, { name: 'idx_user_created' });
      results.push({ collection: 'user_materials', status: 'ok', indexes: 1 });
    } catch (e) {
      results.push({ collection: 'user_materials', status: 'error', message: e.message });
    }

    // ==================== deep_corrections 深度纠错索引 [P1] ====================
    try {
      const deepCorrectionsCol = db.collection('deep_corrections');
      await deepCorrectionsCol.createIndex(
        { user_id: 1, status: 1, created_at: -1 },
        { name: 'idx_user_status_created' }
      );
      results.push({ collection: 'deep_corrections', status: 'ok', indexes: 1 });
    } catch (e) {
      results.push({ collection: 'deep_corrections', status: 'error', message: e.message });
    }

    // ==================== user_school_favorites 院校收藏索引 [P1] ====================
    try {
      const userSchoolFavCol = db.collection('user_school_favorites');
      await userSchoolFavCol.createIndex({ userId: 1, schoolId: 1 }, { unique: true, name: 'idx_user_school' });
      await userSchoolFavCol.createIndex({ userId: 1, created_at: -1 }, { name: 'idx_user_created' });
      results.push({ collection: 'user_school_favorites', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'user_school_favorites', status: 'error', message: e.message });
    }

    // ==================== admission_ratios 录取比例索引 [P1] ====================
    try {
      const admissionCol = db.collection('admission_ratios');
      await admissionCol.createIndex({ majorId: 1, year: -1 }, { name: 'idx_major_year' });
      await admissionCol.createIndex({ schoolId: 1, year: -1 }, { name: 'idx_school_year' });
      results.push({ collection: 'admission_ratios', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'admission_ratios', status: 'error', message: e.message });
    }

    // ==================== document_chunks RAG文档切片索引 [P2] ====================
    try {
      const docChunksCol = db.collection('document_chunks');
      await docChunksCol.createIndex({ user_id: 1, bank_id: 1 }, { name: 'idx_user_bank' });
      results.push({ collection: 'document_chunks', status: 'ok', indexes: 1 });
    } catch (e) {
      results.push({ collection: 'document_chunks', status: 'error', message: e.message });
    }

    // ==================== colleges 学院索引 [P2] ====================
    try {
      const collegesCol = db.collection('colleges');
      await collegesCol.createIndex({ schoolId: 1 }, { name: 'idx_school' });
      results.push({ collection: 'colleges', status: 'ok', indexes: 1 });
    } catch (e) {
      results.push({ collection: 'colleges', status: 'error', message: e.message });
    }

    // ==================== B005: 已有集合补充缺失索引 ====================

    // rankings: 乐观锁条件更新需要 uid+version 复合索引
    try {
      const rankCol2 = db.collection('rankings');
      await rankCol2.createIndex({ uid: 1, version: 1 }, { name: 'idx_uid_version' });
      results.push({ collection: 'rankings (B005)', status: 'ok', indexes: 1 });
    } catch (e) {
      results.push({ collection: 'rankings (B005)', status: 'error', message: e.message });
    }

    // schools: status 筛选 + code 唯一约束
    try {
      const schoolsCol2 = db.collection('schools');
      await schoolsCol2.createIndex({ status: 1 }, { name: 'idx_status' });
      await schoolsCol2.createIndex({ code: 1 }, { unique: true, sparse: true, name: 'idx_code_unique' });
      results.push({ collection: 'schools (B005)', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'schools (B005)', status: 'error', message: e.message });
    }

    // questions: PK对战抽题按 is_active 和 category 筛选
    try {
      const questionsCol2 = db.collection('questions');
      await questionsCol2.createIndex({ is_active: 1 }, { name: 'idx_is_active' });
      await questionsCol2.createIndex({ category: 1 }, { name: 'idx_category' });
      results.push({ collection: 'questions (B005)', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'questions (B005)', status: 'error', message: e.message });
    }

    // ==================== B006: 竞态条件防护 — 唯一复合索引 ====================
    // Round 16 审计发现 5 个关键 check-then-create 竞态漏洞，
    // 通过唯一索引从数据库层面结构性防止并发重复插入

    // rankings: 每个用户只有一条排行记录，防止并发登录创建重复记录
    try {
      const rankUniqueCol = db.collection('rankings');
      await rankUniqueCol.createIndex({ uid: 1 }, { unique: true, name: 'idx_uid_unique' });
      results.push({ collection: 'rankings (race-fix)', status: 'ok', indexes: 1 });
    } catch (e) {
      // 已有非 unique 的 idx_uid 或脏数据可能冲突，记录告警
      results.push({ collection: 'rankings (race-fix)', status: 'warn', message: (e as Error).message });
    }

    // mistake_book: 同一用户 + 同一内容哈希 = 同一道错题，禁止重复添加
    try {
      const mistakeUniqueCol = db.collection('mistake_book');
      await mistakeUniqueCol.createIndex(
        { user_id: 1, _content_hash: 1 },
        { unique: true, name: 'idx_user_content_hash_unique' }
      );
      results.push({ collection: 'mistake_book (race-fix)', status: 'ok', indexes: 1 });
    } catch (e) {
      results.push({ collection: 'mistake_book (race-fix)', status: 'warn', message: (e as Error).message });
    }

    // group_members: 同一用户不能重复加入同一学习小组
    try {
      const groupMembersCol = db.collection('group_members');
      await groupMembersCol.createIndex({ group_id: 1, user_id: 1 }, { unique: true, name: 'idx_group_user_unique' });
      await groupMembersCol.createIndex({ user_id: 1, joined_at: -1 }, { name: 'idx_user_joined' });
      results.push({ collection: 'group_members (race-fix)', status: 'ok', indexes: 2 });
    } catch (e) {
      results.push({ collection: 'group_members (race-fix)', status: 'warn', message: (e as Error).message });
    }

    // idempotency_records: 幂等键必须唯一，防止并发 PK 提交产生重复记录
    try {
      const idempotencyUniqueCol = db.collection('idempotency_records');
      await idempotencyUniqueCol.createIndex({ key: 1 }, { unique: true, name: 'idx_key_unique' });
      results.push({ collection: 'idempotency_records (race-fix)', status: 'ok', indexes: 1 });
    } catch (e) {
      results.push({ collection: 'idempotency_records (race-fix)', status: 'warn', message: (e as Error).message });
    }

    // learning_goals: 同一用户同一类型只能有一个 active 目标
    try {
      const learningGoalsUniqueCol = db.collection('learning_goals');
      await learningGoalsUniqueCol.createIndex(
        { user_id: 1, type: 1, status: 1 },
        { unique: true, name: 'idx_user_type_status_unique' }
      );
      results.push({ collection: 'learning_goals (race-fix)', status: 'ok', indexes: 1 });
    } catch (e) {
      // 如果同一用户已有多个同类型同状态的目标，唯一索引创建会失败
      results.push({ collection: 'learning_goals (race-fix)', status: 'warn', message: (e as Error).message });
    }

    const totalIndexes = results.reduce((sum, r) => sum + (r.indexes || 0), 0);
    const failedCollections = results.filter((r) => r.status === 'error');

    return {
      code: failedCollections.length > 0 ? 1 : 0,
      success: failedCollections.length === 0,
      message: `索引创建完成: ${totalIndexes} 个索引, ${results.length} 个集合, ${failedCollections.length} 个失败`,
      data: results,
      requestId
    };
  } catch (error) {
    logger.error('[db-create-indexes] 索引创建脚本异常:', error);
    return {
      code: 500,
      success: false,
      message: '索引创建脚本执行异常',
      requestId
    };
  }
}
