import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SupportConversation, ConversationStatus } from './entities/support-conversation.entity';
import { SupportMessage, SenderType } from './entities/support-message.entity';
import { SupportAuditLog, AuditAction } from './entities/support-audit-log.entity';
import { SUPPORT_QUEUE, MAX_MESSAGE_LENGTH } from './support.constants';

function sanitize(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').replace(/[<>]/g, '').trim().slice(0, MAX_MESSAGE_LENGTH);
}

// High enough that a real cart's line items are never trimmed — this only
// exists to bound a hostile/malformed websocket payload's storage size.
const MAX_CHECKOUT_PRODUCTS = 50;

/**
 * Client-supplied over the websocket, same trust level as `pageUrl` (also
 * unvalidated client input rendered as a link in the admin panel) — just
 * capped in shape/size so a malformed or hostile payload can't bloat the row.
 */
function sanitizeCheckoutProducts(
  raw: Array<{ title: string; url: string }> | undefined,
): Array<{ title: string; url: string }> | null {
  if (!Array.isArray(raw) || !raw.length) return null;
  const cleaned = raw
    .filter(
      (p): p is { title: string; url: string } =>
        !!p && typeof p.title === 'string' && typeof p.url === 'string',
    )
    .map((p) => ({
      title: sanitize(p.title).slice(0, 200),
      url: p.url.trim().slice(0, 500),
    }))
    .filter((p) => p.title && p.url)
    .slice(0, MAX_CHECKOUT_PRODUCTS);
  return cleaned.length ? cleaned : null;
}

export interface ReadResult {
  messageIds: string[];
  seenAt: Date;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface SupportAnalytics {
  totalConversations:  number;
  openConversations:   number;
  closedToday:         number;
  unresolvedCount:     number;  // open for > 24h
  avgFirstResponseMs:  number | null;
  messageVolumeByDay:  { date: string; count: number }[];
  peakHours:           { hour: number; count: number }[];
}

@Injectable()
export class SupportConversationsService {
  constructor(
    @InjectRepository(SupportConversation)
    private readonly convRepo: Repository<SupportConversation>,
    @InjectRepository(SupportMessage)
    private readonly msgRepo: Repository<SupportMessage>,
    @InjectRepository(SupportAuditLog)
    private readonly auditRepo: Repository<SupportAuditLog>,
    @InjectQueue(SUPPORT_QUEUE)
    private readonly notifQueue: Queue,
  ) {}

  // ── Guest bootstrap ────────────────────────────────────────────────────────

  // Returns existing conversation + history. Never creates a new conversation.
  async bootstrap(
    guestToken: string,
    guestName?: string,
    since?: string,
  ): Promise<{ conversation: SupportConversation | null; messages: SupportMessage[] }> {
    const conversation = await this.convRepo.findOne({ where: { guestToken } });
    if (!conversation) return { conversation: null, messages: [] };

    if (guestName && !conversation.guestName) {
      await this.convRepo.update(conversation.id, { guestName });
      conversation.guestName = guestName;
    }

    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m."conversationId" = :id', { id: conversation.id })
      .orderBy('m."createdAt"', 'ASC')
      .take(200);

    if (since) {
      qb.andWhere('m."createdAt" > :since', { since });
    }

    const messages = await qb.getMany();
    return { conversation, messages };
  }

  // Creates a new conversation and its first message atomically.
  // Called by the WebSocket gateway on the guest's first message:send event.
  async createConversationWithFirstMessage(
    guestToken: string,
    guestName: string | undefined,
    content: string,
    clientId?: string,
    pageUrl?: string,
    checkoutProducts?: Array<{ title: string; url: string }>,
  ): Promise<{ conversation: SupportConversation; message: SupportMessage & { clientId?: string } }> {
    const conversation = await this.convRepo.save(
      this.convRepo.create({
        guestToken,
        guestName: guestName ?? null,
        pageUrl:   pageUrl ?? null,
        checkoutProducts: sanitizeCheckoutProducts(checkoutProducts),
        status:    ConversationStatus.WAITING_ADMIN,
      }),
    );
    const message = await this.addMessage(conversation.id, SenderType.GUEST, content, undefined, clientId);
    const updated = await this.convRepo.findOneOrFail({ where: { id: conversation.id } });
    return { conversation: updated, message };
  }

