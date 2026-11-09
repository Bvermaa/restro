import { Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';
import { emitNotification } from '../services/socket.service';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';

// Get list of chat contacts (Owners for Admin, Admin for Owners)
export async function getChatContacts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const currentUserId = req.user!.id;
    const currentRole = req.user!.role;

    let targetRole: 'RESTAURANT_OWNER' | 'SUPER_ADMIN' = 'RESTAURANT_OWNER';
    if (currentRole === 'RESTAURANT_OWNER') {
      targetRole = 'SUPER_ADMIN';
    }

    const contacts = await prisma.user.findMany({
      where: {
        role: targetRole,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        restaurant: {
          select: {
            id: true,
            name: true,
            logo: true,
          },
        },
      },
    });

    // Calculate unread count for each contact
    const contactsWithUnread = await Promise.all(
      contacts.map(async (c) => {
        const unreadCount = await prisma.directMessage.count({
          where: {
            senderId: c.id,
            receiverId: currentUserId,
            isRead: false,
          },
        });

        const lastMessage = await prisma.directMessage.findFirst({
          where: {
            OR: [
              { senderId: currentUserId, receiverId: c.id },
              { senderId: c.id, receiverId: currentUserId },
            ],
          },
          orderBy: { createdAt: 'desc' },
          select: { message: true, createdAt: true, senderId: true },
        });

        return {
          ...c,
          unreadCount,
          lastMessage,
        };
      })
    );

    res.json({ success: true, data: { contacts: contactsWithUnread } });
  } catch (error) { next(error); }
}

// Get 1-to-1 message thread between currentUser and targetUserId
export async function getDirectMessages(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const currentUserId = req.user!.id;
    const targetUserId = req.params.userId as string;

    const messages = await prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: targetUserId },
          { senderId: targetUserId, receiverId: currentUserId },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    // Mark messages from targetUser as read
    await prisma.directMessage.updateMany({
      where: {
        senderId: targetUserId,
        receiverId: currentUserId,
        isRead: false,
      },
      data: { isRead: true },
    });

    res.json({ success: true, data: { messages } });
  } catch (error) { next(error); }
}

// Send a 1-to-1 direct message
export async function sendDirectMessage(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const senderId = req.user!.id;
    const { receiverId, message } = req.body as { receiverId: string; message: string };

    if (!receiverId || !message?.trim()) {
      throw new AppError('Receiver and message content are required.', 400, 'BAD_REQUEST');
    }

    const newMessage = await prisma.directMessage.create({
      data: {
        senderId,
        receiverId,
        message: message.trim(),
      },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
    });

    // Notify receiver via real-time Socket.io
    emitNotification(receiverId, {
      type: 'CHAT_MESSAGE',
      title: `💬 New message from ${newMessage.sender.name}`,
      message: newMessage.message,
      directMessage: newMessage,
    });

    res.status(201).json({ success: true, data: { message: newMessage } });
  } catch (error) { next(error); }
}
