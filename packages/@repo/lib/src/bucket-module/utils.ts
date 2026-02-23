import { S3Bucket } from "./s3-storage.js";

export const pathGenerator = {
  asset: {
    base: "image/assets",
    supportImage: "image/assets/bemyguest_support.png",
  },
  profile: (userId: string) => `user/${userId}/profile`,
};

export const defaultAvatarUrl = `${S3Bucket.getAwsUrl("image/assets/avatar_image.png")}`;
