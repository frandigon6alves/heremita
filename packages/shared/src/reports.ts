import { z } from 'zod';
import { cursorSchema, idSchema, limitQuery, timestampSchema, userCardSchema } from './common.js';
import { LIMITS } from './limits.js';
import { REPORT_REASONS, REPORT_STATUSES } from './options.js';
import { textSchema } from './text.js';

export const reportReasonSchema = z.enum(REPORT_REASONS);

export const reportTargetTypeSchema = z.enum(['review', 'trip']);
export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>;

export const reportStatusSchema = z.enum(REPORT_STATUSES);

export const createReportBodySchema = z
  .strictObject({
    target: z.strictObject({ type: reportTargetTypeSchema, id: idSchema }),
    reason: reportReasonSchema,
    details: textSchema(0, LIMITS.REPORT_DETAILS_MAX).optional(),
  })
  .meta({ id: 'CreateReportBody' });
export type CreateReportBody = z.input<typeof createReportBodySchema>;

/** Body of 201 responses that return only the new resource id. */
export const createdIdSchema = z.object({ id: idSchema }).meta({ id: 'CreatedId' });
export type CreatedId = z.infer<typeof createdIdSchema>;

/** `excerpt`: the first characters of the review body or the trip title. */
export const reportItemSchema = z
  .object({
    id: idSchema,
    target: z.object({
      type: reportTargetTypeSchema,
      id: idSchema,
      excerpt: z.string().max(LIMITS.REPORT_EXCERPT_MAX),
    }),
    contentStatus: z.enum(['visible', 'hidden']),
    reason: reportReasonSchema,
    details: z.string().nullable(),
    status: reportStatusSchema,
    reporter: userCardSchema.nullable(),
    createdAt: timestampSchema,
    resolvedAt: timestampSchema.nullable(),
  })
  .meta({ id: 'ReportItem' });
export type ReportItem = z.infer<typeof reportItemSchema>;

export const moderationDecisionSchema = z.enum(['hide_content', 'restore_content', 'dismiss']);
export type ModerationDecision = z.infer<typeof moderationDecisionSchema>;

export const moderationDecisionBodySchema = z
  .strictObject({ decision: moderationDecisionSchema })
  .meta({ id: 'ModerationDecisionBody' });
export type ModerationDecisionBody = z.input<typeof moderationDecisionBodySchema>;

export const reportStatusQuerySchema = z.strictObject({
  status: reportStatusSchema.default('open'),
  limit: limitQuery(LIMITS.PAGE_SIZES.moderation.max, LIMITS.PAGE_SIZES.moderation.default),
  cursor: cursorSchema.optional(),
});
export type ReportStatusQuery = z.input<typeof reportStatusQuerySchema>;
