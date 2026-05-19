import { Hono } from 'hono';
import { requireAuth, type AuthVars } from '../../middleware/auth.js';
import { attachTier, type TierVars } from '../../middleware/tier.js';
import { crudRouter } from './crud.js';
import { messagesRouter } from './messages.js';
import { stateRouter } from './state.js';
import { exportRouter } from './export.js';
import { searchRouter } from './search.js';
import { toolsRouter } from './tools.js';

export const sessionsRouter = new Hono<{ Variables: AuthVars & TierVars }>();
sessionsRouter.use('*', requireAuth);
sessionsRouter.use('*', attachTier);

// Static-path routers first so /quick-nav, /search, /suggest-scene
// are registered before the /:id catch-all routes.
sessionsRouter.route('/', searchRouter);
sessionsRouter.route('/', toolsRouter);
sessionsRouter.route('/', crudRouter);
sessionsRouter.route('/', messagesRouter);
sessionsRouter.route('/', stateRouter);
sessionsRouter.route('/', exportRouter);
