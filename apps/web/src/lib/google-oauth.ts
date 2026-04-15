import { google } from "googleapis"
import { query, execute } from "@/lib/db"

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
]

export function createOAuth2Client(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri ?? `http://hub.pusulanet.net:4242/api/mail/auth/callback`
  )
}

interface TokenRow {
  AccessToken: string
  RefreshToken: string
  ExpiresAt: string
  Email: string | null
}

export async function getStoredTokens(userId = "Admin"): Promise<TokenRow | null> {
  const rows = await query<TokenRow[]>`
    SELECT AccessToken, RefreshToken,
           CONVERT(NVARCHAR(30), ExpiresAt, 120) AS ExpiresAt,
           Email
    FROM UserGoogleTokens WHERE UserId = ${userId}
  `
  return rows[0] ?? null
}

export async function saveTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: Date,
  email: string | null
) {
  const existing = await query<{ c: number }[]>`
    SELECT COUNT(*) AS c FROM UserGoogleTokens WHERE UserId = ${userId}
  `
  if (existing[0].c > 0) {
    await execute`
      UPDATE UserGoogleTokens SET
        AccessToken  = ${accessToken},
        RefreshToken = ${refreshToken},
        ExpiresAt    = ${expiresAt.toISOString()},
        Email        = ${email},
        UpdatedAt    = GETDATE()
      WHERE UserId = ${userId}
    `
  } else {
    await execute`
      INSERT INTO UserGoogleTokens (UserId, AccessToken, RefreshToken, ExpiresAt, Email)
      VALUES (${userId}, ${accessToken}, ${refreshToken}, ${expiresAt.toISOString()}, ${email})
    `
  }
}

/** Geçerli bir OAuth2 client döner; token süresi dolmuşsa otomatik yeniler */
export async function getAuthorizedClient(userId = "Admin") {
  const tokens = await getStoredTokens(userId)
  if (!tokens) return null

  const client = createOAuth2Client()
  client.setCredentials({
    access_token:  tokens.AccessToken,
    refresh_token: tokens.RefreshToken,
    expiry_date:   new Date(tokens.ExpiresAt).getTime(),
  })

  // Token süresi dolmak üzereyse yenile
  const expiresAt = new Date(tokens.ExpiresAt).getTime()
  if (Date.now() > expiresAt - 60_000) {
    try {
      const { credentials } = await client.refreshAccessToken()
      await saveTokens(
        userId,
        credentials.access_token!,
        credentials.refresh_token ?? tokens.RefreshToken,
        new Date(credentials.expiry_date!),
        tokens.Email
      )
      client.setCredentials(credentials)
    } catch {
      return null
    }
  }

  return client
}
