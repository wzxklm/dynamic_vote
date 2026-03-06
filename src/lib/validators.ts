import { z } from "zod";

export const voteSchema = z
  .object({
    isBlocked: z.boolean(),
    org: z.string().min(1).max(100),
    asn: z.string().regex(/^AS\d+$/i, "ASN 格式需为 AS + 数字").transform((val) => val.toUpperCase()),
    usage: z.enum(["proxy", "website"]),
    protocol: z.string().min(1).max(100).nullable(),
    keyConfig: z.string().min(1).max(100).nullable(),
    count: z.number().int().min(1).max(100).default(1),
    fingerprint: z.string().regex(/^[a-f0-9]{32}$/),
  })
  .refine(
    (data) => {
      if (data.usage === "proxy") return !!data.protocol && !!data.keyConfig;
      if (data.usage === "website")
        return data.protocol === null && data.keyConfig === null;
      return false;
    },
    {
      message:
        "usage=proxy 时 protocol/keyConfig 必填；usage=website 时必须为 null",
    }
  );

export const ipLookupSchema = z.object({
  ip: z.string().ip(),
});

export type VoteFormData = z.infer<typeof voteSchema>;
export type IpLookupInput = z.infer<typeof ipLookupSchema>;
