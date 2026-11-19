// The only door from web code to the shared zod schemas (an ESLint rule keeps
// value imports of `@heremita/shared` here). Pages without a form never import
// it, so zod stays out of their first-load JavaScript; constants, option lists
// and API routes come from the zod-free `@heremita/shared/plain` and
// `@heremita/shared/api-routes`.
import './zod-jitless';

export {
  changePasswordBodySchema,
  createReportBodySchema,
  createTripBodySchema,
  deleteAccountBodySchema,
  logInBodySchema,
  putReviewBodySchema,
  signUpBodySchema,
  updateMeBodySchema,
  updateTripBodySchema,
} from '@heremita/shared';
