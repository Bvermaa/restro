import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  getChatContacts,
  getDirectMessages,
  sendDirectMessage,
} from '../controllers/chat.controller';

const router = Router();

router.use(authenticate);

router.get('/contacts', getChatContacts);
router.get('/messages/:userId', getDirectMessages);
router.post('/messages', sendDirectMessage);

export default router;
