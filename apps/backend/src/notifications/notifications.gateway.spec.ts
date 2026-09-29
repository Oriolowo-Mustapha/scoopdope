import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NotificationsGateway } from './notifications.gateway';
import { Notification } from './notification.entity';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let notificationRepo: jest.Mocked<Repository<Notification>>;
  let jwtService: jest.Mocked<JwtService>;
  let mockServer: any;
  let client: any;

  beforeEach(() => {
    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
    client = {
      id: 'sock1',
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      handshake: { auth: { token: 'test-token' } },
    };

    notificationRepo = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<Notification>>;

    jwtService = {
      verify: jest.fn().mockReturnValue({ sub: 'user-1' }),
    } as unknown as jest.Mocked<JwtService>;

    gateway = new NotificationsGateway(
      jwtService,
      { get: jest.fn() } as unknown as ConfigService,
      notificationRepo,
    );
    (gateway as any).server = mockServer;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('emits notifications:init with all notifications on connect', async () => {
      const allNotifications = [
        { id: '1', userId: 'user-1', type: 'enrollment', message: 'Welcome', isRead: true, createdAt: new Date() },
        { id: '2', userId: 'user-1', type: 'completion', message: 'Done', isRead: false, createdAt: new Date() },
      ];
      notificationRepo.find.mockResolvedValue(allNotifications);

      await gateway.handleConnection(client as any);

      expect(client.emit).toHaveBeenCalledWith('notifications:init', allNotifications);
    });

    it('re-emits unread notifications as individual notification events on reconnect', async () => {
      const allNotifications = [
        { id: '1', userId: 'user-1', type: 'enrollment', message: 'Read already', isRead: true, createdAt: new Date() },
        { id: '2', userId: 'user-1', type: 'completion', message: 'Unread', isRead: false, createdAt: new Date() },
      ];
      const unreadNotifications = [allNotifications[1]];

      notificationRepo.find
        .mockResolvedValueOnce(allNotifications) // notifications:init
        .mockResolvedValueOnce(unreadNotifications); // unread for re-delivery

      await gateway.handleConnection(client as any);

      // notifications:init gets all notifications
      expect(client.emit).toHaveBeenCalledWith('notifications:init', allNotifications);
      // Unread notifications are re-emitted individually as 'notification' events
      expect(client.emit).toHaveBeenCalledWith('notification', unreadNotifications[0]);
      // Read notifications must NOT be re-emitted
      expect(client.emit).not.toHaveBeenCalledWith('notification', allNotifications[0]);
    });

    it('does not re-emit notification events when there are no unread notifications', async () => {
      const allNotifications = [
        { id: '1', userId: 'user-1', type: 'enrollment', message: 'Read', isRead: true, createdAt: new Date() },
      ];
      notificationRepo.find.mockResolvedValue(allNotifications);

      await gateway.handleConnection(client as any);

      expect(client.emit).toHaveBeenCalledWith('notifications:init', allNotifications);
      // No additional 'notification' emits since all are read
      expect(client.emit).toHaveBeenCalledTimes(1);
    });

    it('disconnects client when token is missing', async () => {
      const badClient = { ...client, handshake: { auth: {} } };
      await gateway.handleConnection(badClient as any);
      expect(badClient.disconnect).toHaveBeenCalled();
    });

    it('disconnects client when token is invalid', async () => {
      jwtService.verify.mockImplementation(() => { throw new Error('Invalid token'); });
      await gateway.handleConnection(client as any);
      expect(client.disconnect).toHaveBeenCalled();
    });
  });
});