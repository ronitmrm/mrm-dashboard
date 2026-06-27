/* global process */

import { generateKeyPairSync } from "node:crypto"

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicExponent: 0x10001,
})

const privatePem = privateKey.export({
  type: "pkcs8",
  format: "pem",
})
const publicJwk = publicKey.export({
  format: "jwk",
})
const { kty, n, e } = publicJwk

if (typeof privatePem !== "string" || !kty || !n || !e) {
  throw new Error("Failed to generate Convex Auth signing keys.")
}

const jwtPrivateKey = privatePem.trimEnd().replace(/\r?\n/g, " ")
const jwks = JSON.stringify({
  keys: [
    {
      use: "sig",
      alg: "RS256",
      kty,
      n,
      e,
    },
  ],
})

process.stdout.write(`JWT_PRIVATE_KEY="${jwtPrivateKey}"\n`)
process.stdout.write(`JWKS=${jwks}\n`)