  async countConvsWithUnread(): Promise<number> {
    const result = await this.convRepo
      .createQueryBuilder('c')
      .where('c."unreadAdminCount" > 0')
      .getCount();
    return result;
  }

  async updateGuestName(conversationId: string, guestName: string): Promise<void> {
    await this.convRepo.update(conversationId, { guestName });
  }

  // ── Messaging ──────────────────────────────────────────────────────────────

  async addMessage(
    conversationId: string,
    senderType: SenderType,
    rawContent: string,
    senderId?: string,
    clientId?: string,
  ): Promise<SupportMessage & { clientId?: string }> {
    const content = sanitize(rawContent);
    const message = await this.msgRepo.save(
      this.msgRepo.create({ conversationId, senderType, content, senderId: senderId ?? null }),
    );

    const now = new Date();

    if (senderType === SenderType.GUEST) {
      const conv = await this.convRepo.findOne({ where: { id: conversationId } });
      const wasClosedOrArchived =
        conv?.status === ConversationStatus.CLOSED ||
        conv?.status === ConversationStatus.ARCHIVED;

      await this.convRepo.update(conversationId, {
        lastMessageAt:    now,
        unreadAdminCount: () => '"unreadAdminCount" + 1',
        status:           ConversationStatus.WAITING_ADMIN,
        // Auto-reopen: clear resolvedAt when a closed conversation gets a new guest message
        ...(wasClosedOrArchived ? { resolvedAt: null, archivedAt: null } : {}),
      });

      await this.notifQueue.add(
        'notify-admin',
        { conversationId },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 50, removeOnFail: 20 },
      );
    } else if (senderType === SenderType.ADMIN) {
      const conv = await this.convRepo.findOne({ where: { id: conversationId } });
      await this.convRepo.update(conversationId, {
        lastMessageAt:     now,
        unreadGuestCount:  () => '"unreadGuestCount" + 1',
        status:            ConversationStatus.WAITING_GUEST,
        // Record first admin response time for analytics
        ...(conv && !conv.firstResponseAt ? { firstResponseAt: now } : {}),
      });
    }

    return { ...message, ...(clientId ? { clientId } : {}) };
  }

  // ── Seen / read system ─────────────────────────────────────────────────────

  async markMessagesRead(
    conversationId: string,
    readerType: 'admin' | 'guest',
  ): Promise<ReadResult> {
    const senderTypeToMark = readerType === 'admin' ? SenderType.GUEST : SenderType.ADMIN;
    const seenAt = new Date();

    const result = await this.msgRepo
      .createQueryBuilder()
      .update()
      .set({ readAt: seenAt })
      .where('"conversationId" = :cid AND "senderType" = :st AND "readAt" IS NULL', {
        cid: conversationId,
        st:  senderTypeToMark,
      })
      .returning('id')
      .execute();

    const messageIds: string[] = (result.raw as { id: string }[]).map(r => r.id);

    if (readerType === 'admin') {
      await this.convRepo.update(conversationId, { unreadAdminCount: 0 });
    } else {
      await this.convRepo.update(conversationId, { unreadGuestCount: 0 });
    }

    return { messageIds, seenAt };
  }

  // ── Admin CRUD ─────────────────────────────────────────────────────────────

