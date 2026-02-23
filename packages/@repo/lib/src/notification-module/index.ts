// import db from "@repo/db";
// import {
//   notificationsTable,
//   notificationTypeEnum,
//   userDetails,
// } from "@repo/db/schema";
// import { desc, eq, inArray, sql } from "drizzle-orm";
// import { FcmPayload, PushNotificationManager } from "./push-notification.js";
// import logger from "../logger-module/logger.js";

// export type CreateNotificationPayload = {
//   title: string;
//   inAppTitle?: string;
//   userId: string;
//   description?: string;
//   type: (typeof notificationTypeEnum.enumValues)[number][];
//   url?: string;
//   image?: string;
//   data: any;
// };

// export class NotificationModule {
//   /**
//    * Updates the user's FCM token
//    * @param userID the id of the user
//    * @param fcmToken the FCM token to be updated
//    * @throws if the update fails
//    */
//   static async uploadFcmToken(userID: string, fcmToken: string) {
//     try {
//       await db
//         .update(userDetails)
//         .set({ fcmToken })
//         .where(eq(userDetails.userId, userID));
//     } catch (error) {
//       throw error;
//     }
//   }
//   /**
//    * Mark the given notification IDs as read
//    * @param notificationIds the IDs of the notifications to mark as read
//    * @throws if the update fails
//    */
//   static async markAsRead(notificationIds: string[]) {
//     try {
//       await db
//         .update(notificationsTable)
//         .set({ read: true })
//         .where(inArray(notificationsTable.id, notificationIds));
//     } catch (error) {
//       throw error;
//     }
//   }
//   /**
//    * Send a notification to a user
//    * @param payload the notification payload
//    * @throws if either the in-app notification or the push notification fails
//    */
//   static async sendNotification(
//     payload: CreateNotificationPayload,
//     options: { push?: boolean; inApp?: boolean } = { push: true, inApp: true }
//   ) {
//     try {
//       if (options.inApp)
//         await NotificationModule.sendInAppNotification(payload);
//       if (options.push) await NotificationModule.sendPushNotification(payload);
//     } catch (error) {
//       throw error;
//     }
//   }
//   /**
//    * Sends an in-app notification by inserting a new record into the notifications table.
//    *
//    * @param payload - The notification payload containing details such as title, userId, description, type, url, image, and data.
//    * @throws if the database insert operation fails
//    */

//   static async sendInAppNotification(payload: CreateNotificationPayload) {
//     await db.insert(notificationsTable).values({
//       title: payload.inAppTitle || payload.title,
//       userId: payload.userId,
//       // description: payload.description,
//       type: payload.type,
//       url: payload.url,
//       image: payload.image,
//       data: { ...payload.data, url: payload.url, type: payload.type },
//     });
//   }

//   /**
//    * Sends a push notification using the FCM token associated with the given user ID.
//    *
//    * @param payload - The notification payload containing details such as title, userId, description, type, url, image, and data.
//    * @throws if the database query for the FCM token fails or if the FCM token is not found
//    */
//   static async sendPushNotification(payload: CreateNotificationPayload) {
//     const [user] = await db
//       .select({
//         fcmToken: userDetails.fcmToken,
//         allowNotifications: userDetails.notifications,
//       })
//       .from(userDetails)
//       .where(eq(userDetails.userId, payload.userId));
//     if (!user?.fcmToken) {
//       logger.error("No FCM token found");
//       return;
//     }
//     if (!user.allowNotifications) {
//       logger.info("User does not allow notifications");
//       return;
//     }
//     PushNotificationManager.sendNotification([
//       {
//         notification: {
//           body: payload.description,
//           title: removeCurlyBraces(payload.title),
//         },
//         token: user.fcmToken,
//         data: {
//           ...payload.data,
//           url: payload.url,
//           type: JSON.stringify(payload.type),
//         },
//       },
//     ]);
//   }

//   static async sendBulkNotification(
//     userIds: string[],
//     payload: Omit<CreateNotificationPayload, "userId">
//   ) {
//     await db.insert(notificationsTable).values(
//       userIds.map((userId) => ({
//         title: payload.title,
//         userId: userId,
//         description: payload.description,
//         type: payload.type,
//         url: payload.url,
//         image: payload.image,
//         data: { ...payload.data, url: payload.url, type: payload.type },
//       }))
//     );
//     const users = await db
//       .select({
//         fcmToken: userDetails.fcmToken,
//         allowNotifications: userDetails.notifications,
//       })
//       .from(userDetails)
//       .where(inArray(userDetails.userId, userIds));
//     await PushNotificationManager.sendNotification(
//       users
//         .filter((u) => u.fcmToken && u.allowNotifications)
//         .map((u) => ({
//           notification: {
//             body: payload.description,
//             title: removeCurlyBraces(payload.title),
//           },
//           token: u.fcmToken!,
//           data: {
//             ...payload.data,
//             url: payload.url,
//             type: JSON.stringify(payload.type),
//           },
//         }))
//     );
//   }
// }

// function removeCurlyBraces(text: string) {
//   // The regular expression captures the text between '{{' and '}}'
//   return text.replace(/\{\{(.*?)\}\}/g, "$1");
// }
