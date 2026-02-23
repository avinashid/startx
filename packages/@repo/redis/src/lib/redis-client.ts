import { Redis } from "ioredis";

export const redisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
});

function setEventListeners() {
  redisClient.on("error", (error: string) => {
    console.log("Could not establish a connection with redis. " + error);
  });
  redisClient.on("connect", (error: string) => {
    if (error) {
      console.log("Could not establish a connection with redis. " + error);
    }
    console.log("Connected to redis successfully");
  });
}

setEventListeners();