  async listForAdmin(filters: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ conversations: SupportConversation[]; total: number }> {
    const qb = this.convRepo
      .createQueryBuilder('c')
      .orderBy('c.lastMessageAt', 'DESC', 'NULLS LAST');

    // Exclude archived from default listing
    if (filters.status === 'archived') {
      qb.andWhere('c.archivedAt IS NOT NULL');
    } else {
      qb.andWhere('c.archivedAt IS NULL');
      if (filters.status && filters.status !== 'all') {
        qb.andWhere('c.status = :status', { status: filters.status });
      }
    }

    if (filters.search) {
      qb.andWhere('(c."guestToken" ILIKE :q OR c."guestName" ILIKE :q)', {
        q: `%${filters.search}%`,
      });
    }

    const limit  = Math.min(filters.limit  ?? 50, 100);
    const offset = filters.offset ?? 0;

    const [conversations, total] = await qb.skip(offset).take(limit).getManyAndCount();
    return { conversations, total };
  }

  async getByIdForAdmin(
    id: string,
  ): Promise<{ conversation: SupportConversation; messages: SupportMessage[] }> {
    const conversation = await this.convRepo.findOne({ where: { id } });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const messages = await this.msgRepo.find({
      where: { conversationId: id },
      order: { createdAt: 'ASC' },
      take: 500,
    });

    return { conversation, messages };
  }

  async assignAdmin(
    id: string,
    adminId: string | null,
    actorAdminId?: string,
  ): Promise<SupportConversation> {
    const conv = await this.convRepo.findOne({ where: { id } });
    if (!conv) throw new NotFoundException();
    await this.convRepo.update(id, { assignedAdminId: adminId });
    await this.audit(id, 'assigned', actorAdminId, { assignedAdminId: conv.assignedAdminId }, { assignedAdminId: adminId });
    return this.convRepo.findOneOrFail({ where: { id } });
  }

  async setStatus(
    id: string,
    status: ConversationStatus,
    actorAdminId?: string,
    note?: string,
  ): Promise<SupportConversation> {
    const conv = await this.convRepo.findOne({ where: { id } });
    if (!conv) throw new NotFoundException();

    const updates: Partial<SupportConversation> = { status };

    if (status === ConversationStatus.CLOSED || status === ConversationStatus.ARCHIVED) {
      updates.resolvedAt  = new Date();
      if (status === ConversationStatus.ARCHIVED) updates.archivedAt = new Date();
    } else {
      // Reopening
      updates.resolvedAt = null;
    }

    await this.convRepo.update(id, updates);

    const action: AuditAction = status === 'archived' ? 'conversation_archived' : 'status_changed';
    await this.audit(id, action, actorAdminId, { status: conv.status }, { status }, note);

    return this.convRepo.findOneOrFail({ where: { id } });
  }

  async deleteConversation(id: string, actorAdminId?: string): Promise<void> {
    const conv = await this.convRepo.findOne({ where: { id } });
    if (!conv) throw new NotFoundException('Conversation not found');
    await this.audit(id, 'conversation_deleted', actorAdminId, { guestToken: conv.guestToken, status: conv.status }, null);
    await this.convRepo.remove(conv);
  }

  async autoCloseConversations(olderThanHours: number): Promise<string[]> {
    const threshold = new Date(Date.now() - olderThanHours * 3_600_000);

    const staleStatuses = [
      ConversationStatus.OPEN,
      ConversationStatus.WAITING_ADMIN,
      ConversationStatus.WAITING_GUEST,
    ];

    const convs = await this.convRepo
      .createQueryBuilder('c')
      .where('c.status IN (:...statuses)', { statuses: staleStatuses })
      .andWhere('c."archivedAt" IS NULL')
      .andWhere(
        '(c."lastMessageAt" < :threshold OR (c."lastMessageAt" IS NULL AND c."createdAt" < :threshold))',
        { threshold },
      )
      .getMany();

    const closedIds: string[] = [];

    for (const conv of convs) {
      await this.convRepo.update(conv.id, {
        status:     ConversationStatus.CLOSED,
        resolvedAt: new Date(),
      });
      await this.msgRepo.save(
        this.msgRepo.create({
          conversationId: conv.id,
          senderType:     SenderType.SYSTEM,
          content:        'auto_closed',  // translated by the frontend
        }),
      );
      await this.audit(conv.id, 'auto_closed', null, { status: conv.status }, { status: ConversationStatus.CLOSED });
      closedIds.push(conv.id);
    }

    return closedIds;
  }

