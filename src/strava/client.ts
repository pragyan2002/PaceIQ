import "dotenv/config";

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const STRAVA_REFRESH_TOKEN = process.env.STRAVA_REFRESH_TOKEN;

if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REFRESH_TOKEN) {
  throw new Error(
    "Missing Strava credentials. Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN in .env"
  );
}

export interface StravaActivity {
  id: number;
  name: string;
  start_date: string;
  distance: number; // metres
  moving_time: number; // seconds
  average_heartrate: number | null;
  total_elevation_gain: number;
  type: string;
}

interface TokenResponse {
  access_token: string;
  expires_at: number;
  refresh_token: string;
  token_type: string;
}

/**
 * Exchange the refresh token for a short-lived access token.
 */
export async function getAccessToken(): Promise<string> {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token: STRAVA_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Strava token exchange failed (${response.status}): ${body}`
    );
  }

  const data = (await response.json()) as TokenResponse;
  return data.access_token;
}

/**
 * Fetch all activities after a given Unix timestamp.
 * Paginates with per_page=100 until no more results.
 */
export async function getActivities(
  accessToken: string,
  after: number
): Promise<StravaActivity[]> {
  const all: StravaActivity[] = [];
  let page = 1;

  while (true) {
    const url = new URL("https://www.strava.com/api/v3/athlete/activities");
    url.searchParams.set("after", String(after));
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Strava API error (${response.status}): ${body}`
      );
    }

    const activities = (await response.json()) as StravaActivity[];
    if (activities.length === 0) break;

    all.push(...activities);
    page++;
  }

  return all;
}
