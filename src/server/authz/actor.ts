export type UserActor = {
  kind: "user";
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isPlatformAdmin: boolean;
};

export type Actor = { kind: "anonymous" } | UserActor;

export const anonymous: Actor = { kind: "anonymous" };