  // ── Counts ─────────────────────────────────────────────────────────────────

  async getUnreadCount(): Promise<number> {
    const result = await this.convRepo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c."unreadAdminCount"), 0)', 'total')
      .where('c."archivedAt" IS NULL')
      .getRawOne<{ total: string }>();
    return parseInt(result?.total ?? '0', 10) || 0;
  }

  async getByGuestToken(guestToken: string): Promise<SupportConversation | null> {
    return this.convRepo.findOne({ where: { guestToken } });
  }

  // ── Analytics ──────────────────────────────────────────────────────────────

  async getAnalytics(): Promise<SupportAnalytics> {
    const [total, open, closedToday, unresolved, avgFirstResp, volumeRaw, peakRaw] =
      await Promise.all([
        this.convRepo.count(),
        this.convRepo.count({ where: [
          { status: ConversationStatus.OPEN,          archivedAt: null },
          { status: ConversationStatus.WAITING_ADMIN, archivedAt: null },
          { status: ConversationStatus.WAITING_GUEST, archivedAt: null },
        ] as any }),
        this.convRepo
          .createQueryBuilder('c')
          .where("c.status = 'closed' AND c.\"resolvedAt\"::date = CURRENT_DATE")
          .getCount(),
        this.convRepo
          .createQueryBuilder('c')
          .where('c.status != :closed AND c.status != :archived', {
            closed: ConversationStatus.CLOSED, archived: ConversationStatus.ARCHIVED,
          })
          .andWhere('c."createdAt" < :cutoff', { cutoff: new Date(Date.now() - 86_400_000) })
          .getCount(),
        this.convRepo
          .createQueryBuilder('c')
          .select('AVG(EXTRACT(EPOCH FROM (c."firstResponseAt" - c."createdAt")) * 1000)', 'avgMs')
          .where('c."firstResponseAt" IS NOT NULL')
          .getRawOne<{ avgMs: string }>(),
        this.msgRepo
          .createQueryBuilder('m')
          .select("TO_CHAR(m.\"createdAt\"::date, 'YYYY-MM-DD')", 'date')
          .addSelect('COUNT(*)', 'count')
          .where("m.\"createdAt\" > NOW() - INTERVAL '30 days'")
          .groupBy("TO_CHAR(m.\"createdAt\"::date, 'YYYY-MM-DD')")
          .orderBy('date', 'ASC')
          .getRawMany<{ date: string; count: string }>(),
        this.msgRepo
          .createQueryBuilder('m')
          .select('EXTRACT(HOUR FROM m."createdAt")', 'hour')
          .addSelect('COUNT(*)', 'count')
          .where('m."senderType" = :type', { type: SenderType.GUEST })
          .andWhere("m.\"createdAt\" > NOW() - INTERVAL '30 days'")
          .groupBy('EXTRACT(HOUR FROM m."createdAt")')
          .orderBy('hour', 'ASC')
          .getRawMany<{ hour: string; count: string }>(),
      ]);

    return {
      totalConversations: total,
      openConversations:  open,
      closedToday,
      unresolvedCount:    unresolved,
      avgFirstResponseMs: avgFirstResp?.avgMs ? Math.round(Number(avgFirstResp.avgMs)) : null,
      messageVolumeByDay: volumeRaw.map(r  => ({ date: r.date,         count: parseInt(r.count,  10) })),
      peakHours:          peakRaw.map(r    => ({ hour: parseInt(r.hour, 10), count: parseInt(r.count, 10) })),
    };
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async audit(
    conversationId: string,
    action: AuditAction,
    adminId: string | null | undefined,
    previousValue: Record<string, unknown> | null,
    newValue: Record<string, unknown> | null,
    note?: string,
  ): Promise<void> {
    await this.auditRepo.save(
      this.auditRepo.create({
        conversationId,
        adminId: adminId ?? null,
        action,
        previousValue,
        newValue,
        note: note ?? null,
      }),
    );
  }
}
